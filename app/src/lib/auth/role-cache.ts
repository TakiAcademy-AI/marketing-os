import { db } from '../db';

/**
 * Đọc trạng thái tài khoản (role + đã bị khoá chưa) kèm cache TTL ngắn — dành
 * cho proxy và getCurrentUser(), nơi mỗi request đều phải kiểm tra. Không cache
 * trong session (dễ stale tới 7 ngày); TTL 15s giới hạn cửa sổ stale khi admin
 * đổi role / khoá ai đó ở chỗ khác ngoài API (vd SQL tay).
 *
 * Các page/API route vẫn dùng `getUserRole()` (query trực tiếp, luôn tươi).
 *
 * Cache đặt trên globalThis giống pool ở lib/db.ts: Next bundle proxy tách khỏi
 * server bundle, nên biến module-level sẽ có 2 bản riêng và `invalidateRoleCache`
 * gọi từ API route sẽ không chạm tới cache mà proxy đang đọc.
 */
const TTL_MS = 15_000;
const MAX_ENTRIES = 500;

// userId trong cookie luôn là UUID do login ghi. Giá trị khác (cookie giả) thì
// coi như user không tồn tại — không gửi xuống Postgres để khỏi lỗi cú pháp uuid.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccountState {
  role: string;
  /** true = tài khoản đã bị khoá (team_member.disabled_at IS NOT NULL). */
  disabled: boolean;
}

type AccountCache = Map<string, { state: AccountState | null; expiresAt: number }>;

declare global {
  // eslint-disable-next-line no-var
  var __accountStateCache: AccountCache | undefined;
}

const cache: AccountCache = (globalThis.__accountStateCache ??= new Map());

/** Trạng thái tài khoản, hoặc null nếu user không còn tồn tại (đã bị xoá). */
export async function getAccountStateCached(
  userId: string
): Promise<AccountState | null> {
  if (!UUID_RE.test(userId)) return null;

  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.state;

  const res = await db.query<{ role: string; disabled: boolean }>(
    `SELECT role, disabled_at IS NOT NULL AS disabled
       FROM team_member
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  const row = res.rows[0];
  const state: AccountState | null = row
    ? { role: row.role, disabled: row.disabled }
    : null;

  if (cache.size >= MAX_ENTRIES) {
    for (const [key, value] of cache) {
      if (value.expiresAt <= now) cache.delete(key);
    }
    if (cache.size >= MAX_ENTRIES) cache.clear();
  }
  cache.set(userId, { state, expiresAt: now + TTL_MS });
  return state;
}

/**
 * Tài khoản còn dùng được không: còn tồn tại VÀ chưa bị khoá.
 * Phiên (cookie) của tài khoản không còn dùng được phải coi như không đăng nhập.
 */
export async function isAccountActive(userId: string): Promise<boolean> {
  const state = await getAccountStateCached(userId);
  return state !== null && !state.disabled;
}

/**
 * Xoá cache cho 1 user — gọi ngay sau khi admin đổi role / khoá / mở khoá / xoá
 * để hiệu lực tức thì (proxy và API route chạy chung một tiến trình).
 */
export function invalidateRoleCache(userId: string): void {
  cache.delete(userId);
}
