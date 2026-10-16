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
import {
  fbWhoami,
  fetchFbPagePosts,
  importFbSession,
  normalizePageRef,
} from '@/lib/news/fb-cli';
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
  // noCache: fb giữ cache 15 phút. Lần đọc trước có thể đã rơi tier 0 (chưa có
  // session) và bản đó còn trong cache — không bỏ qua thì session mới vô nghĩa.
  const raw = await fetchFbPagePosts(pageRef, POSTS_PER_PAGE, true);

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
    // Import xong KHÔNG có nghĩa là Facebook chấp nhận: `auth import` chỉ ghi
    // file xuống đĩa. whoami tốn 1 request để hỏi thật. Phân biệt chỗ này mới
    // đọc được log: tier 0 trả đúng 1 bài/page, trông hệt như page ít bài.
    const me = await fbWhoami();
    if (me) {
      console.log(
        `[job-fb-scrape] Session OK (tier 1) — ${JSON.stringify(me).slice(0, 160)}`
      );
    } else {
      console.warn(
        '[job-fb-scrape] Cookie đã lưu nhưng Facebook TỪ CHỐI session (fb whoami fail). ' +
          'Đang chạy tier 0 → mỗi page chỉ lấy được 1 bài. Lấy lại c_user + xs từ ' +
          'trình duyệt đang đăng nhập, hoặc session đã hết hạn.'
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

/**
 * Quét thử MỘT handle mà KHÔNG ghi gì vào DB.
 *
 * Để trả lời được câu "page này quét ra bao nhiêu bài" trước khi tạo kênh, và
 * để tách bạch hai nguyên nhân khi chỉ lấy được 1 bài: server không phân trang
 * được (lỗi chung) hay riêng page đó bị chặn. Thiếu phép thử này thì chỉ còn
 * cách tạo kênh thật rồi xoá đi.
 *
 * Chỉ đọc: không upsert, không đụng last_synced_at, không ghi api_sync_log.
 */
export async function probeFbScrape(rawHandle: string): Promise<{
  handle: string;
  sessionTier: number | null;
  whoami: unknown;
  posts: number;
  postTypes: Record<string, number>;
  newest: string | null;
  oldest: string | null;
  error?: string;
}> {
  const handle = normalizePageRef(rawHandle);

  const [cUser, xs] = await Promise.all([
    getSettingOrEnv('FB_SESSION_C_USER'),
    getSettingOrEnv('FB_SESSION_XS'),
  ]);
  if (cUser && xs) {
    try {
      await importFbSession(cUser, xs);
    } catch {
      /* whoami bên dưới sẽ phản ánh */
    }
  }
  const me = await fbWhoami();
  const sessionTier =
    me && typeof me.tier === 'number' ? (me.tier as number) : me ? 1 : null;

  try {
    const raw = await fetchFbPagePosts(handle, POSTS_PER_PAGE, true);
    const mapped = raw
      .map((r) => mapScrapedPost(r))
      .filter((m): m is NonNullable<typeof m> => m !== null);

    const postTypes: Record<string, number> = {};
    for (const m of mapped) {
      postTypes[m.post.post_type] = (postTypes[m.post.post_type] ?? 0) + 1;
    }
    const dates = mapped
      .map((m) => m.post.published_at.toISOString())
      .sort();

    return {
      handle,
      sessionTier,
      whoami: me,
      posts: mapped.length,
      postTypes,
      newest: dates.at(-1) ?? null,
      oldest: dates[0] ?? null,
    };
  } catch (err) {
    return {
      handle,
      sessionTier,
      whoami: me,
      posts: 0,
      postTypes: {},
      newest: null,
      oldest: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
