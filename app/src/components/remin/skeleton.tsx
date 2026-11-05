/** Khung chờ phần số của trang Remin: dùng cho lần mở trang và mỗi lần đổi kỳ. */
export function ReminSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Đang tải số Remin">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 flex flex-col gap-3"
          >
            <div className="h-3 w-24 rounded bg-zinc-100" />
            <div className="h-8 w-40 max-w-full rounded bg-zinc-200" />
            <div className="h-3 w-48 max-w-full rounded bg-zinc-100" />
          </div>
        ))}
      </div>

      <div className="h-72 rounded-xl bg-white ring-1 ring-zinc-200" />
      <div className="h-72 rounded-xl bg-white ring-1 ring-zinc-200" />
    </div>
  );
}
