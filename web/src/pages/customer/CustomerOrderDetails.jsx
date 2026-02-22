import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  if (!fileId) return url;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function ItemsSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="h-20 w-20 rounded-xl bg-slate-100 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 bg-slate-100 animate-pulse rounded" />
            <div className="h-4 w-64 bg-slate-100 animate-pulse rounded" />
            <div className="h-3 w-40 bg-slate-100 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CustomerOrderDetails() {
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

  const canSeePrice = !!viewer?.can_see_price_gbp;

  const totals = useMemo(() => {
    let qty = 0;
    let gbp = 0;
    for (const it of items) {
      qty += Number(it.ordered_quantity || 0) || 0;
      if (canSeePrice && it.price_gbp != null) {
        gbp += (Number(it.price_gbp || 0) || 0) * (Number(it.ordered_quantity || 0) || 0);
      }
    }
    return { qty, gbp };
  }, [items, canSeePrice]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Items</h1>
          <p className="text-sm text-slate-500">
            Order ID: <span className="font-medium text-slate-700">{orderId}</span>
          </p>
        </div>

        <button
          onClick={() => nav("/customer/orders")}
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
        <ItemsSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          No items found.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it, idx) => {
            const src = toDirectGoogleImageUrl(it.image_url);
            return (
              <div key={`${it.product_id || it.barcode || idx}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-slate-50">
                  {src ? (
                    <img
                      src={src}
                      alt={it.name}
                      className="h-20 w-20 rounded-xl object-contain"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = it.image_url;
                      }}
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {it.brand}
                  </div>
                  <div className="truncate text-base font-semibold text-slate-900">
                    {it.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    <span className="font-medium">Product ID:</span> {it.product_id || "—"}
                    {it.barcode ? (
                      <>
                        <span className="mx-2">•</span>
                        <span className="font-medium">Barcode:</span> {it.barcode}
                      </>
                    ) : null}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm text-slate-700">
                      Qty: <span className="font-semibold">{Number(it.ordered_quantity || 0)}</span>
                    </div>
                    {canSeePrice && it.price_gbp != null ? (
                      <div className="text-sm font-semibold text-slate-900">
                        £{Number(it.price_gbp || 0).toFixed(2)}
                      </div>
                    ) : null}
                  </div>

                  {canSeePrice && it.price_gbp != null ? (
                    <div className="mt-2 text-xs text-slate-500">
                      Line total:{" "}
                      <span className="font-medium text-slate-900">
                        £{((Number(it.price_gbp || 0) || 0) * (Number(it.ordered_quantity || 0) || 0)).toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Totals */}
      {!loading && items.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Total quantity</span>
            <span className="font-semibold text-slate-900">{totals.qty}</span>
          </div>

          {canSeePrice ? (
            <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
              <span>Estimated total (GBP)</span>
              <span className="text-base font-bold text-slate-900">£{totals.gbp.toFixed(2)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}