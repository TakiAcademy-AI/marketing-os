import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from './session-config';
import { isAccountActive } from './role-cache';

/**
 * Returns the iron-session instance for the current request.
 * Server-only — do NOT import in client components or middleware.
 */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Returns the current user from session, or null if not authenticated.
 *
 * Tài khoản đã bị khoá (team_member.disabled_at) hoặc đã bị xoá cũng trả null:
 * cookie cũ vẫn giải mã được tới 7 ngày nên PHẢI đối chiếu DB (cache ≤ 15s,
 * lib/auth/role-cache.ts). Đây là chốt cho mọi route tự kiểm phiên, kể cả các
 * route proxy bỏ qua (`/api/auth/*`, `/api/skills/upload`, `/api/admin/run-job`…).
 */
export async function getCurrentUser(): Promise<SessionData | null> {
  const session = await getSession();
  if (!session.userId) return null;
  if (!(await isAccountActive(session.userId))) return null;
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
  };
}
