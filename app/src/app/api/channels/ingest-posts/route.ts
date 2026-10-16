// POST /api/channels/ingest-posts — nhận bài của một Facebook Page do Chrome
// extension quét từ trình duyệt đã đăng nhập, lưu vào social_post +
// post_metric_daily của kênh tương ứng.
//
// VÌ SAO CẦN ĐƯỜNG NÀY:
// Page đã mất quyền quản trị thì không có Page Access Token. Quét từ server
// bằng fb-cli cũng bế tắc: session được Facebook công nhận (tier 1, `fb whoami`
// xác nhận) nhưng không page nào qua được bài đầu tiên — đo trên cả `nasa` lẫn
// page của khách, cả `fb feed` lẫn `fb page --posts`. Extension chạy trong
// Chrome thật mới có đủ cookie, header và IP mà Facebook tin.
//
// Xác thực: Bearer ADS_INGEST_TOKEN — dùng chung với extension quét Ads Library,
// vì caller là trình duyệt, không có session cookie. Route đã loại khỏi proxy
// auth (xem src/proxy.ts).
//
// Body: { handle: string, items: unknown[] } — items là story node "thô" (đã
// rút gọn phía extension). Server tự map qua mapExtensionPost: một nguồn sự
// thật cho mapping, Facebook đổi tên field thì sửa ở server, không phải bảo
// mọi người cài lại extension.
//
// Trả { received, mapped, upserted, unmappedSample } — unmappedSample để sửa
// mapper khi Comet đổi shape mà không phải đoán mò.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { mapExtensionPost } from '@/lib/fb-scrape/map-extension-post';
import { normalizePageRef } from '@/lib/news/fb-cli';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';
import {
  upsertPostMetricDaily,
  upsertSocialPost,
  type PostMetricDailyRow,
  type SocialPostRow,
} from '@/lib/cron/upsert-helpers';

export const runtime = 'nodejs';

/** Chặn payload vô lý. Một page một lượt quét không ra tới ngần này bài. */
const MAX_ITEMS = 500;

/** Số node không map được đính kèm response để còn sửa mapper. Cắt ngắn để
 *  response không phình và không vô tình tha cả dữ liệu riêng tư ra. */
const UNMAPPED_SAMPLE = 2;
const UNMAPPED_CHARS = 1200;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** So sánh token hằng-thời-gian đơn giản (tránh timing leak cơ bản). */
function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = await getSettingOrEnv('ADS_INGEST_TOKEN');
  if (!expected) {
    return json(
      { error: 'ADS_INGEST_TOKEN chưa cấu hình trên server (.env hoặc app_setting).' },
      503
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  if (!provided || !tokenEquals(provided, expected)) {
    // Log cả nhánh từ chối: không có log thì không phân biệt được "extension
    // chưa gọi" với "gọi rồi nhưng bị chặn" — đúng tình huống đã mất công đoán.
    console.warn('[ingest-posts] 401 — token sai hoặc thiếu');
    return json({ error: 'Unauthorized — token sai hoặc thiếu.' }, 401);
  }

  let body: { handle?: unknown; items?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'Body không phải JSON hợp lệ.' }, 400);
  }

  const rawHandle = typeof body.handle === 'string' ? body.handle.trim() : '';
  if (!rawHandle) {
    return json({ error: 'Thiếu `handle` — slug hoặc id của Page.' }, 400);
  }
  const handle = normalizePageRef(rawHandle);

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) {
    return json({ error: '`items` phải là mảng.' }, 400);
  }
  if (items.length > MAX_ITEMS) {
    return json({ error: `Tối đa ${MAX_ITEMS} item mỗi lần đẩy.` }, 413);
  }

  // Kênh phải tồn tại và đã khai báo quét — không tự tạo kênh từ đường này, vì
  // token ingest nằm trong extension trên máy người dùng, không phải thứ nên
  // cho phép sinh bản ghi mới trong DB.
  const acc = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM social_account
      WHERE fb_scrape_handle = $1 AND status <> 'disconnected'
      LIMIT 1`,
    [handle]
  );
  const account = acc.rows[0];
  if (!account) {
    console.warn(`[ingest-posts] 404 — chưa có kênh nào gắn page "${handle}"`);
    return json(
      {
        error: `Chưa có kênh nào gắn page "${handle}". Vào Kênh → Onboard kênh mới → Kênh thủ công và điền ô "Page Facebook để quét công khai".`,
      },
      404
    );
  }

  if (items.length === 0) {
    console.warn(
      `[ingest-posts] ${account.name} (${handle}): extension gửi 0 item — ` +
        'tab nền không thu được bài nào (Facebook chưa load, hoặc chưa đăng nhập trong Chrome đó).'
    );
    return json({ received: 0, mapped: 0, upserted: 0, channel: account.name });
  }

  const logId = await startSyncLog('fb_scrape', account.id);
  try {
    const mapped = [];
    const unmapped: string[] = [];
    for (const item of items) {
      const m = mapExtensionPost(item);
      if (m) mapped.push(m);
      else if (unmapped.length < UNMAPPED_SAMPLE) {
        unmapped.push(JSON.stringify(item).slice(0, UNMAPPED_CHARS));
      }
    }

    if (mapped.length === 0) {
      // 0 map được tức là shape đã đổi — ghi 'failed' và KHÔNG đụng
      // last_synced_at, để kênh không hiện ra "vừa đồng bộ" trong lúc rỗng.
      await finishSyncLog(logId, 'failed', 0, `0/${items.length} node map được`);
      return json({
        received: items.length,
        mapped: 0,
        upserted: 0,
        channel: account.name,
        unmappedSample: unmapped,
        hint: 'Không node nào map được — Comet có thể đã đổi shape. Gửi unmappedSample cho dev để cập nhật mapExtensionPost.',
      });
    }

    const postRows: SocialPostRow[] = mapped.map((m) => ({
      account_id: account.id,
      ...m.post,
    }));
    const idMap = await upsertSocialPost(postRows);

    const metricRows: PostMetricDailyRow[] = [];
    for (const m of mapped) {
      const postId = idMap.get(m.post.external_id);
      if (!postId) continue;
      metricRows.push({ post_id: postId, ...m.metric });
    }
    const upserted = await upsertPostMetricDaily(metricRows);

    await db.query(
      `UPDATE social_account SET last_synced_at = NOW() WHERE id = $1`,
      [account.id]
    );
    await finishSyncLog(logId, 'success', upserted, null);

    console.log(
      `[ingest-posts] ${account.name} (${handle}): ${items.length} nhận, ` +
        `${mapped.length} map, ${upserted} hàng metric`
    );

    return json({
      received: items.length,
      mapped: mapped.length,
      upserted,
      channel: account.name,
      unmappedSample: unmapped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    await finishSyncLog(logId, 'failed', 0, message);
    console.error('[ingest-posts]', message);
    return json({ error: 'Lưu bài thất bại.' }, 500);
  }
}
