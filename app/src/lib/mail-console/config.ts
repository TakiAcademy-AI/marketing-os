// Cấu hình kết nối console hệ mail (mail.nguyentatkiem.com/console, repo iceo-tech/mail-marketing).
//
// Cùng khuôn với REMIN (src/lib/remin/config.ts): getSettingOrEnv đọc app_setting TRƯỚC rồi
// mới tới env, nên admin sửa trong Settings → Tích hợp API là ăn ngay, không phải redeploy.

import { getSettingOrEnv } from '@/lib/settings/api-keys';

export const MAIL_CONSOLE_URL_KEY = 'MAIL_CONSOLE_URL';
export const MAIL_CONSOLE_TOKEN_KEY = 'MAIL_CONSOLE_TOKEN';

export interface MailConsoleConfig {
  /** Gốc console, vd https://mail.nguyentatkiem.com/console (không có / cuối). */
  url: string | null;
  /** Mã API chỉ đọc của console (`~/taki-mautic/.auto-ops-read-token` trên srv-03). */
  token: string | null;
}

export async function getMailConsoleConfig(): Promise<MailConsoleConfig> {
  const [url, token] = await Promise.all([
    getSettingOrEnv(MAIL_CONSOLE_URL_KEY),
    getSettingOrEnv(MAIL_CONSOLE_TOKEN_KEY),
  ]);
  return {
    url: url ? url.trim().replace(/\/+$/, '') : null,
    token: token && token.trim() !== '' ? token.trim() : null,
  };
}
