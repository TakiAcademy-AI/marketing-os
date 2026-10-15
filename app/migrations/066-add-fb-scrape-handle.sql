-- Migration 066: kênh Facebook quét công khai (không có quyền quản trị Page).
--
-- VÌ SAO:
-- Mất vai trò admin/editor trên Page thì KHÔNG lấy được Page Access Token, nên
-- mọi job cần token (page_insights, posts_ingestion, message_sync) không chạm
-- tới được. Page Insights (reach, impressions, lịch sử follower, inbox) là dữ
-- liệu riêng tư của Page — Facebook không có API nào cho đọc page của người
-- khác, kể cả scrape, vì những số đó không hiển thị công khai.
--
-- Nhưng BÀI VIẾT và reactions/comments/shares thì công khai. Binary `fb`
-- (tamnd/facebook-cli) đã nằm trong image (Dockerfile) và đang chạy cho /news,
-- `fb feed <page>` trả về counts:{reactions,comments,shares}. Đủ để đổ vào
-- social_post + post_metric_daily → có danh sách bài, tần suất đăng, và
-- engagement thật mà không cần quyền gì.
--
-- fb_scrape_handle = slug/ID page để truyền cho fb-cli. NULL = không quét.
-- Cột này là CÔNG TẮC của job-fb-scrape: chỉ kênh có handle mới bị quét.
--
-- Kênh loại này tạo kèm is_manual = true, nên:
--   - các job cần token tự bỏ qua (vốn đã lọc access_token_encrypted IS NOT NULL)
--   - admin nhập tay được followers/reach qua /api/channels/[id]/manual-metric
--   - reach tính kiểu snapshot tuyệt đối (xem migration 048)
-- Hai nguồn bù nhau: fb-cli lo engagement, người nhập tay lo followers/reach.

ALTER TABLE social_account
  ADD COLUMN IF NOT EXISTS fb_scrape_handle TEXT;

COMMENT ON COLUMN social_account.fb_scrape_handle IS
  'Slug hoặc numeric ID của Facebook Page để quét công khai bằng fb-cli. NULL = không quét. Dùng cho page đã mất quyền quản trị nên không có token. Chỉ lấy được bài + reactions/comments/shares; reach/impressions/inbox là dữ liệu riêng tư, không bao giờ có.';

-- Một page chỉ nên gắn vào đúng một kênh, tránh quét trùng rồi upsert đè nhau.
CREATE UNIQUE INDEX IF NOT EXISTS social_account_fb_scrape_handle_uq
  ON social_account (fb_scrape_handle)
  WHERE fb_scrape_handle IS NOT NULL;

-- Để job-fb-scrape ghi được vào api_sync_log.
-- ADD VALUE chạy trong transaction được (PG 12+) miễn không DÙNG value ngay
-- trong cùng transaction — migration này không dùng, giống precedent 015/018/039.
ALTER TYPE sync_type_t ADD VALUE IF NOT EXISTS 'fb_scrape';
