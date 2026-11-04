'use client';

// Xu hướng 12 tuần: mỗi biểu đồ một số, một trục; nút "Bảng" để đọc số chính xác.
// "Lãi mỗi tuần" là cột quanh mốc 0: tuần lãi xanh đi lên, tuần lỗ đỏ đi xuống.

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReminWeek } from '@/lib/remin/schemas';
import { dayMonth, formatInt, formatVnd, signedProfit } from '@/lib/remin/format';
import { Panel, SERIES } from './parts';

const INK = {
  primary: '#0f172a',
  secondary: '#475569',
  grid: '#eef2f6',
  axis: '#cbd5e1',
  hover: '#f1f5f9',
} as const;
const LOSS_COLOR = '#e34948';
/** Đầu cột bo 4px ở phía xa mốc 0, cột âm đảo xuống dưới. */
const RADIUS_UP: [number, number, number, number] = [4, 4, 0, 0];
const RADIUS_DOWN: [number, number, number, number] = [0, 0, 4, 4];

function TrendCard({
  title,
  weeks,
  pick,
  format,
  formatAxis,
  color = SERIES.blue,
  diverging,
}: {
  title: string;
  weeks: ReminWeek[];
  pick: (w: ReminWeek) => number;
  format: (n: number) => string;
  formatAxis: (n: number) => string;
  color?: string;
  diverging?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  const points = weeks.map((w) => ({ weekStart: w.weekStart, value: pick(w) }));
  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((v) => !v)}
          className="rounded-md px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
        >
          {showTable ? 'Biểu đồ' : 'Bảng'}
        </button>
      </div>
      {diverging && !showTable && (
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: SERIES.blue }}
            />
            Lãi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: LOSS_COLOR }}
            />
            Lỗ
          </span>
        </div>
      )}
      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-medium">Tuần bắt đầu</th>
              <th className="py-1 text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.weekStart} className="border-t border-zinc-100">
                <td className="py-1">{dayMonth(p.weekStart)}</td>
                <td className="py-1 text-right tabular-nums">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="img" aria-label={`${title} theo tuần`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis
                dataKey="weekStart"
                tickFormatter={dayMonth}
                tickLine={false}
                axisLine={{ stroke: INK.axis }}
                tick={{ fontSize: 11, fill: INK.secondary }}
                minTickGap={12}
              />
              <YAxis
                tickFormatter={formatAxis}
                tickLine={false}
                axisLine={false}
                width={80}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: INK.secondary }}
              />
              <Tooltip
                cursor={{ fill: INK.hover }}
                formatter={(value) => [format(Number(value)), title]}
                labelFormatter={(label) => `Tuần từ ${dayMonth(String(label))}`}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: INK.axis,
                  fontSize: 12,
                }}
                itemStyle={{ color: INK.primary }}
              />
              {diverging && <ReferenceLine y={0} stroke={INK.axis} />}
              <Bar dataKey="value" fill={color} maxBarSize={28} radius={RADIUS_UP}>
                {diverging &&
                  points.map((p) => (
                    <Cell
                      key={p.weekStart}
                      fill={p.value < 0 ? LOSS_COLOR : SERIES.blue}
                      // @ts-expect-error recharts Cell chuyển `radius` xuống hình cột nhưng type chưa khai.
                      radius={p.value < 0 ? RADIUS_DOWN : RADIUS_UP}
                    />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

/** Khoảng trắng không ngắt: nhãn trục của recharts tự xuống dòng ở dấu cách. */
const vndAxis = (n: number) => formatVnd(n, true).replace(/ /g, ' ');

export function MoneyTrends({ weeks }: { weeks: ReminWeek[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TrendCard
        title="Tiền về mỗi tuần"
        weeks={weeks}
        pick={(w) => w.revenueVnd}
        format={(n) => formatVnd(n)}
        formatAxis={vndAxis}
        color={SERIES.aqua}
      />
      <TrendCard
        title="Lãi mỗi tuần"
        weeks={weeks}
        pick={(w) => w.profitVnd}
        format={signedProfit}
        formatAxis={vndAxis}
        diverging
      />
    </div>
  );
}

export function ActiveDevicesTrend({ weeks }: { weeks: ReminWeek[] }) {
  return (
    <TrendCard
      title="Máy đang dùng mỗi tuần"
      weeks={weeks}
      pick={(w) => w.activeDevices}
      format={(n) => `${formatInt(n)} máy`}
      formatAxis={formatInt}
    />
  );
}
