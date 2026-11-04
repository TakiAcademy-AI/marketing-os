import type { ReminRevenueLine } from '@/lib/remin/schemas';
import { changeShort, formatVnd, shareText } from '@/lib/remin/format';
import { Change, Panel, PanelTitle, SHARE_COLORS, ShareBar } from './parts';

const HEAD_CLASS = 'py-1 text-right font-medium';
const NUM_CLASS = 'py-1.5 text-right tabular-nums';

export interface SourceItem {
  key: string;
  label: string;
  vnd: number;
  prevVnd: number;
}

/** "Tiền về theo nguồn": kênh khách đến trước khi trả tiền (lần chạm cuối). */
export function RevenueBySource({
  items,
  subtitle,
  action,
}: {
  items: SourceItem[];
  subtitle: string;
  action: { label: string; href: string } | null;
}) {
  const rows = items.filter((item) => item.vnd > 0 || item.prevVnd > 0);
  const barRows = rows.filter((item) => item.vnd > 0);
  const total = barRows.reduce((sum, item) => sum + item.vnd, 0);
  const prevTotal = rows.reduce((sum, item) => sum + item.prevVnd, 0);
  const color = new Map(
    rows.map((row, i) => [row.key, SHARE_COLORS[i % SHARE_COLORS.length]])
  );
  return (
    <Panel>
      <PanelTitle title="Tiền về theo nguồn" subtitle={subtitle} action={action} />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có số trong kỳ này.</p>
      ) : (
        <>
          <ShareBar
            label="Tiền về theo nguồn, tổng 100%"
            items={barRows.map((row) => ({
              key: row.key,
              label: row.label,
              vnd: row.vnd,
              color: color.get(row.key)!,
            }))}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 font-medium">Nguồn</th>
                  <th className={HEAD_CLASS}>Tỷ trọng</th>
                  <th className={HEAD_CLASS}>Kỳ này</th>
                  <th className={HEAD_CLASS}>Kỳ trước</th>
                  <th className={HEAD_CLASS}>So kỳ trước</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-zinc-100">
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block size-2.5 rounded-sm"
                          style={{ background: color.get(row.key) }}
                        />
                        {row.label}
                      </span>
                    </td>
                    <td className={NUM_CLASS}>{shareText(row.vnd, total)}</td>
                    <td className={NUM_CLASS}>{formatVnd(row.vnd)}</td>
                    <td className={`${NUM_CLASS} text-zinc-600`}>{formatVnd(row.prevVnd)}</td>
                    <td className={NUM_CLASS}>
                      <Change
                        cur={row.vnd}
                        prev={row.prevVnd}
                        short={changeShort(row.vnd, row.prevVnd)}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-300 font-medium">
                  <td className="py-1.5">Tổng tiền về</td>
                  <td className={NUM_CLASS}>{total > 0 ? '100%' : '—'}</td>
                  <td className={NUM_CLASS}>{formatVnd(total)}</td>
                  <td className={`${NUM_CLASS} text-zinc-600`}>{formatVnd(prevTotal)}</td>
                  <td className={NUM_CLASS}>
                    <Change
                      cur={total}
                      prev={prevTotal}
                      short={changeShort(total, prevTotal)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

const GROUP_LABEL = {
  hardware: 'Máy ghi âm',
  software: 'Phần mềm (gói + credit)',
} as const;
const GROUPS = ['hardware', 'software'] as const;

function ProductRow({
  label,
  vnd,
  prevVnd,
  total,
  color,
  strong,
}: {
  label: string;
  vnd: number;
  prevVnd: number;
  total: number;
  color?: string;
  strong?: boolean;
}) {
  return (
    <tr
      className={
        strong
          ? 'border-t border-zinc-300 font-semibold text-zinc-900'
          : 'border-t border-zinc-100'
      }
    >
      <td className={strong ? 'py-1.5' : 'py-1.5 pl-4'}>
        <span className="inline-flex items-center gap-2">
          {color && (
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: color }}
            />
          )}
          {label}
        </span>
      </td>
      <td className={NUM_CLASS}>{shareText(vnd, total)}</td>
      <td className={NUM_CLASS}>{formatVnd(vnd)}</td>
      <td className={`${NUM_CLASS} text-zinc-600`}>{formatVnd(prevVnd)}</td>
      <td className={NUM_CLASS}>
        <Change cur={vnd} prev={prevVnd} short={changeShort(vnd, prevVnd)} />
      </td>
    </tr>
  );
}

/** "Doanh thu máy ghi âm & phần mềm": hai khối có dòng cộng riêng. */
export function ProductRevenue({
  lines,
  subtitle,
}: {
  lines: ReminRevenueLine[];
  subtitle: string;
}) {
  const ordered = GROUPS.flatMap((g) => lines.filter((l) => l.group === g));
  const color = new Map(
    ordered.map((l, i) => [l.key, SHARE_COLORS[i % SHARE_COLORS.length]])
  );
  const sum = (ls: ReminRevenueLine[], k: 'vnd' | 'prevVnd') =>
    ls.reduce((t, l) => t + l[k], 0);
  const total = sum(ordered, 'vnd');
  const prevTotal = sum(ordered, 'prevVnd');
  const groupOf = (g: (typeof GROUPS)[number]) => ordered.filter((l) => l.group === g);
  return (
    <Panel>
      <PanelTitle title="Doanh thu máy ghi âm & phần mềm" subtitle={subtitle} />
      {ordered.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có tiền về trong kỳ này và kỳ trước.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-700">
            {GROUPS.map(
              (g) => `${GROUP_LABEL[g]} ${shareText(sum(groupOf(g), 'vnd'), total)}`
            ).join(' · ')}
          </p>
          <ShareBar
            label="Tỷ trọng doanh thu máy ghi âm và phần mềm theo kênh, tổng 100%"
            items={ordered
              .filter((l) => l.vnd > 0)
              .map((l) => ({
                key: l.key,
                label: l.label,
                vnd: l.vnd,
                color: color.get(l.key)!,
              }))}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 font-medium">Sản phẩm · kênh bán</th>
                  <th className={HEAD_CLASS}>Tỷ trọng</th>
                  <th className={HEAD_CLASS}>Kỳ này</th>
                  <th className={HEAD_CLASS}>Kỳ trước</th>
                  <th className={HEAD_CLASS}>So kỳ trước</th>
                </tr>
              </thead>
              {GROUPS.map((g) => {
                const ls = groupOf(g);
                return (
                  <tbody key={g}>
                    <ProductRow
                      label={GROUP_LABEL[g]}
                      vnd={sum(ls, 'vnd')}
                      prevVnd={sum(ls, 'prevVnd')}
                      total={total}
                      strong
                    />
                    {ls.map((l) => (
                      <ProductRow
                        key={l.key}
                        label={l.label}
                        vnd={l.vnd}
                        prevVnd={l.prevVnd}
                        total={total}
                        color={color.get(l.key)}
                      />
                    ))}
                  </tbody>
                );
              })}
              <tbody>
                <tr className="border-t-2 border-zinc-400 font-semibold text-zinc-900">
                  <td className="py-1.5">Tổng tiền về thuần</td>
                  <td className={NUM_CLASS}>{total > 0 ? '100%' : '—'}</td>
                  <td className={NUM_CLASS}>{formatVnd(total)}</td>
                  <td className={`${NUM_CLASS} text-zinc-600`}>{formatVnd(prevTotal)}</td>
                  <td className={NUM_CLASS}>
                    <Change
                      cur={total}
                      prev={prevTotal}
                      short={changeShort(total, prevTotal)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
