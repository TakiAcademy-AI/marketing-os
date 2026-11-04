export default function ReminLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-48 rounded-md bg-zinc-200" />
        <div className="h-4 w-96 max-w-full rounded-md bg-zinc-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 flex flex-col gap-3"
          >
            <div className="h-3 w-24 rounded bg-zinc-100" />
            <div className="h-8 w-40 rounded bg-zinc-200" />
            <div className="h-3 w-48 max-w-full rounded bg-zinc-100" />
          </div>
        ))}
      </div>

      <div className="h-72 rounded-xl bg-white ring-1 ring-zinc-200" />
      <div className="h-72 rounded-xl bg-white ring-1 ring-zinc-200" />
    </div>
  );
}
