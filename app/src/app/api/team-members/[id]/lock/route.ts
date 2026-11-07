// POST   /api/team-members/[id]/lock — admin khoá tài khoản 1 thành viên.
// DELETE /api/team-members/[id]/lock — admin mở khoá.
//
// Khoá ≠ xoá: dòng team_member, kênh người đó làm chủ / được gán và mọi dữ liệu
// khác giữ nguyên (xem lib/auth/account-lock.ts). Người bị khoá không đăng nhập
// được và phiên đang mở hết hiệu lực ngay: proxy + getCurrentUser() đọc
// disabled_at qua cache ≤ 15s, cache của người đó bị xoá ngay sau khi khoá.
//
// Chặn: tự khoá chính mình (cùng lý do lock-out như tự xoá / tự hạ quyền);
// khoá admin đang hoạt động cuối cùng (kiểm trong transaction).
// Mở khoá: người đó đăng nhập lại bằng mật khẩu cũ (mật khẩu không đổi).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { invalidateRoleCache } from '@/lib/auth/role-cache';
import { lockTeamMember, unlockTeamMember } from '@/lib/auth/account-lock';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const LOCK_ERRORS: Record<
  'self' | 'last_admin' | 'not_found',
  { error: string; status: number }
> = {
  self: { error: 'Không thể tự khoá tài khoản của bạn.', status: 400 },
  last_admin: { error: 'Không thể khoá admin đang hoạt động cuối cùng.', status: 409 },
  not_found: { error: 'Member not found', status: 404 },
};

/** Admin đang hoạt động + id hợp lệ, hoặc response lỗi để trả thẳng. */
async function authorize(
  context: RouteContext
): Promise<{ actorId: string; targetId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  return { actorId: user.userId, targetId: id };
}

export async function POST(
  _req: Request,
  context: RouteContext
): Promise<NextResponse> {
  const auth = await authorize(context);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await lockTeamMember(db, auth);
    if (!result.ok) {
      const { error, status } = LOCK_ERRORS[result.reason];
      return NextResponse.json({ error }, { status });
    }

    // Proxy cache trạng thái 15s — xoá ngay để phiên của người bị khoá chết tức thì.
    invalidateRoleCache(auth.targetId);
    // Nhật ký: chỉ id, không tên / email.
    console.info(
      `[team-members] lock member=${auth.targetId} by=${auth.actorId} changed=${result.changed}`
    );
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[POST /api/team-members/:id/lock]', auth.targetId, message);
    return NextResponse.json({ error: 'Không thể khoá tài khoản' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: RouteContext
): Promise<NextResponse> {
  const auth = await authorize(context);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await unlockTeamMember(db, auth.targetId);
    if (!result.ok) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    invalidateRoleCache(auth.targetId);
    console.info(
      `[team-members] unlock member=${auth.targetId} by=${auth.actorId} changed=${result.changed}`
    );
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[DELETE /api/team-members/:id/lock]', auth.targetId, message);
    return NextResponse.json({ error: 'Không thể mở khoá tài khoản' }, { status: 500 });
  }
}
