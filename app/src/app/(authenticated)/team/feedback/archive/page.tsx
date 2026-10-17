import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { UUID_RE } from '@/lib/team-feedback/auth';

export const metadata: Metadata = { title: 'Lưu trữ feedback — Marketing OS' };

interface Row {
  id: string;
  title: string;
  status: 'open' | 'resolved';
  member_name: string;
  has_summary: boolean;
  msg_count: number;
  updated_at: string;
}

export default async function FeedbackArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; status?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (await getUserRole(user.userId)) !== 'admin') redirect('/team');

  const sp = await searchParams;
  const member = sp.member && UUID_RE.test(sp.member) ? sp.member : null;
  const status = sp.status === 'open' || sp.status === 'resolved' ? sp.status : null;
  const q = sp.q?.trim().slice(0, 100) || null;

  const [rows, members] = await Promise.all([
    db.query<Row>(
      `SELECT s.id, s.title, s.status, tm.name AS member_name,
              (s.summary IS NOT NULL) AS has_summary,
              (SELECT COUNT(*)::INT FROM team_feedback_message m WHERE m.session_id = s.id) AS msg_count,
              to_char(s.updated_at, 'DD/MM/YYYY HH24:MI') AS updated_at
         FROM team_feedback_session s
         JOIN team_member tm ON tm.id = s.member_id
        WHERE ($1::uuid IS NULL OR s.member_id = $1)
          AND ($2::text IS NULL OR s.status = $2)
          AND ($3::text IS NULL OR s.title ILIKE '%' || $3 || '%'
               OR s.summary ILIKE '%' || $3 || '%'
               OR EXISTS (SELECT 1 FROM team_feedback_message m
                           WHERE m.session_id = s.id AND m.content ILIKE '%' || $3 || '%'))
        ORDER BY s.updated_at DESC
        LIMIT 200`,
      [member, status, q]
    ),
    db.query<{ id: string; name: string }>(`SELECT id, name FROM team_member ORDER BY name ASC`),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Lưu trữ feedback loop</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{rows.rows.length} phiên</p>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Tìm trong nội dung…"
          className="h-8 w-56 rounded-lg border border-zinc-300 px-2 text-sm"
        />
        <select name="member" defaultValue={member ?? ''} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm">
          <option value="">Tất cả thành viên</option>
          {members.rows.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ''} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm">
          <option value="">Mọi trạng thái</option>
          <option value="open">Đang mở</option>
          <option value="resolved">Đã xử lý</option>
        </select>
        <button type="submit" className="h-8 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white">
          Lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {rows.rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-400">Chưa có phiên feedback nào.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/team/feedback/archive/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{r.title}</p>
                    <p className="text-xs text-zinc-500">
                      {r.member_name} · {r.msg_count} tin · {r.updated_at}
                      {r.has_summary && ' · có tóm tắt'}
                    </p>
                  </div>
                  <span
                    className={
                      r.status === 'resolved'
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700'
                        : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700'
                    }
                  >
                    {r.status === 'resolved' ? 'Đã xử lý' : 'Đang mở'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
