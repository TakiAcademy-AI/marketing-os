'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Send, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  members: { id: string; name: string }[];
  initialMemberId: string | null;
  initialSessionId: string | null;
  initialMessages: ChatMessage[];
}

export function FeedbackChat({ members, initialMemberId, initialSessionId, initialMessages }: Props) {
  const [memberId, setMemberId] = useState(initialMemberId ?? '');
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const locked = sessionId !== null; // phiên đã bắt đầu → không đổi thành viên

  function newSession() {
    setSessionId(null);
    setMessages([]);
    setInput('');
    window.history.replaceState(null, '', '/team/feedback');
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (!memberId) {
      toast.error('Chọn thành viên trước');
      return;
    }
    setSending(true);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    try {
      const res = await fetch('/api/team-feedback/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId ?? undefined, memberId, message: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sessionId?: string;
        reply?: string;
      };
      if (!res.ok || !data.reply || !data.sessionId) {
        throw new Error(data.error ?? 'AI không phản hồi');
      }
      setSessionId(data.sessionId);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply! }]);
      window.history.replaceState(null, '', `/team/feedback?session=${data.sessionId}`);
    } catch (err) {
      // Hoàn tác lượt user chưa được lưu để admin gửi lại
      setMessages((m) => m.slice(0, -1));
      setInput(text);
      toast.error(err instanceof Error ? err.message : 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-3">
        <label className="text-sm text-zinc-600" htmlFor="fb-member">Thành viên</label>
        <select
          id="fb-member"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          disabled={locked}
          className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-sm disabled:bg-zinc-100"
        >
          <option value="">— Chọn —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          {sessionId && (
            <Link
              href={`/team/feedback/archive/${sessionId}`}
              className="text-xs text-zinc-500 underline hover:text-zinc-800"
            >
              Xem trong lưu trữ
            </Link>
          )}
          <button
            type="button"
            onClick={newSession}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
          >
            <Plus className="size-3" /> Phiên mới
          </button>
        </div>
      </div>

      <div className="flex min-h-[320px] max-h-[60vh] flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && !sending && (
          <p className="m-auto text-sm text-zinc-400">
            Ví dụ: &quot;Đánh giá tuần này của bạn ấy và gợi ý feedback&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-3.5 py-2 text-sm text-white'
                  : 'prose-sm max-w-[85%] rounded-2xl bg-zinc-100 px-3.5 py-2 text-sm text-zinc-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:mt-2 [&_h2]:font-bold [&_p]:my-1'
              }
            >
              {m.role === 'user' ? (
                m.content
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" /> AI đang soạn (có thể mất 10–60 giây)…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-zinc-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Nhập nội dung… (Enter gửi, Shift+Enter xuống dòng)"
          className="flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          <Send className="size-4" /> Gửi
        </button>
      </form>
    </div>
  );
}
