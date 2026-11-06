import { cn } from '@/lib/utils';
import { dayMonth, formatInt, formatVnd } from '@/lib/remin/format';
import type { MailDashboard, MailMetric } from '@/lib/mail-console/schemas';

// "Dashboard sức khỏe email" của console mail: 5 chỉ số so ngưỡng mục tiêu + số đơn và
// doanh thu từ mail. Màu chỉ nói đạt / chưa đạt, luôn kèm chữ "✓ đạt" / "✗ chưa đạt".

const pctFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

const TONE = {
  ok: { box: 'bg-emerald-50/60 ring-emerald-200', value: 'text-emerald-700' },
  bad: { box: 'bg-red-50/60 ring-red-200', value: 'text-red-700' },
  money: { box: 'bg-indigo-50/60 ring-indigo-200', value: 'text-indigo-800' },
  /** Chỉ số có ngưỡng nhưng kỳ chưa gửi mail nào. */
  empty: { box: 'bg-white ring-zinc-200', value: 'text-zinc-900' },
} as const;

function valueText(m: MailMetric): string {
  if (m.value == null) return '—';
  if (m.key === 'revenue') return formatVnd(m.value);
  if (m.key === 'orders') return formatInt(m.value);
  return `${pctFormat.format(m.value)}%`;
}

function MetricCard({ m, sub }: { m: MailMetric; sub: string }) {
  const tone = m.ok === true ? 'ok' : m.ok === false ? 'bad' : m.target ? 'empty' : 'money';
  return (
    <div className={cn('rounded-xl p-5 ring-1 min-w-0', TONE[tone].box)}>
      <div className="text-sm font-medium text-zinc-600">{m.label}</div>
      <div className={cn('mt-2 text-3xl font-bold leading-tight tabular-nums', TONE[tone].value)}>
        {valueText(m)}
      </div>
      <div className="mt-2 text-xs text-zinc-600">
        {m.target ? (
          <>
            Mục tiêu {m.target}{' '}
            {m.ok === true && <span className="font-semibold text-emerald-700">✓ đạt</span>}
            {m.ok === false && <span className="font-semibold text-red-700">✗ chưa đạt</span>}
          </>
        ) : (
          sub
        )}
      </div>
    </div>
  );
}

export function MailHealthCards({ data }: { data: MailDashboard }) {
  const health = data.metrics.filter((m) => m.target);
  const money = data.metrics.filter((m) => !m.target);
  // Console tính đơn / doanh thu từ đầu tháng tới hôm nay, không theo số ngày đang chọn.
  const period = data.mail.period;
  const moneySub = period
    ? `Tháng này ${dayMonth(period.from)} → ${dayMonth(period.to)} · đơn web/SePay`
    : 'Đơn web/SePay';
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {health.map((m) => (
          <MetricCard key={m.key} m={m} sub="" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {money.map((m) => (
          <MetricCard key={m.key} m={m} sub={moneySub} />
        ))}
      </div>
      {money.some((m) => m.value === 0 || m.value == null) && data.mail.note && (
        <p className="text-xs text-zinc-500">{data.mail.note}</p>
      )}
      <p className="text-xs text-zinc-500">
        Dựa trên <b className="text-zinc-700">{formatInt(data.sent)}</b> lượt gửi trong{' '}
        {data.window_days} ngày · gửi thành công ≈ (đã gửi − bounce) / đã gửi · spam = complaint SES ·
        click ≈ tổng lượt bấm link.
      </p>
    </div>
  );
}
