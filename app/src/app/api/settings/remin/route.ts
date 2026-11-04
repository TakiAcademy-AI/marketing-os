// PUT    /api/settings/remin — lưu cấu hình REMIN (admin only)
// DELETE /api/settings/remin — xoá, quay về giá trị env mặc định
//
// Giá trị lưu mã hoá trong app_setting. getSettingOrEnv đọc DB trước rồi mới
// tới env, nên sửa ở đây là ăn ngay, không phải redeploy.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import {
  REMIN_ADMIN_URL_KEY,
  REMIN_API_URL_KEY,
  REMIN_MCP_TOKEN_KEY,
} from '@/lib/remin/config';

export const runtime = 'nodejs';

/** Chỉ nhận http(s) tuyệt đối. Chặn sớm ở đây để lỗi hiện ngay trên form,
 *  thay vì để code gọi API vỡ sau này với thông báo khó hiểu. */
const httpUrl = z
  .string()
  .trim()
  .url('Phải là URL đầy đủ, ví dụ https://api.remin.ai')
  .refine((v) => /^https?:\/\//i.test(v), 'URL phải bắt đầu bằng http:// hoặc https://')
  .max(300);

const putSchema = z.object({
  apiUrl: httpUrl,
  adminUrl: httpUrl,
  // Token là tuỳ chọn: form chỉ gửi khi admin nhập mới. Bỏ trống = giữ token
  // đang lưu, để sửa URL không vô tình xoá mất token.
  mcpToken: z.string().trim().min(8, 'Token quá ngắn').max(500).optional(),
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
    setSetting(REMIN_API_URL_KEY, parsed.data.apiUrl, auth.userId, 'REMIN API base URL'),
    setSetting(REMIN_ADMIN_URL_KEY, parsed.data.adminUrl, auth.userId, 'REMIN Admin URL'),
  ];
  if (parsed.data.mcpToken) {
    writes.push(
      setSetting(REMIN_MCP_TOKEN_KEY, parsed.data.mcpToken, auth.userId, 'Bearer token gọi MCP của REMIN')
    );
  }
  await Promise.all(writes);

  return NextResponse.json({ ok: true, tokenSaved: Boolean(parsed.data.mcpToken) });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await Promise.all([
    deleteSetting(REMIN_API_URL_KEY),
    deleteSetting(REMIN_ADMIN_URL_KEY),
    deleteSetting(REMIN_MCP_TOKEN_KEY),
  ]);

  // Xoá khỏi DB không có nghĩa là hết cấu hình: biến env (nếu có) lại thành
  // giá trị dùng. Nói rõ để admin không tưởng đã xoá sạch.
  return NextResponse.json({ ok: true, note: 'Đã xoá bản ghi DB; biến môi trường (nếu có) sẽ được dùng lại.' });
}
