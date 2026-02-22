import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

// -------------------------------
// Drive image helper (robust)
// -------------------------------
function driveFallbackUrls(url) {
  if (!url) return [];
  const s = String(url);

  const m1 = s.match(/[?&]id=([^&]+)/);
  const m2 = s.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  if (!fileId) return [s];

  return [
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`,
    `https://drive.google.com/uc?export=view&id=${fileId}`,
    `https://drive.google.com/uc?id=${fileId}`,
  ];
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function Spinner({ className = "" }) {
  return (
    <svg
      className={["h-4 w-4 animate-spin", className].join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-base font-extrabold text-slate-900">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1) + "%";
}

function signedMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const s = x < 0 ? "-" : "";
  return s + "৳" + Math.abs(x).toFixed(2);
}

// item cost in BDT (prefer total_cost_bdt, else product+curia)
function itemCostBdt(it) {
  const t = Number(it?.total_cost_bdt);
  if (Number.isFinite(t) && t > 0) return t;

  const p = Number(it?.product_cost_bdt);
  const c = Number(it?.curia_cost_bdt);
  const sum = (Number.isFinite(p) ? p : 0) + (Number.isFinite(c) ? c : 0);
  return sum > 0 ? sum : 0;
}

function profitPctFrom(cost, revenue) {
  const c = Number(cost);
  const r = Number(revenue);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(r)) return NaN;
  return ((r - c) / c) * 100;
}

function Pill({ tone = "slate", children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone] || tones.slate,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function DriveImg({ url, alt, className = "" }) {
  const candidates = useMemo(() => driveFallbackUrls(url), [url]);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] || "";

  if (!src) {
    return (
      <div className={["flex items-center justify-center text-[10px] text-slate-400", className].join(" ")}>
        No image
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || "Image"}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setIdx((p) => {
          const next = p + 1;
          return next < candidates.length ? next : p;
        });
      }}
    />
  );
}

function pctProfit(revenue, cost) {
  const r = Number(revenue);
  const c = Number(cost);
  if (!Number.isFinite(r) || !Number.isFinite(c) || c <= 0) return "—";
  return (((r - c) / c) * 100).toFixed(1) + "%";
}

function toNumberOrBlank(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default function AdminReviewOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [items, setItems] = useState([]);
  const [order, setOrder] = useState(null);
  const [viewer, setViewer] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [topMsg, setTopMsg] = useState("");

  // drafts for final price
  const [draftFinal, setDraftFinal] = useState({}); // { [barcode]: "123" }
  const [saving, setSaving] = useState({}); // { [barcode]: true }
  const [rowErr, setRowErr] = useState({}); // { [barcode]: msg }

  const [bulkBusy, setBulkBusy] = useState(false);

  async function refresh() {
    const data = await UK_API.getOrderItems(user.email, orderId);
    setItems(Array.isArray(data.items) ? data.items : []);
    setViewer(data.viewer || null);
    setOrder(data.order || null);

    setDraftFinal((prev) => {
      const next = { ...prev };
      for (const it of Array.isArray(data.items) ? data.items : []) {
        const bc = String(it.barcode || "").trim();
        if (!bc) continue;
        if (next[bc] == null) {
          next[bc] = it.final_bdt != null && String(it.final_bdt) !== "0" ? String(it.final_bdt) : "";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");
      setTopMsg("");

      try {
        const data = await UK_API.getOrderItems(user.email, orderId);
        if (!alive) return;

        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems(nextItems);
        setViewer(data.viewer || null);
        setOrder(data.order || null);

        const init = {};
        for (const it of nextItems) {
          const bc = String(it.barcode || "").trim();
          if (!bc) continue;
          init[bc] = it.final_bdt != null && String(it.final_bdt) !== "0" ? String(it.final_bdt) : "";
        }
        setDraftFinal(init);
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

  const status = useMemo(() => String(order?.status || "").trim().toLowerCase(), [order]);
  const costBase = useMemo(() => Number(order?.total_cost_bdt || 0) || 0, [order]);

  // totals (use server totals; fallback computed)
  const totals = useMemo(() => {
    const qty = items.reduce((a, it) => a + (Number(it.ordered_quantity || 0) || 0), 0);
    const offered = Number(order?.total_offered_bdt || 0) || 0;
    const customer = Number(order?.total_customer_bdt || 0) || 0;
    const final = Number(order?.total_final_bdt || 0) || 0;
    return { qty, offered, customer, final };
  }, [items, order]);

  async function commitFinalBdt(it) {
    const bc = String(it.barcode || "").trim();
    if (!bc) return;

    // UI hard block (server also blocks)
    if (status === "delivered") {
      setRowErr((p) => ({ ...p, [bc]: "Delivered orders are read-only." }));
      return;
    }

    const nextStr = String(draftFinal[bc] ?? "").trim();
    const serverStr = it.final_bdt == null || String(it.final_bdt) === "0" ? "" : String(it.final_bdt);

    if (nextStr === serverStr) return;

    let val = "";
    if (nextStr !== "") {
      const n = Number(nextStr);
      if (!Number.isFinite(n)) {
        setRowErr((p) => ({ ...p, [bc]: "Final price must be a number" }));
        return;
      }
      if (n < 0) {
        setRowErr((p) => ({ ...p, [bc]: "Final price cannot be negative" }));
        return;
      }
      val = n;
    }

    setRowErr((p) => ({ ...p, [bc]: "" }));
    setSaving((p) => ({ ...p, [bc]: true }));

    try {
      // ✅ Admin endpoint (existing): updateOrderItems
      await UK_API.updateOrderItems(user.email, orderId, [{ barcode: bc, final_bdt: val }]);
      await refresh();
    } catch (e) {
      setRowErr((p) => ({ ...p, [bc]: e?.message || "Failed to update final price" }));
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[bc];
        return next;
      });
    }
  }

  async function bulkSetFinalFrom(mode) {
    // mode: "customer" | "offered"
    if (!items.length) return;
    if (status === "delivered") return;

    setTopMsg("");
    setBulkBusy(true);

    try {
      const payload = [];
      const nextDraft = { ...draftFinal };

      for (const it of items) {
        const bc = String(it.barcode || "").trim();
        if (!bc) continue;

        const offeredUnit = Number(it.offered_bdt ?? it.selling_price_bdt ?? 0) || 0;
        const customerUnit = Number(it.customer_bdt ?? 0) || 0;

        const v = mode === "customer" ? customerUnit : offeredUnit;
        if (v > 0) {
          nextDraft[bc] = String(v);
          payload.push({ barcode: bc, final_bdt: v });
        }
      }

      setDraftFinal(nextDraft);

      if (!payload.length) {
        setTopMsg("Nothing to apply (no positive source prices found).");
        return;
      }

      await UK_API.updateOrderItems(user.email, orderId, payload);
      await refresh();
      setTopMsg(mode === "customer" ? "Set all final prices from customer prices." : "Set all final prices from offered prices.");
    } catch (e) {
      setTopMsg(e?.message || "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-3 md:p-4">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900">Review pricing</h1>
            {status ? <Pill tone={status === "under_review" ? "amber" : "slate"}>{status}</Pill> : null}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 break-all">
            ID: <span className="font-semibold text-slate-700">{orderId}</span>
          </div>
        </div>

        <button
          onClick={() => nav(`/admin/orders`)}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          Back
        </button>
      </div>

      {err ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
      ) : null}

      {topMsg ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{topMsg}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No items found.
        </div>
      ) : (
        <>
          {/* Action bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => bulkSetFinalFrom("customer")}
              disabled={bulkBusy || status === "delivered"}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Set all final_bdt = customer_bdt (only when >0)"
            >
              {bulkBusy ? <Spinner /> : null}
              Final = customer
            </button>

            <button
              type="button"
              onClick={() => bulkSetFinalFrom("offered")}
              disabled={bulkBusy || status === "delivered"}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Set all final_bdt = offered_bdt (or selling_price_bdt) (only when >0)"
            >
              {bulkBusy ? <Spinner /> : null}
              Final = offered
            </button>

            {status === "delivered" ? <Pill tone="red">Delivered: read-only</Pill> : null}
          </div>

          {/* Totals + Profit vs cost base */}
          <div className="mb-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard label="Total qty" value={String(totals.qty)} />
            <StatCard label="total_cost_bdt (base)" value={`৳${money(costBase)}`} sub="Used for profit %" />
            <StatCard
              label="Offered ৳ (profit %)"
              value={`৳${money(totals.offered)}`}
              sub={costBase > 0 ? `Profit: ${pctProfit(totals.offered, costBase)}` : "Profit: —"}
            />
            <StatCard
              label="Customer ৳ (profit %)"
              value={`৳${money(totals.customer)}`}
              sub={costBase > 0 ? `Profit: ${pctProfit(totals.customer, costBase)}` : "Profit: —"}
            />
          </div>

          <div className="mb-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard
              label="Final ৳ (profit %)"
              value={`৳${money(totals.final)}`}
              sub={costBase > 0 ? `Profit: ${pctProfit(totals.final, costBase)}` : "Profit: —"}
            />
            <StatCard
              label="Margin (final - cost)"
              value={costBase > 0 ? `৳${money(totals.final - costBase)}` : "—"}
              sub="Order-level"
            />
            <StatCard label="Viewer" value={viewer?.email ? String(viewer.email) : "—"} sub="Admin view" />
            <StatCard label="Status note" value={status === "under_review" ? "Review & set final" : status || "—"} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            {items.map((it, idx) => {
              const bc = String(it.barcode || "").trim();
              const busy = !!saving[bc];
              const msg = rowErr[bc] || "";

              const qty = Number(it.ordered_quantity || 0) || 0;
              const offeredUnit = Number(it.offered_bdt ?? it.selling_price_bdt ?? 0) || 0;
              const customerUnit = Number(it.customer_bdt ?? 0) || 0;

              const finalStr = String(
                draftFinal[bc] ??
                  (it.final_bdt != null && String(it.final_bdt) !== "0" ? String(it.final_bdt) : "")
              );
              const finalUnit = toNumberOrBlank(finalStr);

              const offeredLine = offeredUnit * qty;
              const customerLine = customerUnit * qty;
              const finalLine = (Number.isFinite(finalUnit) ? finalUnit : 0) * qty;

              // ✅ per-item cost/margin/profit (MUST be inside map where `it` exists)
              const costLine = itemCostBdt(it);
              const costUnit = qty > 0 ? costLine / qty : 0;

              const offeredMargin = offeredLine - costLine;
              const customerMargin = customerLine - costLine;
              const finalMargin = finalLine - costLine;

              const offeredPct = profitPctFrom(costLine, offeredLine);
              const customerPct = profitPctFrom(costLine, customerLine);
              const finalPct = profitPctFrom(costLine, finalLine);

              return (
                <div key={`${it.product_id || it.barcode || idx}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <DriveImg url={it.image_url} alt={it.name} className="h-11 w-11 object-cover" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 truncate">
                            {it.brand || "—"}
                          </div>
                          <div className="text-sm font-bold text-slate-900 truncate">{it.name || "—"}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            Qty <span className="font-bold text-slate-900">{qty}</span>
                            {it.case_size ? (
                              <>
                                <span className="mx-1.5 text-slate-300">•</span>
                                Case <span className="font-bold text-slate-900">{it.case_size}</span>
                              </>
                            ) : null}
                            {bc ? (
                              <>
                                <span className="mx-1.5 text-slate-300">•</span>
                                <span className="break-all">BC {bc}</span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {busy ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                              <Spinner /> Saving
                            </span>
                          ) : msg ? (
                            <span className="text-[11px] font-semibold text-rose-600">{msg}</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Unit fields */}
                      {/* Unit fields (dense: includes profit % + margin) */}
<div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
  {/* Offered */}
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
    <div className="flex items-center justify-between">
      <div className="text-[10px] font-semibold text-slate-500">offered_bdt</div>
      <div className="text-[10px] font-semibold text-slate-400">unit</div>
    </div>

    <div className="mt-0.5 text-sm font-extrabold text-slate-900">৳{money(offeredUnit)}</div>

    <div className="mt-1 grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="text-[9px] font-semibold text-slate-500">line</div>
        <div className="text-[11px] font-extrabold text-slate-900">৳{money(offeredLine)}</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="text-[9px] font-semibold text-slate-500">profit</div>
        <div className="text-[11px] font-extrabold text-slate-900">
          {costLine > 0 ? fmtPct(offeredPct) : "—"}
        </div>
      </div>
    </div>

    <div className="mt-1 text-[10px] text-slate-500">
      margin: <span className="font-extrabold text-slate-900">{costLine > 0 ? signedMoney(offeredMargin) : "—"}</span>
    </div>
  </div>

  {/* Customer */}
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
    <div className="flex items-center justify-between">
      <div className="text-[10px] font-semibold text-slate-500">customer_bdt</div>
      <div className="text-[10px] font-semibold text-slate-400">unit</div>
    </div>

    <div className="mt-0.5 text-sm font-extrabold text-slate-900">৳{money(customerUnit)}</div>

    <div className="mt-1 grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="text-[9px] font-semibold text-slate-500">line</div>
        <div className="text-[11px] font-extrabold text-slate-900">৳{money(customerLine)}</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="text-[9px] font-semibold text-slate-500">profit</div>
        <div className="text-[11px] font-extrabold text-slate-900">
          {costLine > 0 ? fmtPct(customerPct) : "—"}
        </div>
      </div>
    </div>

    <div className="mt-1 text-[10px] text-slate-500">
      margin: <span className="font-extrabold text-slate-900">{costLine > 0 ? signedMoney(customerMargin) : "—"}</span>
    </div>

    <div className="mt-1 text-[10px] text-slate-400">Customer entered</div>
  </div>

  {/* Final (editable) */}
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] font-semibold text-slate-500">final_bdt • admin</div>
      <div className="text-[10px] font-semibold text-slate-400">unit</div>
    </div>

    <div className="mt-1 flex items-center gap-2">
      <span className="text-sm font-extrabold text-slate-900">৳</span>
      <input
        value={finalStr}
        onChange={(e) => setDraftFinal((p) => ({ ...p, [bc]: e.target.value }))}
        onBlur={() => commitFinalBdt(it)}
        disabled={busy || !bc || status === "delivered" || bulkBusy}
        inputMode="decimal"
        placeholder="final"
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:opacity-60"
      />
    </div>

    <div className="mt-1 grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="text-[9px] font-semibold text-slate-500">line</div>
        <div className="text-[11px] font-extrabold text-slate-900">৳{money(finalLine)}</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="text-[9px] font-semibold text-slate-500">profit</div>
        <div className="text-[11px] font-extrabold text-slate-900">
          {costLine > 0 ? fmtPct(finalPct) : "—"}
        </div>
      </div>
    </div>

    <div className="mt-1 text-[10px] text-slate-500">
      margin: <span className="font-extrabold text-slate-900">{costLine > 0 ? signedMoney(finalMargin) : "—"}</span>
    </div>

    <div className="mt-1 text-[10px] text-slate-400">Blur to save</div>
  </div>
</div>
              

                      {/* Profit hint (order-level base) */}
                      {costBase > 0 ? (
                        <div className="mt-2 text-[10px] text-slate-500">
                          Order profit vs cost base: Offered{" "}
                          <span className="font-semibold">{pctProfit(totals.offered, costBase)}</span>, Customer{" "}
                          <span className="font-semibold">{pctProfit(totals.customer, costBase)}</span>, Final{" "}
                          <span className="font-semibold">{pctProfit(totals.final, costBase)}</span>
                        </div>
                      ) : (
                        <div className="mt-2 text-[10px] text-slate-400">No total_cost_bdt available to compute profit %.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}