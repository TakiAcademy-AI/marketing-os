import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { UUID_RE } from '@/lib/team-feedback/auth';
import { FeedbackChat, type ChatMessage } from './feedback-chat';

export const metadata: Metadata = { title: 'Chat feedback — Marketing OS' };

export default async function FeedbackChatPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; member?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (await getUserRole(user.userId)) !== 'admin') redirect('/team');

  const { session, member } = await searchParams;

  const membersRes = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM team_member ORDER BY name ASC`
  );

  let sessionId: string | null = null;
  let memberId: string | null = member && UUID_RE.test(member) ? member : null;
  let messages: ChatMessage[] = [];

  if (session && UUID_RE.test(session)) {
    const s = await db.query<{ id: string; member_id: string }>(
      `SELECT id, member_id FROM team_feedback_session WHERE id = $1`,
      [session]
    );
    const row = s.rows[0];
    if (row) {
      sessionId = row.id;
      memberId = row.member_id;
      const m = await db.query<ChatMessage>(
        `SELECT role, content FROM team_feedback_message
          WHERE session_id = $1 ORDER BY created_at ASC`,
        [row.id]
      );
      messages = m.rows;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Chat feedback loop</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Chọn thành viên, trao đổi với AI (Codex CLI) dựa trên KPI để soạn feedback.
          Mọi phiên được lưu ở tab &quot;Lưu trữ feedback&quot;.
        </p>
      </div>
      <FeedbackChat
        members={membersRes.rows}
        initialMemberId={memberId}
        initialSessionId={sessionId}
        initialMessages={messages}
      />
    </div>
  );
}
