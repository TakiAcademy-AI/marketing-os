// Job — quét bài công khai của Facebook Page bằng fb-cli, cho những page đã
// MẤT QUYỀN QUẢN TRỊ (không có Page Access Token).
//
// Công tắc: social_account.fb_scrape_handle IS NOT NULL (migration 066).
//
// LẤY ĐƯỢC : danh sách bài, reactions, comments, shares → social_post +
//            post_metric_daily → lên avg_engagement_rate và tần suất đăng.
// KHÔNG BAO GIỜ LẤY ĐƯỢC: reach, impressions, clicks, video_views, follower,
//            inbox — đó là Page Insights, dữ liệu riêng tư của Page. Nhập tay
//            qua /api/channels/[id]/manual-metric nếu cần.
//
// Vì sao nhịp chậm (xem SCRAPE_DELAY_MS): fb-cli dùng session Facebook của
// người thật. Quét dồn dập là cách nhanh nhất để session bị khoá — log production
// đã từng có page bị Facebook trả về trang đăng nhập. Dưới 5 page nên chậm không sao.

import { db } from '@/lib/db';
import { fetchFbPagePosts, importFbSession, normalizePageRef } from '@/lib/news/fb-cli';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { mapScrapedPost } from '@/lib/fb-scrape/map-scraped-post';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';
import {
  upsertSocialPost,
  upsertPostMetricDaily,
  type PostMetricDailyRow,
  type SocialPostRow,
} from '@/lib/cron/upsert-helpers';

interface ScrapeAccount {
  id: string;
  name: string;
  fb_scrape_handle: string;
}

/** Số bài lấy mỗi page mỗi lượt. fb feed trả mới nhất trước. */
const POSTS_PER_PAGE = 25;

/** Giãn nhịp giữa các page để không đốt session fb-cli. */
const SCRAPE_DELAY_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadScrapeAccounts(): Promise<ScrapeAccount[]> {
  const res = await db.query<ScrapeAccount>(
    `SELECT id, name, fb_scrape_handle
       FROM social_account
      WHERE fb_scrape_handle IS NOT NULL
        AND status <> 'disconnected'
      ORDER BY name`
  );
  return res.rows;
}

/**
 * Quét 1 page. Trả số hàng metric đã upsert.
 * Tách riêng để lỗi 1 page không làm chết cả lượt.
 */
async function scrapeOneAccount(acc: ScrapeAccount): Promise<number> {
  const pageRef = normalizePageRef(acc.fb_scrape_handle);
  const raw = await fetchFbPagePosts(pageRef, POSTS_PER_PAGE);

  const mapped = raw
    .map((item) => mapScrapedPost(item))
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (mapped.length === 0) return 0;

  const postRows: SocialPostRow[] = mapped.map((m) => ({
    account_id: acc.id,
    ...m.post,
  }));
  const idMap = await upsertSocialPost(postRows);

  const metricRows: PostMetricDailyRow[] = [];
  for (const m of mapped) {
    const postId = idMap.get(m.post.external_id);
    if (!postId) continue;
    metricRows.push({ post_id: postId, ...m.metric });
  }

  return upsertPostMetricDaily(metricRows);
}

export async function runFbScrapeJob(): Promise<void> {
  let accounts: ScrapeAccount[];
  try {
    accounts = await loadScrapeAccounts();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[job-fb-scrape] Fatal: load accounts failed:', err);
    const logId = await startSyncLog('fb_scrape');
    await finishSyncLog(logId, 'failed', 0, errMsg);
    return;
  }

  console.log(`[job-fb-scrape] Processing ${accounts.length} scrape-only page(s)`);
  if (accounts.length === 0) return;

  // Nạp session TRƯỚC khi đọc feed. Không có bước này thì job chỉ chạy được khi
  // job-apify-news tình cờ đã import vào cùng FB_DATA_DIR trước đó — một phụ
  // thuộc chéo ngầm giữa hai job, hỏng lúc nào không biết.
  // Idempotent, giống hệt cách job-apify-news làm.
  //
  // Không có session thì fb-cli rơi xuống tier 0, thực tế chỉ trả 1 bài/page →
  // báo cáo vô nghĩa. Nêu rõ trong log thay vì để ra số liệu thiếu mà im lặng.
  const [cUser, xs] = await Promise.all([
    getSettingOrEnv('FB_SESSION_C_USER'),
    getSettingOrEnv('FB_SESSION_XS'),
  ]);
  if (!cUser || !xs) {
    // Nêu đích danh key nào thiếu. Gộp chung một câu thì không phân biệt được
    // "chưa nhập gì" với "nhập nửa vời", mà nửa vời là ca đã xảy ra thật:
    // UI báo "đã set" vì chỉ xét c_user, còn xs thì không vào được DB.
    const missing = [!cUser && 'FB_SESSION_C_USER', !xs && 'FB_SESSION_XS']
      .filter(Boolean)
      .join(' + ');
    console.warn(
      `[job-fb-scrape] Thiếu session Facebook: ${missing} (Settings → Tích hợp API). ` +
        'fb-cli sẽ chạy tier 0 và chỉ trả ~1 bài/page.'
    );
  } else {
    try {
      await importFbSession(cUser, xs);
    } catch (err) {
      console.warn(
        `[job-fb-scrape] fb auth import lỗi — vẫn thử đọc feed: ` +
          `${err instanceof Error ? err.message : err}`
      );
    }
  }

  let totalRecords = 0;

  for (const [i, acc] of accounts.entries()) {
    if (i > 0) await sleep(SCRAPE_DELAY_MS);

    const logId = await startSyncLog('fb_scrape', acc.id);
    try {
      const count = await scrapeOneAccount(acc);
      totalRecords += count;

      if (count === 0) {
        // KHÔNG cập nhật last_synced_at khi không lấy được gì — để kênh không
        // hiện ra "vừa đồng bộ" trong lúc thực chất đang rỗng. Đúng bài học từ
        // ca job-page-insights im lặng báo thành công với 0 dòng.
        await finishSyncLog(logId, 'failed', 0, 'Không lấy được bài nào');
        console.warn(
          `[job-fb-scrape] ${acc.name} (${acc.fb_scrape_handle}): 0 bài — ` +
            `session fb-cli có thể đã hết hạn (chạy \`fb auth import\`) hoặc page đổi slug.`
        );
        continue;
      }

      await db.query(
        `UPDATE social_account SET last_synced_at = NOW() WHERE id = $1`,
        [acc.id]
      );
      await finishSyncLog(logId, 'success', count, null);
      console.log(
        `[job-fb-scrape] ${acc.name} (${acc.fb_scrape_handle}): ${count} hàng metric`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await finishSyncLog(logId, 'failed', 0, errMsg);
      // Không gọi handleAccountError: nó đánh status='token_expired', vô nghĩa
      // với kênh quét (vốn không có token để mà hết hạn).
      console.error(`[job-fb-scrape] ${acc.name} lỗi: ${errMsg}`);
    }
  }

  console.log(`[job-fb-scrape] Done — ${totalRecords} hàng metric upserted`);
}
