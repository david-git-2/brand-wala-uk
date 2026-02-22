import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

// ----------------------------
// Drive image helper (same idea as ProductCard)
// ----------------------------
function toDirectGoogleImageUrl(url) {
  if (!url) return "";

  const s = String(url);

  // uc?id=FILEID
  const m1 = s.match(/[?&]id=([^&]+)/);
  // /file/d/FILEID/
  const m2 = s.match(/\/file\/d\/([^/]+)/);
  // open?id=FILEID
  const m3 = s.match(/open\?id=([^&]+)/);

  const fileId = m1?.[1] || m2?.[1] || m3?.[1];

  if (!fileId) return s;

  // Most reliable for direct display when shared publicly
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// ----------------------------
// Helpers
// ----------------------------
function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
function intish(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}
function safeStr(v) {
  if (v == null) return "";
  return String(v);
}
function toNumOrErr(v) {
  if (v === "" || v == null) return { ok: true, val: "" };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, val: null };
  return { ok: true, val: n };
}

// Only these fields are editable (admin)
const EDITABLE_FIELDS = new Set([
  "price_gbp",
  "case_size",
  "ordered_quantity",
  "shipped_quantity",
  "final_quantity",
  "product_weight",
  "package_weight",
  "selling_price_bdt",
  "offered_bdt",
  "final_bdt",          // ✅ editable
  // customer_bdt is intentionally NOT editable
]);

function Spinner({ className = "" }) {
  return (
    <svg
      className={["h-3.5 w-3.5 animate-spin", className].join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Field({ label, value, onChange, onBlur, disabled, right }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-semibold text-slate-600">{label}</div>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          inputMode="decimal"
          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-400 disabled:opacity-60"
        />
        {right || null}
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[10px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold text-slate-900">{value}</div>
    </div>
  );
}

function OrdersSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2">
      {/* Totals skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
            <div className="mt-2 h-3 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="mt-2 h-3 w-32 rounded bg-slate-100 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Cards skeleton */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <div className="h-6 w-8 rounded bg-slate-100 animate-pulse" />
            <div className="h-12 w-12 rounded-xl bg-slate-100 animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-72 rounded bg-slate-100 animate-pulse" />
              <div className="mt-2 h-3 w-40 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                <div className="mt-2 space-y-2">
                  <div className="h-7 w-full rounded bg-slate-100 animate-pulse" />
                  <div className="h-7 w-full rounded bg-slate-100 animate-pulse" />
                  <div className="h-7 w-full rounded bg-slate-100 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [items, setItems] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [order, setOrder] = useState(null); // if API provides it

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // draft: { [barcode]: { field: string } }
  const [draft, setDraft] = useState({});
  const [savingRow, setSavingRow] = useState({}); // { [barcode]: true } row-level spinner
  const [savingCell, setSavingCell] = useState({}); // { `${barcode}:${field}`: true } cell-level spinner
  const [rowErr, setRowErr] = useState({}); // { [barcode]: msg }

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");

      try {
        const data = await UK_API.getOrderItems(user.email, orderId);
        if (!alive) return;

        const next = Array.isArray(data.items) ? data.items : [];
        setItems(next);
        setViewer(data.viewer || null);
        setOrder(data.order || null);

        const init = {};
        for (const it of next) {
          const bc = String(it.barcode || "").trim();
          if (bc) init[bc] = {};
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

  const status = useMemo(() => {
    const s = String(order?.status || "").trim().toLowerCase();
    return s || "—";
  }, [order]);

  const isDelivered = status === "delivered";

  const totals = useMemo(() => {
    let ordered = 0;
    let shipped = 0;
    let finalQty = 0;
    let productGBP = 0;
    let curiaGBP = 0;
    let totalGBP = 0;

    for (const it of items) {
      const oq = Number(it.ordered_quantity || 0) || 0;
      const sq = Number(it.shipped_quantity || 0) || 0;
      const fq = Number(it.final_quantity || 0) || 0;

      ordered += oq;
      shipped += sq;
      finalQty += fq;

      productGBP += (Number(it.price_gbp || 0) || 0) * oq;
      curiaGBP += Number(it.curia_cost_gbp || 0) || 0;
      totalGBP += Number(it.total_cost_gbp || 0) || 0;
    }

    return { ordered, shipped, finalQty, productGBP, curiaGBP, totalGBP };
  }, [items]);

  function getDraftVal(it, key) {
    const bc = String(it.barcode || "").trim();
    if (!bc) return "";
    if (draft?.[bc] && Object.prototype.hasOwnProperty.call(draft[bc], key)) {
      return safeStr(draft[bc][key]);
    }
    return safeStr(it?.[key] ?? "");
  }

  function setDraftVal(bc, key, value) {
    setDraft((p) => ({
      ...p,
      [bc]: { ...(p[bc] || {}), [key]: value },
    }));
  }

  function clearDraftCell(bc, key) {
    setDraft((p) => {
      const next = { ...p };
      const row = { ...(next[bc] || {}) };
      delete row[key];
      next[bc] = row;
      return next;
    });
  }

  async function commitField(it, key, overrideValue) {
    const bc = String(it.barcode || "").trim();
    if (!bc) return;
    if (isDelivered) return;

    // customer_bdt should never be edited here
    if (key === "customer_bdt") return;

    if (!EDITABLE_FIELDS.has(key)) return;

    const nextStr = overrideValue != null ? String(overrideValue) : getDraftVal(it, key);
    const serverStr = it?.[key] == null ? "" : String(it[key]);

    if (String(nextStr) === String(serverStr)) {
      clearDraftCell(bc, key);
      return;
    }

    const parsed = toNumOrErr(nextStr);
    if (!parsed.ok) {
      setRowErr((p) => ({ ...p, [bc]: `Invalid number: ${key}` }));
      return;
    }

    setRowErr((p) => ({ ...p, [bc]: "" }));

    const cellK = `${bc}:${key}`;
    setSavingRow((p) => ({ ...p, [bc]: true }));
    setSavingCell((p) => ({ ...p, [cellK]: true }));

    try {
      await UK_API.updateOrderItems(user.email, orderId, [{ barcode: bc, [key]: parsed.val }]);

      setItems((prev) =>
        prev.map((x) => {
          if (String(x.barcode || "").trim() !== bc) return x;
          return { ...x, [key]: parsed.val, updated_at: new Date().toISOString() };
        })
      );

      clearDraftCell(bc, key);
    } catch (e) {
      setRowErr((p) => ({ ...p, [bc]: e?.message || "Failed to update" }));
    } finally {
      setSavingCell((p) => {
        const next = { ...p };
        delete next[cellK];
        return next;
      });
      setSavingRow((p) => {
        const next = { ...p };
        delete next[bc];
        return next;
      });
    }
  }

  async function copySellingToOffered(it) {
    const bc = String(it.barcode || "").trim();
    if (!bc) return;
    if (isDelivered) return;

    const selling = getDraftVal(it, "selling_price_bdt");
    setDraftVal(bc, "offered_bdt", selling);
    await commitField(it, "offered_bdt", selling);
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-3 md:p-4">
      {/* Header (compact) */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">Order Details</h1>
          <div className="mt-0.5 text-xs text-slate-500 break-all">
            Order ID: <span className="font-semibold text-slate-700">{orderId}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Status: <span className="font-semibold text-slate-700">{status}</span>
            {isDelivered ? <span className="ml-2 text-rose-500 font-semibold">(read-only)</span> : null}
          </div>
          {viewer ? (
            <div className="mt-0.5 text-[11px] text-slate-400">
              Viewer: {viewer.email} ({viewer.role})
            </div>
          ) : null}
        </div>

        <button
          onClick={() => nav("/admin/orders")}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          Back
        </button>
      </div>

      {err ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <OrdersSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No items found.
        </div>
      ) : (
        <>
          {/* Totals summary (compact) */}
          <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500">Qty</div>
              <div className="mt-0.5 text-xs text-slate-700">
                Ordered <span className="font-bold text-slate-900">{intish(totals.ordered)}</span>{" "}
                <span className="mx-1 text-slate-300">•</span>
                Shipped <span className="font-bold text-slate-900">{intish(totals.shipped)}</span>{" "}
                <span className="mx-1 text-slate-300">•</span>
                Final <span className="font-bold text-slate-900">{intish(totals.finalQty)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500">GBP totals</div>
              <div className="mt-0.5 text-xs text-slate-700">
                Product <span className="font-bold text-slate-900">£{money(totals.productGBP)}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-700">
                Curia <span className="font-bold text-slate-900">£{money(totals.curiaGBP)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500">Line totals</div>
              <div className="mt-0.5 text-xs text-slate-700">
                Total <span className="font-bold text-slate-900">£{money(totals.totalGBP)}</span>
              </div>
            </div>
          </div>

          {/* Item cards (compact, fits screen) */}
          <div className="space-y-2">
            {items.map((it, idx) => {
              const bc = String(it.barcode || "").trim();
              const rowBusy = !!savingRow[bc];
              const msg = rowErr[bc] || "";
              const canEdit = !!bc && !isDelivered;

              const src = toDirectGoogleImageUrl(it.image_url);

              return (
                <div key={bc || idx} className="rounded-xl border border-slate-200 bg-white p-3">
                  {/* Header row */}
                  <div className="flex items-start gap-2">
                    {/* SL */}
                    <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">
                      {idx + 1}
                    </div>

                    {/* Image */}
                    <div className="shrink-0">
                      <div className="h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
                        {src ? (
                          <img
                            src={src}
                            alt={it.name || "Product"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              // fallback: try original URL once
                              if (e.currentTarget.dataset.fallbackTried !== "1") {
                                e.currentTarget.dataset.fallbackTried = "1";
                                e.currentTarget.src = it.image_url || "";
                                return;
                              }
                              // final fallback: hide
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="text-[10px] text-slate-400">No image</div>
                        )}
                      </div>
                    </div>

                    {/* Title/meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{it.name || "—"}</div>
                          <div className="text-[11px] text-slate-500 truncate">{it.brand || "—"}</div>
                        </div>

                        <div className="text-[11px] text-slate-500 text-right flex items-center gap-1.5">
                          {rowBusy ? (
                            <>
                              <Spinner />
                              <span className="font-semibold text-slate-700">Saving…</span>
                            </>
                          ) : msg ? (
                            <span className="font-semibold text-rose-600">{msg}</span>
                          ) : canEdit ? (
                            <span className="font-semibold text-emerald-700">OK</span>
                          ) : (
                            <span className="font-semibold text-slate-400">Read-only</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Body grid (tight) */}
                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2">
                    {/* Quantities */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-600">Quantities</div>

                      <FieldWithCellSpinner
                        label="Ordered"
                        value={getDraftVal(it, "ordered_quantity")}
                        disabled={!canEdit || rowBusy}
                        onChange={(v) => setDraftVal(bc, "ordered_quantity", v)}
                        onBlur={() => commitField(it, "ordered_quantity")}
                        busy={!!savingCell[`${bc}:ordered_quantity`]}
                      />
                      <FieldWithCellSpinner
                        label="Shipped"
                        value={getDraftVal(it, "shipped_quantity")}
                        disabled={!canEdit || rowBusy}
                        onChange={(v) => setDraftVal(bc, "shipped_quantity", v)}
                        onBlur={() => commitField(it, "shipped_quantity")}
                        busy={!!savingCell[`${bc}:shipped_quantity`]}
                      />
                      <FieldWithCellSpinner
                        label="Final Qty"
                        value={getDraftVal(it, "final_quantity")}
                        disabled={!canEdit || rowBusy}
                        onChange={(v) => setDraftVal(bc, "final_quantity", v)}
                        onBlur={() => commitField(it, "final_quantity")}
                        busy={!!savingCell[`${bc}:final_quantity`]}
                      />
                    </div>

                    {/* Weights */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-600">Weights (gm)</div>

                      <FieldWithCellSpinner
                        label="Product"
                        value={getDraftVal(it, "product_weight")}
                        disabled={!canEdit || rowBusy}
                        onChange={(v) => setDraftVal(bc, "product_weight", v)}
                        onBlur={() => commitField(it, "product_weight")}
                        busy={!!savingCell[`${bc}:product_weight`]}
                      />
                      <FieldWithCellSpinner
                        label="Package"
                        value={getDraftVal(it, "package_weight")}
                        disabled={!canEdit || rowBusy}
                        onChange={(v) => setDraftVal(bc, "package_weight", v)}
                        onBlur={() => commitField(it, "package_weight")}
                        busy={!!savingCell[`${bc}:package_weight`]}
                      />
                    </div>

                    {/* Prices / Costs + Selling block */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                      <div>
                        <div className="text-[10px] font-bold text-slate-600">Prices / Costs</div>

                        <div className="mt-1.5 space-y-1.5">
                          <FieldWithCellSpinner
                            label="Price £ (unit)"
                            value={getDraftVal(it, "price_gbp")}
                            disabled={!canEdit || rowBusy}
                            onChange={(v) => setDraftVal(bc, "price_gbp", v)}
                            onBlur={() => commitField(it, "price_gbp")}
                            busy={!!savingCell[`${bc}:price_gbp`]}
                          />
                          <FieldWithCellSpinner
                            label="Case size"
                            value={getDraftVal(it, "case_size")}
                            disabled={!canEdit || rowBusy}
                            onChange={(v) => setDraftVal(bc, "case_size", v)}
                            onBlur={() => commitField(it, "case_size")}
                            busy={!!savingCell[`${bc}:case_size`]}
                          />
                        </div>
                      </div>

                      {/* ✅ Separate Selling section */}
                      <div className="rounded-xl border border-slate-200 bg-white p-2">
                        <div className="text-[10px] font-bold text-slate-700">Selling (৳)</div>

                        <div className="mt-1.5 space-y-1.5">
                          <FieldWithCellSpinner
                            label="Selling ৳ (unit)"
                            value={getDraftVal(it, "selling_price_bdt")}
                            disabled={!canEdit || rowBusy}
                            onChange={(v) => setDraftVal(bc, "selling_price_bdt", v)}
                            onBlur={() => commitField(it, "selling_price_bdt")}
                            busy={!!savingCell[`${bc}:selling_price_bdt`]}
                            right={
                              <button
                                type="button"
                                disabled={!canEdit || rowBusy}
                                onClick={() => copySellingToOffered(it)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Set offered_bdt = selling_price_bdt"
                              >
                                Copy →
                              </button>
                            }
                          />

                          <FieldWithCellSpinner
                            label="Offered ৳ (unit)"
                            value={getDraftVal(it, "offered_bdt")}
                            disabled={!canEdit || rowBusy}
                            onChange={(v) => setDraftVal(bc, "offered_bdt", v)}
                            onBlur={() => commitField(it, "offered_bdt")}
                            busy={!!savingCell[`${bc}:offered_bdt`]}
                          />

                          {/* ✅ NOT editable */}
                          <FieldWithCellSpinner
                            label="Customer ৳ (unit)"
                            value={safeStr(it.customer_bdt ?? "")}
                            disabled={true}
                            onChange={() => {}}
                            onBlur={() => {}}
                            busy={false}
                          />

                          <FieldWithCellSpinner
                            label="Final ৳ (unit)"
                            value={getDraftVal(it, "final_bdt")}
                            disabled={!canEdit || rowBusy}
                            onChange={(v) => setDraftVal(bc, "final_bdt", v)}
                            onBlur={() => commitField(it, "final_bdt")}
                            busy={!!savingCell[`${bc}:final_bdt`]}
                          />
                        </div>
                      </div>

                      {/* computed totals together (compact) */}
                      <div className="grid grid-cols-2 gap-2">
                        <MiniStat label="Curia £ (line)" value={`£${money(it.curia_cost_gbp)}`} />
                        <MiniStat label="Total £ (line)" value={`£${money(it.total_cost_gbp)}`} />
                        <MiniStat label="Curia ৳ (line)" value={`৳${money(it.curia_cost_bdt)}`} />
                        <MiniStat label="Total ৳ (line)" value={`৳${money(it.total_cost_bdt)}`} />
                      </div>
                    </div>
                  </div>

                  {!bc ? (
                    <div className="mt-2 text-[11px] font-semibold text-amber-700">
                      No barcode → cannot update this item (backend matches by order_id + barcode)
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            Tip: Edit a field and click outside (blur) to auto-save. Delivered orders are read-only.
          </div>
        </>
      )}
    </div>
  );
}

// Field wrapper that shows a tiny spinner when that specific cell is saving
function FieldWithCellSpinner({ busy, right, ...props }) {
  return (
    <Field
      {...props}
      right={
        <div className="flex items-center gap-1.5">
          {right || null}
          {busy ? <Spinner className="text-slate-600" /> : null}
        </div>
      }
    />
  );
}