import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

// ----------------------------------
// Drive image helper (robust)
// ----------------------------------
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

// ----------------------------------
// UI helpers
// ----------------------------------
function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function ItemsSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="h-3 w-20 bg-slate-100 animate-pulse rounded" />
            <div className="mt-2 h-5 w-28 bg-slate-100 animate-pulse rounded" />
          </div>
        ))}
      </div>

      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <div className="h-12 w-12 rounded-xl bg-slate-100 animate-pulse" />
            <div className="flex-1">
              <div className="h-3 w-24 bg-slate-100 animate-pulse rounded" />
              <div className="mt-2 h-4 w-64 bg-slate-100 animate-pulse rounded" />
              <div className="mt-2 h-3 w-40 bg-slate-100 animate-pulse rounded" />
            </div>
            <div className="h-7 w-24 bg-slate-100 animate-pulse rounded-xl" />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Spinner({ className = "" }) {
  return (
    <svg className={["h-4 w-4 animate-spin", className].join(" ")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function Pill({ tone = "slate", children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", tones[tone] || tones.slate].join(" ")}>
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

// -------- numeric helpers ----------
function toPositiveNumberOrNull(str) {
  const s = String(str ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return n;
}

export default function CustomerOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [items, setItems] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [order, setOrder] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // draft customer input per barcode
  const [draft, setDraft] = useState({}); // { [barcode]: "123" }
  const [saving, setSaving] = useState({}); // { [barcode]: true }
  const [rowErr, setRowErr] = useState({}); // { [barcode]: msg }

  const [submitBusy, setSubmitBusy] = useState(false);
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [prefillRowBusy, setPrefillRowBusy] = useState({}); // { [barcode]: true }
  const [topMsg, setTopMsg] = useState("");

  async function refresh() {
    const data = await UK_API.getOrderItems(user.email, orderId);
    setItems(Array.isArray(data.items) ? data.items : []);
    setViewer(data.viewer || null);
    setOrder(data.order || null);

    // keep draft if user already typed; otherwise init missing keys
    setDraft((prev) => {
      const next = { ...prev };
      for (const it of Array.isArray(data.items) ? data.items : []) {
        const bc = String(it.barcode || "").trim();
        if (!bc) continue;
        if (next[bc] == null) {
          next[bc] =
            it.customer_bdt != null && String(it.customer_bdt) !== "0" ? String(it.customer_bdt) : "";
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
          init[bc] = it.customer_bdt != null && String(it.customer_bdt) !== "0" ? String(it.customer_bdt) : "";
        }
        setDraft(init);
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

  const canEditCustomerPrice = useMemo(() => {
    return status === "draft" || status === "priced" || status === "under_review";
  }, [status]);

  // totals: prefer server totals
  const totals = useMemo(() => {
    const qty = items.reduce((a, it) => a + (Number(it.ordered_quantity || 0) || 0), 0);
    return {
      qty,
      offered: Number(order?.total_offered_bdt || 0) || 0,
      customer: Number(order?.total_customer_bdt || 0) || 0,
      final: Number(order?.total_final_bdt || 0) || 0,
    };
  }, [items, order]);

  // ✅ submit enabled only when status=priced and every item has customer_bdt > 0 (draft values)
  const canSubmitForReview = useMemo(() => {
    if (status !== "priced") return false;
    if (!items.length) return false;

    for (const it of items) {
      const bc = String(it.barcode || "").trim();
      if (!bc) return false;

      const n = toPositiveNumberOrNull(draft[bc]);
      if (n == null) return false; // empty
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    return true;
  }, [status, items, draft]);

  // ✅ per-item: can prefill if offered>0 and customer is empty/0
  function canPrefillRow(it) {
    if (!canEditCustomerPrice) return false;
    const bc = String(it.barcode || "").trim();
    if (!bc) return false;

    const offeredUnit = Number(it.offered_bdt ?? it.selling_price_bdt ?? 0) || 0;
    if (offeredUnit <= 0) return false;

    const curDraft = String(draft[bc] ?? "").trim();
    const curN = Number(curDraft);
    // allow prefill when empty OR 0
    if (curDraft === "") return true;
    if (Number.isFinite(curN) && curN === 0) return true;
    return false;
  }

  async function commitCustomerBdt(it) {
    const bc = String(it.barcode || "").trim();
    if (!bc) return;

    if (!canEditCustomerPrice) {
      setRowErr((p) => ({ ...p, [bc]: "This order is read-only right now." }));
      return;
    }

    const nextStr = String(draft[bc] ?? "").trim();
    const serverStr = it.customer_bdt == null || String(it.customer_bdt) === "0" ? "" : String(it.customer_bdt);
    if (nextStr === serverStr) return;

    let val = "";
    if (nextStr !== "") {
      const n = Number(nextStr);
      if (!Number.isFinite(n)) {
        setRowErr((p) => ({ ...p, [bc]: "Customer price must be a number" }));
        return;
      }
      if (n < 0) {
        setRowErr((p) => ({ ...p, [bc]: "Customer price cannot be negative" }));
        return;
      }
      val = n;
    }

    setRowErr((p) => ({ ...p, [bc]: "" }));
    setSaving((p) => ({ ...p, [bc]: true }));

    try {
      await UK_API.customerUpdateOrderItems(user.email, orderId, [{ barcode: bc, customer_bdt: val }]);
      await refresh();
    } catch (e) {
      setRowErr((p) => ({ ...p, [bc]: e?.message || "Failed to update customer price" }));
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[bc];
        return next;
      });
    }
  }

  // ✅ NEW: per-item prefill button (offered -> customer) + save immediately
  async function prefillRowWithOffered(it) {
    const bc = String(it.barcode || "").trim();
    if (!bc) return;
    if (!canEditCustomerPrice) return;

    const offeredUnit = Number(it.offered_bdt ?? it.selling_price_bdt ?? 0) || 0;
    if (offeredUnit <= 0) return;

    setTopMsg("");
    setRowErr((p) => ({ ...p, [bc]: "" }));
    setPrefillRowBusy((p) => ({ ...p, [bc]: true }));
    setSaving((p) => ({ ...p, [bc]: true })); // show same saving indicator

    // optimistic draft set
    setDraft((p) => ({ ...p, [bc]: String(offeredUnit) }));

    try {
      await UK_API.customerUpdateOrderItems(user.email, orderId, [{ barcode: bc, customer_bdt: offeredUnit }]);
      await refresh();
    } catch (e) {
      setRowErr((p) => ({ ...p, [bc]: e?.message || "Failed to prefill" }));
    } finally {
      setPrefillRowBusy((p) => {
        const next = { ...p };
        delete next[bc];
        return next;
      });
      setSaving((p) => {
        const next = { ...p };
        delete next[bc];
        return next;
      });
    }
  }

  // ✅ Prefill ALL: set all customer_bdt = offered (only if offered>0)
  async function prefillAllWithOffered() {
    if (!canEditCustomerPrice) return;
    if (!items.length) return;

    setTopMsg("");
    setPrefillBusy(true);

    try {
      const payload = [];
      const nextDraft = { ...draft };

      for (const it of items) {
        const bc = String(it.barcode || "").trim();
        if (!bc) continue;

        const offeredUnit = Number(it.offered_bdt ?? it.selling_price_bdt ?? 0) || 0;
        if (offeredUnit > 0) {
          nextDraft[bc] = String(offeredUnit);
          payload.push({ barcode: bc, customer_bdt: offeredUnit });
        }
      }

      setDraft(nextDraft);

      if (!payload.length) {
        setTopMsg("No offered price found to prefill.");
        return;
      }

      await UK_API.customerUpdateOrderItems(user.email, orderId, payload);
      await refresh();

      setTopMsg("Prefilled customer prices with offered prices.");
    } catch (e) {
      setTopMsg(e?.message || "Failed to prefill");
    } finally {
      setPrefillBusy(false);
    }
  }

  // ✅ Submit: calls API to change status priced -> under_review
  async function submitForReview() {
    if (!canSubmitForReview) return;

    setTopMsg("");
    setSubmitBusy(true);

    try {
      // This MUST update order.status on the backend.
      await UK_API.customerSetUnderReview(user.email, orderId);
      await refresh();
      setTopMsg("Submitted for review.");
    } catch (e) {
      setTopMsg(e?.message || "Failed to submit for review");
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-3 md:p-4">
      {/* Header (dense) */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900">Order</h1>
            {status ? (
              <Pill tone={canEditCustomerPrice ? "green" : "slate"}>
                {status}
                {canEditCustomerPrice ? " • editable" : " • read-only"}
              </Pill>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 break-all">
            ID: <span className="font-semibold text-slate-700">{orderId}</span>
          </div>
        </div>

        <button
          onClick={() => nav("/customer/orders")}
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
        <ItemsSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No items found.
        </div>
      ) : (
        <>
          {/* Action bar (dense) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={prefillAllWithOffered}
              disabled={!canEditCustomerPrice || prefillBusy || submitBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Prefill all customer prices using offered_bdt (or selling_price_bdt fallback)"
            >
              {prefillBusy ? <Spinner /> : null}
              Prefill all with offered
            </button>

            <button
              type="button"
              onClick={submitForReview}
              disabled={!canSubmitForReview || submitBusy || prefillBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
              title={status !== "priced" ? "Only available when status is priced" : "Requires all customer_bdt > 0"}
            >
              {submitBusy ? <Spinner /> : null}
              Submit for review
            </button>

            {status === "priced" && !canSubmitForReview ? <Pill tone="amber">Fill all customer_bdt &gt; 0</Pill> : null}
          </div>

          {/* Totals */}
          <div className="mb-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard label="Total qty" value={String(totals.qty)} />
            <StatCard label="total_offered_bdt" value={`৳${money(order?.total_offered_bdt ?? totals.offered)}`} sub="Admin offered total" />
            <StatCard label="total_customer_bdt" value={`৳${money(order?.total_customer_bdt ?? totals.customer)}`} sub="Your total (counter)" />
            <StatCard label="total_final_bdt" value={`৳${money(order?.total_final_bdt ?? totals.final)}`} sub="Final after review" />
          </div>

          {/* Items */}
          <div className="space-y-2">
            {items.map((it, idx) => {
              const bc = String(it.barcode || "").trim();
              const busy = !!saving[bc] || !!prefillRowBusy[bc];
              const msg = rowErr[bc] || "";

              const offeredUnit = it.offered_bdt ?? it.selling_price_bdt ?? 0;
              const finalUnit = it.final_bdt ?? 0;

              const customerUnitStr = String(
                draft[bc] ??
                  (it.customer_bdt != null && String(it.customer_bdt) !== "0" ? String(it.customer_bdt) : "")
              );

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
                            Qty <span className="font-bold text-slate-900">{Number(it.ordered_quantity || 0)}</span>
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
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <div className="text-[10px] font-semibold text-slate-500">offered_bdt (unit)</div>
                          <div className="mt-0.5 text-sm font-extrabold text-slate-900">৳{money(offeredUnit)}</div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-semibold text-slate-500">customer_bdt (unit)</div>

                            {/* ✅ per-item prefill with offered */}
                            <button
                              type="button"
                              onClick={() => prefillRowWithOffered(it)}
                              disabled={!canPrefillRow(it) || busy || submitBusy || prefillBusy}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-extrabold text-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Set customer_bdt = offered_bdt"
                            >
                              {prefillRowBusy[bc] ? "..." : "Use offered"}
                            </button>
                          </div>

                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900">৳</span>
                            <input
                              value={customerUnitStr}
                              onChange={(e) => setDraft((p) => ({ ...p, [bc]: e.target.value }))}
                              onBlur={() => commitCustomerBdt(it)}
                              disabled={!canEditCustomerPrice || busy || !bc || submitBusy || prefillBusy}
                              inputMode="decimal"
                              placeholder="your price"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:opacity-60"
                            />
                          </div>

                          <div className="mt-1 text-[10px] text-slate-400">
                            {canEditCustomerPrice ? "Blur to save" : "Read-only for this status"}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <div className="text-[10px] font-semibold text-slate-500">final_bdt (unit)</div>
                          <div className="mt-0.5 text-sm font-extrabold text-slate-900">৳{money(finalUnit)}</div>
                          <div className="mt-1 text-[10px] text-slate-400">Admin set</div>
                        </div>
                      </div>

                      {/* Line totals */}
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <div className="text-[10px] font-semibold text-slate-500">Offered line</div>
                          <div className="text-[11px] font-extrabold text-slate-900">
                            ৳{money((Number(offeredUnit) || 0) * (Number(it.ordered_quantity || 0) || 0))}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <div className="text-[10px] font-semibold text-slate-500">Your line</div>
                          <div className="text-[11px] font-extrabold text-slate-900">
                            ৳{money((Number(customerUnitStr || 0) || 0) * (Number(it.ordered_quantity || 0) || 0))}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <div className="text-[10px] font-semibold text-slate-500">Final line</div>
                          <div className="text-[11px] font-extrabold text-slate-900">
                            ৳{money((Number(finalUnit) || 0) * (Number(it.ordered_quantity || 0) || 0))}
                          </div>
                        </div>
                      </div>

                      {/* tiny hint for priced */}
                      {status === "priced" && (!Number.isFinite(Number(customerUnitStr)) || Number(customerUnitStr) <= 0) ? (
                        <div className="mt-2 text-[10px] text-amber-700">Set a customer price (&gt; 0) to enable submit.</div>
                      ) : null}
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