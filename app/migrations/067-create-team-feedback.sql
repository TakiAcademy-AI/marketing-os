-- Migration 067: Team feedback loop — chat feedback về thành viên + lưu trữ
-- Up migration
--
-- team_feedback_session: 1 phiên chat feedback của admin về 1 thành viên.
-- team_feedback_message: các lượt hội thoại (user = admin, assistant = AI).
-- AI chạy qua OpenAI Codex CLI (xem src/lib/llm/codex-cli.ts).

CREATE TABLE IF NOT EXISTS team_feedback_session (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Thành viên được feedback
  member_id   UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  -- Admin tạo phiên
  created_by  UUID REFERENCES team_member(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT 'Phiên feedback mới',
  -- Tóm tắt kết luận + action items (AI sinh theo yêu cầu, NULL = chưa tóm tắt)
  summary     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_feedback_session_member_idx
  ON team_feedback_session (member_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS team_feedback_session_updated_idx
  ON team_feedback_session (updated_at DESC);

CREATE TABLE IF NOT EXISTS team_feedback_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES team_feedback_session(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_feedback_message_session_idx
  ON team_feedback_message (session_id, created_at ASC);

COMMENT ON TABLE team_feedback_session IS
  'Phiên chat feedback loop của admin về 1 thành viên team (AI qua Codex CLI).';
COMMENT ON TABLE team_feedback_message IS
  'Lượt hội thoại trong phiên feedback — user (admin) / assistant (AI).';
