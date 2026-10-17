// POST /api/team-feedback/sessions/[id]/summarize — AI tóm tắt kết luận + action items.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchTeamKpi } from '@/lib/queries/team-kpi';
import { CodexError, runCodex } from '@/lib/llm/codex-cli';
import { buildSummaryPrompt, type FeedbackTurn } from '@/lib/team-feedback/prompt';
import { requireAdmin, UUID_RE } from '@/lib/team-feedback/auth';

export const runtime = 'nodejs';
export const maxDuration = 200;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const s = await db.query<{ member_id: string; name: string }>(
    `SELECT s.member_id, tm.name
       FROM team_feedback_session s JOIN team_member tm ON tm.id = s.member_id
      WHERE s.id = $1`,
    [id]
  );
  const session = s.rows[0];
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const msgs = await db.query<FeedbackTurn>(
    `SELECT role, content FROM team_feedback_message
      WHERE session_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  if (msgs.rows.length === 0) {
    return NextResponse.json({ error: 'Phiên chưa có nội dung' }, { status: 400 });
  }

  const { members } = await fetchTeamKpi();
  const kpi = members.find((m) => m.id === session.member_id) ?? null;

  try {
    const summary = await runCodex(buildSummaryPrompt(kpi, session.name, msgs.rows));
    await db.query(
      `UPDATE team_feedback_session SET summary = $2, updated_at = NOW() WHERE id = $1`,
      [id, summary]
    );
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof CodexError ? err.message : 'Lỗi không xác định khi gọi AI';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
