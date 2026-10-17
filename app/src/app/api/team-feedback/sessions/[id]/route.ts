// PATCH  /api/team-feedback/sessions/[id] — đổi trạng thái / tiêu đề (admin)
// DELETE /api/team-feedback/sessions/[id] — xoá phiên + tin nhắn (admin)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, UUID_RE } from '@/lib/team-feedback/auth';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.status !== undefined || v.title !== undefined, 'Empty patch');

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

  const res = await db.query(
    `UPDATE team_feedback_session
        SET status = COALESCE($2, status),
            title = COALESCE($3, title),
            updated_at = NOW()
      WHERE id = $1 RETURNING id`,
    [id, parsed.data.status ?? null, parsed.data.title ?? null]
  );
  if (res.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const res = await db.query(`DELETE FROM team_feedback_session WHERE id = $1`, [id]);
  if (res.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
