-- Migration 065: engagement_rate đổi mẫu số từ reach → followers.
--
-- VÌ SAO:
-- Probe resolveInsightMetrics() chạy trên production 2026-10-06 xác nhận:
--   còn sống : post_clicks, post_video_views
--   đã chết  : post_impressions_unique
-- post_impressions_unique là nguồn DUY NHẤT còn lại của post_metric_daily.reach,
-- sau khi post_media_view cũng đã chết ở v25 (xem migration 036 — chính nó đổi
-- nghĩa reach sang "tổng view" và dùng post_media_view làm nguồn chính).
-- Hệ quả đo được: reach = 0 → engagement_rate = 0 trên toàn bộ kênh dùng token
-- FB, dù reactions/comments/shares vẫn về đầy đủ. Tử số đúng, mẫu số chết.
--
-- followers không đến từ metric insights nào của Facebook, nên không chết theo
-- các đợt deprecate tiếp theo. Đây là lý do chọn nó làm mẫu số.
--
-- ĐÁNH ĐỔI PHẢI BIẾT: con số ER sau migration KHÔNG so sánh được với số lịch sử
-- (mẫu số khác hẳn), và nó đổi cho CẢ 14 kênh Bundle.social vốn đang có ER bình
-- thường — vì generated column là chung cho cả bảng.
--
-- VÌ SAO CẦN CỘT followers_snapshot thay vì JOIN sang account_metric_daily:
-- generated column của PostgreSQL chỉ được tham chiếu cột CÙNG HÀNG — không
-- subquery, không JOIN. Nên buộc phải chốt followers vào từng hàng.
--
-- VÌ SAO DÙNG TRIGGER mà không sửa 3 chỗ INSERT (lib/cron/upsert-helpers.ts,
-- lib/sync/run-sync.ts, lib/bundle/upsert.ts): đường ghi thứ 4 thêm sau này sẽ
-- âm thầm để followers_snapshot = 0 → ER = 0 mà không ai thấy. Đúng loại lỗi im
-- lặng vừa mất công truy ra. Trigger phủ mọi đường ghi, kể cả chưa tồn tại.
--
-- followers_snapshot = 0 nghĩa là "CHƯA BIẾT", không phải "không có follower".
-- Trigger thử điền lại ở mỗi lần UPDATE cho tới khi có dữ liệu → tự lành.
-- Khi đã có giá trị thì KHÔNG ghi đè, để ER của bài cũ không trôi theo lượng
-- follower hiện tại (ER phải ổn định theo thời điểm đăng).

-- ─── 1. Cột chốt followers ───────────────────────────────────────────────────
ALTER TABLE post_metric_daily
  ADD COLUMN IF NOT EXISTS followers_snapshot INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN post_metric_daily.followers_snapshot IS
  'Lượng follower của kênh tại ngày của hàng này (hoặc snapshot gần nhất TRƯỚC đó). Mẫu số của engagement_rate. 0 = chưa biết, trigger sẽ thử điền lại ở lần UPDATE sau.';

-- ─── 2. Trigger điền followers cho mọi đường ghi ─────────────────────────────
CREATE OR REPLACE FUNCTION fill_post_metric_followers()
RETURNS TRIGGER AS $$
BEGIN
  -- Chỉ điền khi chưa biết. Đã có giá trị thì giữ nguyên để ER không trôi.
  IF COALESCE(NEW.followers_snapshot, 0) = 0 THEN
    SELECT COALESCE(
      -- Ưu tiên snapshot gần nhất KHÔNG muộn hơn ngày của hàng metric.
      (SELECT amd.followers
         FROM social_post sp
         JOIN account_metric_daily amd ON amd.account_id = sp.account_id
        WHERE sp.id = NEW.post_id
          AND amd.followers > 0
          AND amd.date <= NEW.date
        ORDER BY amd.date DESC
        LIMIT 1),
      -- Bài cũ hơn mọi snapshot followers ta có → lấy snapshot sớm nhất.
      (SELECT amd.followers
         FROM social_post sp
         JOIN account_metric_daily amd ON amd.account_id = sp.account_id
        WHERE sp.id = NEW.post_id
          AND amd.followers > 0
        ORDER BY amd.date ASC
        LIMIT 1),
      0
    ) INTO NEW.followers_snapshot;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_post_metric_followers ON post_metric_daily;
CREATE TRIGGER trg_fill_post_metric_followers
  BEFORE INSERT OR UPDATE ON post_metric_daily
  FOR EACH ROW
  EXECUTE FUNCTION fill_post_metric_followers();

-- ─── 3. Backfill dữ liệu đang có ─────────────────────────────────────────────
-- Cùng logic với trigger. Chạy trực tiếp thay vì dựa vào trigger để khỏi phải
-- UPDATE giả toàn bảng.
UPDATE post_metric_daily pmd
   SET followers_snapshot = COALESCE(
     (SELECT amd.followers
        FROM social_post sp
        JOIN account_metric_daily amd ON amd.account_id = sp.account_id
       WHERE sp.id = pmd.post_id
         AND amd.followers > 0
         AND amd.date <= pmd.date
       ORDER BY amd.date DESC
       LIMIT 1),
     (SELECT amd.followers
        FROM social_post sp
        JOIN account_metric_daily amd ON amd.account_id = sp.account_id
       WHERE sp.id = pmd.post_id
         AND amd.followers > 0
       ORDER BY amd.date ASC
       LIMIT 1),
     0
   )
 WHERE followers_snapshot = 0;

-- ─── 4. Định nghĩa lại engagement_rate ───────────────────────────────────────
DO $$
BEGIN
  -- Chốt an toàn: chỉ drop khi engagement_rate đúng là generated column.
  -- Nếu ai đó đã đổi nó thành cột thường có dữ liệu ghi tay, drop là mất data.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'post_metric_daily'
       AND column_name = 'engagement_rate'
       AND is_generated <> 'ALWAYS'
  ) THEN
    RAISE EXCEPTION
      'post_metric_daily.engagement_rate không còn là generated column — có thể đang chứa dữ liệu ghi tay. Dừng lại để không mất data.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'post_metric_daily' AND column_name = 'engagement_rate'
  ) THEN
    -- PostgreSQL không cho ALTER biểu thức của generated column → phải drop/add.
    -- Không mất gì: giá trị được tính lại từ các cột khác.
    ALTER TABLE post_metric_daily DROP COLUMN engagement_rate;
  END IF;
END $$;

-- NUMERIC(10,4) thay vì (6,4) như cũ: (6,4) chỉ chứa tới 99.9999, mà một bài
-- viral trên page ít follower có thể cho tỉ lệ lớn hơn thế → INSERT lỗi tràn số
-- và chặn luôn cả lượt ingestion. Nới kiểu rẻ hơn là cắt ngọn (LEAST) vì cắt
-- ngọn làm méo dữ liệu thật.
ALTER TABLE post_metric_daily
  ADD COLUMN engagement_rate NUMERIC(10,4) GENERATED ALWAYS AS (
    CASE WHEN followers_snapshot > 0
      THEN ROUND((reactions + comments + shares)::NUMERIC / followers_snapshot, 4)
      ELSE 0
    END
  ) STORED;

COMMENT ON COLUMN post_metric_daily.engagement_rate IS
  '(reactions + comments + shares) / followers_snapshot. Từ migration 065 mẫu số là followers, KHÔNG còn là reach — số liệu không so sánh được với trước 065. Lý do: FB khai tử post_impressions_unique nên reach = 0.';
