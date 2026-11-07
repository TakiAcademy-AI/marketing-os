// Khoá / mở khoá tài khoản thành viên (team_member.disabled_at — migration 068).
//
// Khoá ≠ xoá: giữ nguyên dòng team_member và mọi dữ liệu của người đó — kênh
// đang làm chủ (social_account.owner_member_id), gán kênh (social_account_member),
// brief, project… Cron đồng bộ kênh dùng token lưu ở social_account, không phụ
// thuộc trạng thái đăng nhập của ai, nên vẫn chạy như cũ. Khoá chỉ chặn đăng nhập
// (api/auth/login) và phiên đang mở (proxy + getCurrentUser, lib/auth/role-cache.ts).
//
// Quyền của người gọi (admin đang hoạt động) do route kiểm. Module này giữ hai
// bất biến của dữ liệu, kể cả khi bị gọi từ chỗ khác ngoài route:
//   1. Không tự khoá chính mình.
//   2. Luôn còn ít nhất một admin đang hoạt động. Kiểm trong transaction, khoá
//      (FOR UPDATE) các dòng admin đang hoạt động trước khi đếm, để hai admin
//      khoá chéo nhau cùng lúc không thể cùng thành công.
//
// Nhận Pool làm tham số (route truyền `db`) để test chạy được với DB riêng.

import type { Pool } from 'pg';

type Db = Pick<Pool, 'connect' | 'query'>;

export type LockResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'not_found' | 'self' | 'last_admin' };

export type UnlockResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'not_found' };

export async function lockTeamMember(
  pool: Db,
  { actorId, targetId }: { actorId: string; targetId: string }
): Promise<LockResult> {
  if (actorId === targetId) return { ok: false, reason: 'self' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Khoá các dòng admin đang hoạt động TRƯỚC rồi mới tới dòng đích, cùng một
    // thứ tự (ORDER BY id) ở mọi lần gọi → hai lần khoá song song xếp hàng nhau
    // thay vì deadlock. Lần đến sau đọc lại dòng đã đổi nên thấy admin vừa bị khoá.
    const activeAdmins = await client.query<{ id: string }>(
      `SELECT id
         FROM team_member
        WHERE role = 'admin' AND disabled_at IS NULL
        ORDER BY id
        FOR UPDATE`
    );

    const target = await client.query<{ role: string; disabled: boolean }>(
      `SELECT role, disabled_at IS NOT NULL AS disabled
         FROM team_member
        WHERE id = $1
        FOR UPDATE`,
      [targetId]
    );
    const row = target.rows[0];

    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }

    // Đã khoá từ trước → giữ nguyên mốc thời gian + người khoá cũ.
    if (row.disabled) {
      await client.query('ROLLBACK');
      return { ok: true, changed: false };
    }

    if (
      row.role === 'admin' &&
      !activeAdmins.rows.some((admin) => admin.id !== targetId)
    ) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'last_admin' };
    }

    await client.query(
      `UPDATE team_member
          SET disabled_at = NOW(), disabled_by = $2
        WHERE id = $1`,
      [targetId, actorId]
    );
    await client.query('COMMIT');
    return { ok: true, changed: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function unlockTeamMember(
  pool: Db,
  targetId: string
): Promise<UnlockResult> {
  const updated = await pool.query(
    `UPDATE team_member
        SET disabled_at = NULL, disabled_by = NULL
      WHERE id = $1 AND disabled_at IS NOT NULL
      RETURNING id`,
    [targetId]
  );
  if (updated.rowCount) return { ok: true, changed: true };

  const exists = await pool.query(`SELECT 1 FROM team_member WHERE id = $1`, [
    targetId,
  ]);
  return exists.rowCount
    ? { ok: true, changed: false }
    : { ok: false, reason: 'not_found' };
}
