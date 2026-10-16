// Gọi curl-impersonate để đọc trang Facebook công khai.
//
// VÌ SAO KHÔNG DÙNG fetch() CỦA NODE:
// Facebook chặn theo TLS fingerprint. Đo được trên production: fb-cli có
// session hợp lệ (tier 1, `fb whoami` xác nhận) mà `fb feed` vẫn chỉ trả 1 bài
// trên MỌI page, kể cả `nasa`. Client HTTP của Go/Node bị nhận diện và phục vụ
// như khách vãng lai. curl-impersonate bắt chước đúng Client Hello của Chrome
// nên qua được — thử trực tiếp thì lấy được số follower đầy đủ (19.238) và
// view của 10 reel.
//
// Binary nằm trong image, xem Dockerfile stage `curlimp`.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Wrapper curl_chrome131 — gọi ./curl-impersonate cạnh nó nên hai file phải
 *  cùng thư mục. Đường dẫn khai trong Dockerfile qua ENV. */
const BIN = process.env.CURL_IMPERSONATE_BIN || 'curl_chrome131';

/** Trang Facebook rất nặng (~18MB cho tab reels) — buffer phải rộng tay. */
const MAX_BUFFER = 40 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

export class CurlImpersonateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurlImpersonateError';
  }
}

export function curlImpersonateAvailable(): boolean {
  return BIN.includes('/') ? existsSync(BIN) : true;
}

/**
 * GET một URL, trả HTML thô.
 *
 * `Accept-Language: en-US` là BẮT BUỘC, không phải cho đẹp: IP máy chủ hay
 * được Facebook trả bản tiếng Việt ("người theo dõi") làm regex trong
 * parse-public-page trượt hết.
 */
export function curlGet(url: string, proxy?: string): Promise<string> {
  const args = [
    '-sL',
    '--compressed',
    '--max-time',
    '45',
    '-H',
    'Accept-Language: en-US,en;q=0.9',
    ...(proxy ? ['-x', proxy] : []),
    url,
  ];

  return new Promise((resolve, reject) => {
    execFile(
      BIN,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          const e = err as NodeJS.ErrnoException;
          if (e.code === 'ENOENT') {
            reject(
              new CurlImpersonateError(
                `Không tìm thấy binary "${BIN}". Kiểm tra Dockerfile stage curlimp / biến CURL_IMPERSONATE_BIN.`
              )
            );
            return;
          }
          reject(new CurlImpersonateError(`curl lỗi: ${err.message.slice(0, 200)}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

/** URL trang page. Id toàn số thì phải đi qua profile.php. */
export function pageUrl(ref: string): string {
  return /^\d+$/.test(ref)
    ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(ref)}`
    : `https://www.facebook.com/${encodeURIComponent(ref)}`;
}

/** URL tab reels. Id toàn số dùng tham số sk thay vì đường dẫn con. */
export function reelsUrl(ref: string): string {
  return /^\d+$/.test(ref)
    ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(ref)}&sk=reels_tab`
    : `https://www.facebook.com/${encodeURIComponent(ref)}/reels`;
}
