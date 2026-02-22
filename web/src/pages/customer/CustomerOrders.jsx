import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

function Badge({ status }) {
  const s = String(status || "").trim();
  const cls =
    s === "delivered"
      ? "bg-emerald-50 text-emerald-700"
      : s === "cancelled"
      ? "bg-rose-50 text-rose-700"
      : s === "submitted"
      ? "bg-blue-50 text-blue-700"
      : s === "priced"
      ? "bg-amber-50 text-amber-700"
      : "bg-slate-100 text-slate-700";

  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{s || "—"}</span>;
}

function OrdersSkeleton({ rows = 6 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-56 bg-slate-100 animate-pulse rounded" />
              <div className="h-3 w-40 bg-slate-100 animate-pulse rounded" />
            </div>
            <div className="h-8 w-24 bg-slate-100 animate-pulse rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const canSeePrice = !!user?.can_see_price_gbp;

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email) return;
      setLoading(true);
      setErr("");
      try {
        const data = await UK_API.getOrders(user.email);
        if (!alive) return;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load orders");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [user?.email]);

  const sorted = useMemo(() => {
    // If your sheet has created_at in customer view later, we can sort by it.
    // For now: keep as-is, but you can sort by order_id.
    return [...orders].reverse();
  }, [orders]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Orders</h1>
          <p className="text-sm text-slate-500">View your submitted and processed orders.</p>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <OrdersSkeleton />
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          No orders yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="divide-y divide-slate-100">
            {sorted.map((o) => (
              <div key={o.order_id} className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-base font-semibold text-slate-900">
                      {o.order_name || "Untitled"}
                    </div>
                    <Badge status={o.status} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    <span className="font-medium">Order ID:</span> {o.order_id}
                    <span className="mx-2">•</span>
                    <span className="font-medium">Qty:</span> {Number(o.total_order_quantity || 0)}
                    <span className="mx-2">•</span>
                    <span className="font-medium">Total (BDT):</span> {Number(o.total_cost_bdt || 0)}
                    {canSeePrice && o.total_cost_gbp != null ? (
                      <>
                        <span className="mx-2">•</span>
                        <span className="font-medium">Total (GBP):</span> £{Number(o.total_cost_gbp || 0).toFixed(2)}
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => navigate(`/customer/orders/${o.order_id}`)}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}