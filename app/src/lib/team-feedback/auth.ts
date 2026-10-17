import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Feedback về thành viên là dữ liệu nhạy cảm → chỉ admin.
export async function requireAdmin(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  return { userId: user.userId };
}
