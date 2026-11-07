'use client';

// LockMemberDialog — admin khoá / mở khoá tài khoản 1 thành viên.
// POST /api/team-members/[id]/lock = khoá, DELETE = mở khoá.
// Không render cho chính admin đang đăng nhập (server cũng chặn tự khoá).
// Khoá giữ nguyên kênh + dữ liệu của người đó; chỉ chặn đăng nhập và đá phiên.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, LockOpen, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  id: string;
  /** Display name — admin xác nhận đúng người trước khi khoá */
  name: string;
  /** team_member.disabled_at (text Postgres) — null = đang hoạt động. */
  disabledAt: string | null;
}

// '2026-11-07 21:30:00+07' → '07/11/2026'
function formatDay(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function LockMemberDialog({ id, name, disabledAt }: Props) {
  const router = useRouter();
  const locked = disabledAt !== null;
  const lockedSince = disabledAt ? formatDay(disabledAt) : null;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/team-members/${id}/lock`, {
        method: locked ? 'DELETE' : 'POST',
      });

      if (res.ok) {
        toast.success(locked ? `Đã mở khoá ${name}` : `Đã khoá ${name}`);
        handleOpenChange(false);
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        data.error ?? (locked ? 'Không thể mở khoá tài khoản' : 'Không thể khoá tài khoản')
      );
    } catch {
      setError('Lỗi kết nối — thử lại sau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          locked ? (
            <button
              type="button"
              title={`Mở khoá ${name}`}
              className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
            >
              <Lock className="size-3" />
              ĐÃ KHOÁ
            </button>
          ) : (
            <button
              type="button"
              title={`Khoá tài khoản ${name}`}
              className="inline-flex items-center text-zinc-500 hover:text-amber-600"
            >
              <Lock className="size-3.5" />
            </button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {locked ? `Mở khoá tài khoản ${name}` : `Khoá tài khoản ${name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2 text-sm text-zinc-600">
          {locked ? (
            <>
              <p>
                Tài khoản đang bị khoá{lockedSince ? ` từ ${lockedSince}` : ''}.
              </p>
              <p>Mở khoá xong, {name} đăng nhập lại được bằng mật khẩu cũ.</p>
            </>
          ) : (
            <>
              <p>
                {name} bị đăng xuất ngay trên mọi thiết bị và không đăng nhập được
                nữa.
              </p>
              <p>
                Kênh {name} đang phụ trách và mọi dữ liệu giữ nguyên. Mở khoá lại
                được bất cứ lúc nào.
              </p>
            </>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={loading}>
                Huỷ
              </Button>
            }
          />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : locked ? (
              <LockOpen className="size-4" />
            ) : (
              <Lock className="size-4" />
            )}
            {locked
              ? loading
                ? 'Đang mở khoá…'
                : 'Mở khoá'
              : loading
                ? 'Đang khoá…'
                : 'Khoá tài khoản'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
