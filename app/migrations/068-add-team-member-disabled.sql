-- Migration 068: khoá / mở khoá tài khoản thành viên (team_member).
-- Up migration
--
-- VÌ SAO:
-- Trước migration này MOS không có cách vô hiệu một tài khoản. Với người đã nghỉ
-- chỉ còn hai đường, đều sai:
--   - XOÁ CỨNG: DELETE team_member → CASCADE xoá gán kênh (social_account_member),
--     kênh mất chủ (owner_member_id SET NULL), mất lịch sử của người đó.
--   - ĐỔI MẬT KHẨU: cookie iron-session `mos_session` đang mở vẫn sống tới 7 ngày,
--     vì không có bảng session để thu hồi theo từng người.
-- Khoá = giữ nguyên dòng và mọi dữ liệu thuộc người đó; chỉ chặn đăng nhập và làm
-- phiên đang mở hết hiệu lực ngay.
--
-- disabled_at  NULL = đang hoạt động; có giá trị = bị khoá từ thời điểm đó.
-- disabled_by  admin đã khoá. Mở khoá thì về NULL; admin đó bị xoá thì SET NULL.
--
-- Chỉ THÊM cột, không đổi / xoá cột cũ. Mọi dòng hiện có nhận NULL = đang hoạt
-- động, nên deploy xong không ai bị khoá ngoài ý muốn.
--
-- Chỗ đọc cột:
--   - src/app/api/auth/login/route.ts : tài khoản bị khoá đăng nhập không được.
--   - src/lib/auth/role-cache.ts      : proxy (src/proxy.ts) + getCurrentUser()
--     coi phiên của tài khoản bị khoá / đã xoá là không có.
--   - src/lib/auth/account-lock.ts    : khoá / mở khoá (chặn tự khoá, chặn khoá
--     admin đang hoạt động cuối cùng).
--
-- ⚠ ROLLBACK image về bản trước migration này: cột vẫn còn nhưng code cũ không
-- đọc nó ⇒ tài khoản đang khoá lại đăng nhập được cho tới khi lên lại bản mới.

ALTER TABLE team_member
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES team_member(id) ON DELETE SET NULL;

COMMENT ON COLUMN team_member.disabled_at IS
  'NULL = tài khoản đang hoạt động. Có giá trị = bị khoá từ thời điểm này: không đăng nhập được, phiên đang mở hết hiệu lực. Dữ liệu và kênh của người đó giữ nguyên.';
COMMENT ON COLUMN team_member.disabled_by IS
  'team_member.id của admin đã khoá. NULL khi đang hoạt động hoặc khi admin đó đã bị xoá.';
