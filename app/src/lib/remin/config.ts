// Cấu hình kết nối REMIN — một nguồn sự thật cho cả UI lẫn code gọi API.
//
// VÌ SAO KHÔNG ĐỌC THẲNG process.env:
// getSettingOrEnv đọc app_setting TRƯỚC rồi mới tới env. Nhờ vậy admin sửa
// được trong Settings → Tích hợp API mà KHÔNG phải redeploy, còn biến env chỉ
// đóng vai giá trị mặc định lúc dựng máy mới. Đây là khuôn chung của mọi tích
// hợp trong app (Lark, Google, Telegram, Apify…), không phải ngoại lệ.

import { getSettingOrEnv } from '@/lib/settings/api-keys';

export const REMIN_API_URL_KEY = 'REMIN_API_URL';
export const REMIN_ADMIN_URL_KEY = 'REMIN_ADMIN_URL';
export const REMIN_MCP_TOKEN_KEY = 'REMIN_MCP_TOKEN';

export interface ReminConfig {
  apiUrl: string | null;
  adminUrl: string | null;
  mcpToken: string | null;
}

/** Đọc cấu hình REMIN. Trả null cho từng trường chưa đặt — caller tự quyết
 *  thiếu trường nào thì coi là chưa cấu hình. */
export async function getReminConfig(): Promise<ReminConfig> {
  const [apiUrl, adminUrl, mcpToken] = await Promise.all([
    getSettingOrEnv(REMIN_API_URL_KEY),
    getSettingOrEnv(REMIN_ADMIN_URL_KEY),
    getSettingOrEnv(REMIN_MCP_TOKEN_KEY),
  ]);
  return {
    // Bỏ dấu / cuối để caller ghép path không ra '//'.
    apiUrl: apiUrl ? apiUrl.replace(/\/+$/, '') : null,
    adminUrl: adminUrl ? adminUrl.replace(/\/+$/, '') : null,
    // Chuỗi rỗng = chưa có token, không phải "token rỗng hợp lệ".
    mcpToken: mcpToken && mcpToken.trim() !== '' ? mcpToken.trim() : null,
  };
}

/** Đã đủ để gọi API REMIN chưa. */
export async function isReminConfigured(): Promise<boolean> {
  const c = await getReminConfig();
  return Boolean(c.apiUrl && c.mcpToken);
}
