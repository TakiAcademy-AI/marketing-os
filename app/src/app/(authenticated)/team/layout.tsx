import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { TeamTabs } from './team-tabs';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const role = user ? await getUserRole(user.userId) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Feedback loop chứa đánh giá nhạy cảm → tab chỉ hiện cho admin */}
      {role === 'admin' && <TeamTabs />}
      {children}
    </div>
  );
}
