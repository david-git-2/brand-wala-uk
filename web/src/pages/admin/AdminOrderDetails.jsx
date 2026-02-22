import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

export default function AdminOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [items, setItems] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");
      try {
        const data = await UK_API.getOrderItems(user.email, orderId);
        if (!alive) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setViewer(data.viewer || null);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load order items");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [user?.email, orderId]);

  const totals = useMemo(() => {
    let ordered = 0;
    let shipped = 0;
    let finalQty = 0;
    for (const it of items) {
      ordered += Number(it.ordered_quantity || 0) || 0;
      shipped += Number(it.shipped_quantity || 0) || 0;
      finalQty += Number(it.final_quantity || 0) || 0;
    }
    return { ordered, shipped, finalQty };
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Details (Admin)</h1>
          <p className="text-sm text-slate-500">
            Order ID: <span className="font-medium text-slate-700">{orderId}</span>
          </p>
          {viewer ? (
            <p className="mt-1 text-xs text-slate-400">
              Viewer: {viewer.email} ({viewer.role})
            </p>
          ) : null}
        </div>

        <button
          onClick={() => nav("/admin/orders")}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Back
        </button>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          No items found.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Shipped</th>
                    <th className="px-4 py-3 font-semibold">Final Qty</th>
                    <th className="px-4 py-3 font-semibold">Price (GBP)</th>
                    <th className="px-4 py-3 font-semibold">Costs</th>
                    <th className="px-4 py-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={`${it.product_id || it.barcode || idx}`} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{it.name || "—"}</div>
                        <div className="text-xs text-slate-500">{it.brand || "—"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          <span className="font-medium">product_id:</span> {it.product_id || "—"}
                          {it.barcode ? (
                            <>
                              <span className="mx-2">•</span>
                              <span className="font-medium">barcode:</span> {it.barcode}
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{Number(it.ordered_quantity || 0) || 0}</td>
                      <td className="px-4 py-3">{Number(it.shipped_quantity || 0) || 0}</td>
                      <td className="px-4 py-3">{Number(it.final_quantity || 0) || 0}</td>
                      <td className="px-4 py-3">£{Number(it.price_gbp || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>curia_gbp: {Number(it.curia_cost_gbp || 0)}</div>
                        <div>curia_bdt: {Number(it.curia_cost_bdt || 0)}</div>
                        <div>prod_bdt: {Number(it.product_cost_bdt || 0)}</div>
                        <div>total_gbp: {Number(it.total_cost_gbp || 0)}</div>
                        <div>total_bdt: {Number(it.total_cost_bdt || 0)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{it.updated_at || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Total ordered</span>
              <span className="font-semibold text-slate-900">{totals.ordered}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
              <span>Total shipped</span>
              <span className="font-semibold text-slate-900">{totals.shipped}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
              <span>Total final qty</span>
              <span className="font-semibold text-slate-900">{totals.finalQty}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}