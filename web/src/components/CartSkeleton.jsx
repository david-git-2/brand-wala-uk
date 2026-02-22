export default function CartSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-slate-100 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
            <div className="h-4 w-64 max-w-full rounded bg-slate-100 animate-pulse" />
            <div className="mt-3 flex items-center justify-between">
              <div className="h-8 w-40 rounded bg-slate-100 animate-pulse" />
              <div className="h-8 w-24 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}