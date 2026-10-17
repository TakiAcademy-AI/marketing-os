# Codex CLI cho Chat feedback loop

Trang `/team/feedback` (chat) và `/team/feedback/archive` (lưu trữ) chỉ dành cho admin.
AI chạy bằng OpenAI Codex CLI (`codex exec`, sandbox read-only, thư mục tạm rỗng).

## Triển khai
1. Build lại image (Dockerfile đã cài `@openai/codex`; login lưu ở volume `./data/codex`).
2. Thư mục `./data/codex` trên host phải thuộc UID 1001 (`chown 1001:1001 data/codex`).
3. Đăng nhập một lần bằng tài khoản ChatGPT:
   `docker exec -it <container> codex login --device-auth`
4. Migration `067-create-team-feedback.sql` tự chạy khi container khởi động.

## Biến môi trường (tuỳ chọn)
- `CODEX_BIN` — đường dẫn binary nếu không nằm trong PATH.
- `CODEX_MODEL` — ép model (mặc định theo cấu hình Codex).
- `CODEX_HOME` — nơi lưu login (Dockerfile đặt `/app/storage/codex`).

## Lỗi thường gặp
- "Failed to refresh token ... sign in again": chạy lại `codex login`.
- "Không tìm thấy Codex CLI": thiếu binary hoặc sai `CODEX_BIN`.
