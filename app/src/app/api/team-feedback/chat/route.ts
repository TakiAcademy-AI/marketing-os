// POST /api/team-feedback/chat — admin gửi 1 lượt chat feedback về thành viên.
// Tạo phiên mới nếu chưa có sessionId, gọi Codex CLI, lưu cả 2 lượt vào DB.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { fetchTeamKpi } from '@/lib/queries/team-kpi';
import { CodexError, runCodex } from '@/lib/llm/codex-cli';
import { buildChatPrompt, type FeedbackTurn } from '@/lib/team-feedback/prompt';
import { requireAdmin, UUID_RE } from '@/lib/team-feedback/auth';

export const runtime = 'nodejs';
export const maxDuration = 200;

const bodySchema = z.object({
  sessionId: z.string().regex(UUID_RE).optional(),
  memberId: z.string().regex(UUID_RE).optional(),
  message: z.string().trim().min(1).max(4000),
});

const HISTORY_LIMIT = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
  const { sessionId, memberId, message } = parsed.data;

  // Xác định phiên + thành viên
  let sid = sessionId;
  let mid: string;
  if (sid) {
    const r = await db.query<{ member_id: string }>(
      `SELECT member_id FROM team_feedback_session WHERE id = $1`,
      [sid]
    );
    const row = r.rows[0];
    if (!row) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    mid = row.member_id;
  } else {
    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }
    mid = memberId;
  }

  const memberRes = await db.query<{ name: string }>(
    `SELECT name FROM team_member WHERE id = $1`,
    [mid]
  );
  const memberRow = memberRes.rows[0];
  if (!memberRow) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  if (!sid) {
    const title = message.length > 60 ? `${message.slice(0, 57)}...` : message;
    const created = await db.query<{ id: string }>(
      `INSERT INTO team_feedback_session (member_id, created_by, title)
       VALUES ($1, $2, $3) RETURNING id`,
      [mid, auth.userId, title]
    );
    sid = created.rows[0]!.id;
  }

  const histRes = await db.query<FeedbackTurn>(
    `SELECT role, content FROM (
       SELECT role, content, created_at FROM team_feedback_message
        WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [sid, HISTORY_LIMIT]
  );
  const history: FeedbackTurn[] = [...histRes.rows, { role: 'user', content: message }];

  const { members } = await fetchTeamKpi();
  const kpi = members.find((m) => m.id === mid) ?? null;

  let reply: string;
  try {
    reply = await runCodex(buildChatPrompt(kpi, memberRow.name, history));
  } catch (err) {
    const msg = err instanceof CodexError ? err.message : 'Lỗi không xác định khi gọi AI';
    // Lượt user chưa được lưu → admin gửi lại được; phiên rỗng vừa tạo thì dọn.
    if (!sessionId) await db.query(`DELETE FROM team_feedback_session WHERE id = $1`, [sid]);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await db.query(
    `INSERT INTO team_feedback_message (session_id, role, content)
     VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
    [sid, message, reply]
  );
  await db.query(`UPDATE team_feedback_session SET updated_at = NOW() WHERE id = $1`, [sid]);

  return NextResponse.json({ ok: true, sessionId: sid, reply });
}
