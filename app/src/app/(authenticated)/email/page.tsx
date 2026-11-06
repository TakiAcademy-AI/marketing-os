import { Metadata } from 'next';
import { Suspense } from 'react';
import { getMailConsoleConfig } from '@/lib/mail-console/config';
import { MAIL_DAY_OPTIONS, type MailDays, loadMailOverview } from '@/lib/mail-console/client';
import { EmailDaysPicker } from '@/components/email/days-picker';
import { MailAutomationTable } from '@/components/email/automation-table';
import { MailHealthCards } from '@/components/email/health-cards';
import { ExternalAction, SectionNotice } from '@/components/remin/parts';
import { ReminSkeleton } from '@/components/remin/skeleton';

export const metadata: Metadata = {
  title: 'Email — Marketing OS',
};

const DEFAULT_DAYS: MailDays = 30;

interface EmailPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseDays(raw: string | string[] | undefined): MailDays {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (MAIL_DAY_OPTIONS as readonly number[]).includes(n) ? (n as MailDays) : DEFAULT_DAYS;
}

export default async function EmailPage({ searchParams }: EmailPageProps) {
  const days = parseDays((await searchParams).days);
  const config = await getMailConsoleConfig();

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Email</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Sức khỏe email so với ngưỡng mục tiêu và danh sách automation của hệ mail webinar. Số đọc
          trực tiếp từ console mail.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <EmailDaysPicker current={days} />
        {config.url && <ExternalAction label="Mở console →" href={`${config.url}/`} />}
      </div>
    </div>
  );

  if (!config.url || !config.token) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Chưa cấu hình kết nối console mail. Admin cần nhập URL console và mã API chỉ đọc ở
          Settings → Tích hợp API (mã do chủ hệ mail tạo trên srv-03).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      {/* Khoá theo số ngày: đổi kỳ thì phần số về khung chờ ngay thay vì giữ số cũ. */}
      <Suspense key={days} fallback={<ReminSkeleton />}>
        <EmailSections days={days} consoleUrl={config.url} />
      </Suspense>
    </div>
  );
}

async function EmailSections({ days, consoleUrl }: { days: MailDays; consoleUrl: string }) {
  const { dashboard, automations } = await loadMailOverview(days);

  // Cùng một lỗi ở cả hai khối (mã sai, console tắt): báo một lần.
  if (!dashboard.ok && !automations.ok && dashboard.message === automations.message) {
    return <SectionNotice message={dashboard.message} />;
  }

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="email-health">
        <h3 id="email-health" className="text-base font-semibold text-zinc-900">
          Dashboard sức khỏe email
          <span className="ml-2 text-sm font-normal text-zinc-500">{days} ngày qua</span>
        </h3>
        {dashboard.ok ? (
          <MailHealthCards data={dashboard.data} />
        ) : (
          <SectionNotice message={dashboard.message} />
        )}
      </section>

      {automations.ok ? (
        <MailAutomationTable
          items={automations.data.automations}
          action={{ label: 'Chi tiết trong console →', href: `${consoleUrl}/` }}
        />
      ) : (
        <SectionNotice title="Danh sách automation" message={automations.message} />
      )}
    </>
  );
}
