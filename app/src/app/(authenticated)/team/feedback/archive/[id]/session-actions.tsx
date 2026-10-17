'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, RotateCcw, Sparkles, Trash2 } from 'lucide-react';

interface Props {
  id: string;
  status: 'open' | 'resolved';
  hasSummary: boolean;
}

export function SessionActions({ id, status, hasSummary }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summarizing, setSummarizing] = useState(false);
  const [armed, setArmed] = useState(false);

  async function call(url: string, init: RequestInit, okMsg: string): Promise<boolean> {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Thao tác thất bại');
        return false;
      }
      toast.success(okMsg);
      return true;
    } catch {
      toast.error('Lỗi mạng — thử lại sau');
      return false;
    }
  }

  function toggleStatus() {
    startTransition(async () => {
      const next = status === 'open' ? 'resolved' : 'open';
      const ok = await call(
        `/api/team-feedback/sessions/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
        next === 'resolved' ? 'Đã đánh dấu xử lý' : 'Đã mở lại'
      );
      if (ok) router.refresh();
    });
  }

  async function summarize() {
    setSummarizing(true);
    const ok = await call(
      `/api/team-feedback/sessions/${id}/summarize`,
      { method: 'POST' },
      'Đã tạo tóm tắt'
    );
    setSummarizing(false);
    if (ok) router.refresh();
  }

  function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3_000);
      return;
    }
    startTransition(async () => {
      const ok = await call(`/api/team-feedback/sessions/${id}`, { method: 'DELETE' }, 'Đã xoá phiên');
      if (ok) router.push('/team/feedback/archive');
    });
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} onClick={summarize} disabled={summarizing || pending}>
        <Sparkles className="size-4" />
        {summarizing ? 'Đang tóm tắt…' : hasSummary ? 'Tóm tắt lại' : 'Tạo tóm tắt'}
      </button>
      <button type="button" className={btn} onClick={toggleStatus} disabled={pending}>
        {status === 'open' ? <CheckCircle2 className="size-4" /> : <RotateCcw className="size-4" />}
        {status === 'open' ? 'Đánh dấu đã xử lý' : 'Mở lại'}
      </button>
      <button
        type="button"
        className={`${btn} ${armed ? 'border-red-300 text-red-600' : ''}`}
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="size-4" />
        {armed ? 'Bấm lần nữa để xoá' : 'Xoá'}
      </button>
    </div>
  );
}
