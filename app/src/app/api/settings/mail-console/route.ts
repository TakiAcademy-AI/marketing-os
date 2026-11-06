// PUT    /api/settings/mail-console — lưu cấu hình console mail (admin only)
// DELETE /api/settings/mail-console — xoá, quay về giá trị env mặc định
//
// Cùng khuôn với /api/settings/remin: giá trị lưu mã hoá trong app_setting,
// getSettingOrEnv đọc DB trước rồi mới tới env.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import { MAIL_CONSOLE_TOKEN_KEY, MAIL_CONSOLE_URL_KEY } from '@/lib/mail-console/config';

export const runtime = 'nodejs';

const putSchema = z.object({
  url: z
    .string()
    .trim()
    .url('Phải là URL đầy đủ, ví dụ https://mail.nguyentatkiem.com/console')
    .refine((v) => /^https?:\/\//i.test(v), 'URL phải bắt đầu bằng http:// hoặc https://')
    .max(300),
  // Bỏ trống = giữ mã đang lưu. Console bỏ qua mã dưới 32 ký tự nên chặn luôn ở đây.
  token: z.string().trim().min(32, 'Mã quá ngắn (console cần ít nhất 32 ký tự)').max(500).optional(),
});

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return { userId: user.userId };
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 400 }
    );
  }

  const writes = [
    setSetting(MAIL_CONSOLE_URL_KEY, parsed.data.url, auth.userId, 'Gốc console hệ mail'),
  ];
  if (parsed.data.token) {
    writes.push(
      setSetting(MAIL_CONSOLE_TOKEN_KEY, parsed.data.token, auth.userId, 'Mã API chỉ đọc của console mail')
    );
  }
  await Promise.all(writes);

  return NextResponse.json({ ok: true, tokenSaved: Boolean(parsed.data.token) });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await Promise.all([deleteSetting(MAIL_CONSOLE_URL_KEY), deleteSetting(MAIL_CONSOLE_TOKEN_KEY)]);

  return NextResponse.json({ ok: true, note: 'Đã xoá bản ghi DB; biến môi trường (nếu có) sẽ được dùng lại.' });
}
