import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { UUID_RE } from '@/lib/team-feedback/auth';
import { SessionActions } from './session-actions';
import { MarkdownBlock } from './markdown-block';

export const metadata: Metadata = { title: 'Chi tiết feedback — Marketing OS' };

export default async function FeedbackSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (await getUserRole(user.userId)) !== 'admin') redirect('/team');

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const s = await db.query<{
    id: string;
    title: string;
    status: 'open' | 'resolved';
    summary: string | null;
    member_name: string;
    created_at: string;
  }>(
    `SELECT s.id, s.title, s.status, s.summary, tm.name AS member_name,
            to_char(s.created_at, 'DD/MM/YYYY HH24:MI') AS created_at
       FROM team_feedback_session s JOIN team_member tm ON tm.id = s.member_id
      WHERE s.id = $1`,
    [id]
  );
  const session = s.rows[0];
  if (!session) notFound();

  const msgs = await db.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM team_feedback_message
      WHERE session_id = $1 ORDER BY created_at ASC`,
    [id]
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href="/team/feedback/archive" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Về lưu trữ
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">{session.title}</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {session.member_name} · tạo {session.created_at}
          </p>
        </div>
        <SessionActions id={session.id} status={session.status} hasSummary={!!session.summary} />
      </div>

      {session.summary && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-emerald-800">Tóm tắt & action items</h3>
          <MarkdownBlock source={session.summary} />
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        {msgs.rows.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-3.5 py-2 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl bg-zinc-100 px-3.5 py-2 text-sm text-zinc-900'
              }
            >
              {m.role === 'user' ? m.content : <MarkdownBlock source={m.content} />}
            </div>
          </div>
        ))}
      </section>

      <Link
        href={`/team/feedback?session=${session.id}`}
        className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
      >
        Tiếp tục chat phiên này
      </Link>
    </div>
  );
}
