import 'server-only';

import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { getMailConsoleConfig } from './config';
import { mailAutomationsSchema, mailDashboardSchema } from './schemas';

// Đọc số từ console hệ mail bằng mã API chỉ đọc (`Authorization: Bearer …`). Mã chỉ mở
// GET /api/dashboard và GET /api/automations bên console (console_auth.token_user).
// Mã chỉ đọc ở server, không xuống trình duyệt và không vào câu lỗi.

const TIMEOUT_MS = 30_000;
/** Console tính bằng SQL trên Mautic mỗi lần gọi; giữ 2 phút cho đỡ nặng. */
const CACHE_SECONDS = 120;
export const MAIL_DAY_OPTIONS = [7, 14, 30, 90] as const;
export type MailDays = (typeof MAIL_DAY_OPTIONS)[number];

export class MailConsoleError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MailConsoleError';
  }
}

const TOKEN_HINT =
  'Chủ hệ mail tạo mã mới trên srv-03 (file ~/taki-mautic/.auto-ops-read-token) rồi cập nhật ở Settings → Tích hợp API.';

async function getJson(path: string): Promise<unknown> {
  const { url, token } = await getMailConsoleConfig();
  if (!url || !token) {
    throw new MailConsoleError(
      'NOT_CONFIGURED',
      'Chưa cấu hình kết nối console mail (Settings → Tích hợp API).'
    );
  }
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new MailConsoleError('UNREACHABLE', 'Không kết nối được tới console mail. Thử lại sau ít phút.');
  }
  // 401: console chưa có mã này (sai, đã thu hồi, hoặc console chưa lên bản có mã API).
  if (res.status === 401) {
    throw new MailConsoleError('INVALID_TOKEN', `Console mail không nhận mã kết nối. ${TOKEN_HINT}`);
  }
  if (!res.ok) {
    throw new MailConsoleError('UPSTREAM_ERROR', `Console mail trả lỗi ${res.status}. Thử lại sau ít phút.`);
  }
  return res.json().catch(() => {
    throw new MailConsoleError('BAD_RESPONSE', 'Console mail trả dữ liệu không đúng định dạng.');
  });
}

const fetchDashboard = unstable_cache(
  async (days: number) => mailDashboardSchema.parse(await getJson(`/api/dashboard?days=${days}`)),
  ['mail-console-dashboard-v1'],
  { revalidate: CACHE_SECONDS }
);

const fetchAutomations = unstable_cache(
  async () => mailAutomationsSchema.parse(await getJson('/api/automations')),
  ['mail-console-automations-v1'],
  { revalidate: CACHE_SECONDS }
);

export type Section<T> = { ok: true; data: T } | { ok: false; message: string };

async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    if (err instanceof MailConsoleError) {
      console.error(`[mail-console] ${err.code}`);
      return { ok: false, message: err.message };
    }
    if (err instanceof z.ZodError) {
      console.error(
        '[mail-console] BAD_SHAPE',
        err.issues.map((issue) => issue.path.join('.'))
      );
      return { ok: false, message: 'Console mail trả dữ liệu không đúng định dạng.' };
    }
    console.error('[mail-console] UNKNOWN', err instanceof Error ? err.name : 'unknown');
    return { ok: false, message: 'Không đọc được số liệu console mail.' };
  }
}

export async function loadMailOverview(days: MailDays) {
  const [dashboard, automations] = await Promise.all([
    section(() => fetchDashboard(days)),
    section(() => fetchAutomations()),
  ]);
  return { dashboard, automations };
}
