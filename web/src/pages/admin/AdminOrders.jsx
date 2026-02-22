import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

// lucide icons
import {
  Package,
  RefreshCcw,
  Scale,
  Eye,
  Truck,
  Percent,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

function OrdersSkeleton({ rows = 10 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-72 bg-slate-100 animate-pulse rounded" />
              <div className="h-3 w-56 bg-slate-100 animate-pulse rounded" />
            </div>
            <div className="h-8 w-40 bg-slate-100 animate-pulse rounded-xl" />
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((__, j) => (
              <div key={j} className="h-10 bg-slate-100 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Spinner({ className = "" }) {
  return <Loader2 className={["h-4 w-4 animate-spin", className].join(" ")} aria-hidden="true" />;
}

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}
function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return String(Math.round(x));
}
function parseBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}
function safeTime(v) {
  const t = new Date(String(v || "")).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-slate-900" : "bg-slate-200",
        disabled ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
      ].join(" ")}
      aria-pressed={checked}
      aria-label="Toggle"
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          checked ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={["mt-0.5 text-sm", strong ? "font-bold text-slate-900" : "font-semibold text-slate-800"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function Pill({ tone = "slate", icon: Icon, children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold", tones[tone] || tones.slate].join(" ")}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

function IconButton({ tone = "slate", disabled, onClick, icon: Icon, children, title }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition";
  const tones = {
    slate: disabled
      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
      : "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
    primary: disabled
      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
      : "bg-slate-900 text-white hover:bg-slate-800",
    amber: disabled
      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
      : "bg-amber-600 text-white hover:bg-amber-700",
  };

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={[base, tones[tone] || tones.slate].join(" ")}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export default function AdminOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [assigning, setAssigning] = useState({});
  const [assignErr, setAssignErr] = useState({});

  const [savingProfit, setSavingProfit] = useState({});
  const [profitErr, setProfitErr] = useState({});

  const [recalcBusy, setRecalcBusy] = useState({});
  const [recalcErr, setRecalcErr] = useState({});

  const [profitDraft, setProfitDraft] = useState({});
  // add near other state
const [statusBusy, setStatusBusy] = useState({});
const [statusErr, setStatusErr] = useState({});

// allowed statuses (admin dropdown)
const STATUS_OPTIONS = [
  { value: "draft", label: "draft" },
  { value: "submitted", label: "submitted" },
  { value: "priced", label: "priced" },
  { value: "under_review", label: "under_review" },
  { value: "finalized", label: "finalized" },
  { value: "processing", label: "processing" },
  { value: "partially_delivered", label: "partially_delivered" },
  { value: "delivered", label: "delivered" },
  { value: "cancelled", label: "cancelled" },
];

async function onChangeStatus(orderId, nextStatus) {
  const oid = String(orderId || "").trim();
  const st = String(nextStatus || "").trim();
  if (!oid || !st) return;

  // hard block in UI (server also blocks)
  const current = orders.find((o) => String(o.order_id || "").trim() === oid);
  const curStatus = String(current?.status || "").toLowerCase().trim();
  if (curStatus === "delivered") return;

  setStatusErr((p) => ({ ...p, [oid]: "" }));
  setStatusBusy((p) => ({ ...p, [oid]: true }));

  try {
    await UK_API.updateOrderStatus(user.email, oid, st);

    setOrders((prev) =>
      prev.map((o) => {
        if (String(o.order_id || "").trim() !== oid) return o;
        return { ...o, status: st, updated_at: new Date().toISOString() };
      })
    );
  } catch (e) {
    setStatusErr((p) => ({ ...p, [oid]: e?.message || "Failed to update status" }));
  } finally {
    setStatusBusy((p) => {
      const next = { ...p };
      delete next[oid];
      return next;
    });
  }
}

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email) return;

      setLoading(true);
      setErr("");

      try {
        const [ordersRes, shipmentsRes] = await Promise.all([
          UK_API.getOrders(user.email),
          UK_API.shipmentGetAll(user.email),
        ]);

        if (!alive) return;

        const nextOrders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];
        setOrders(nextOrders);
        setShipments(Array.isArray(shipmentsRes.shipments) ? shipmentsRes.shipments : []);

        const init = {};
        for (const o of nextOrders) {
          const oid = String(o.order_id || "").trim();
          if (!oid) continue;
          init[oid] = {
            profit_rate: String(o.profit_rate ?? ""),
            profit_on_just_product: parseBool(o.profit_on_just_product),
          };
        }
        setProfitDraft(init);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load orders/shipments");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [user?.email]);

  const shipmentsById = useMemo(() => {
    const m = new Map();
    for (const s of shipments) {
      const id = String(s.shipment_id || "").trim();
      if (id) m.set(id, s);
    }
    return m;
  }, [shipments]);

  const sorted = useMemo(() => {
    const copy = [...orders];
    if (orders.some((o) => o.created_at)) {
      copy.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      return copy;
    }
    return copy.reverse();
  }, [orders]);

  function getDraft(oid) {
    return profitDraft[oid] || { profit_rate: "", profit_on_just_product: false };
  }

  function isProfitDirty(o) {
    const oid = String(o.order_id || "").trim();
    if (!oid) return false;
    const d = getDraft(oid);
    const serverRate = String(o.profit_rate ?? "");
    const serverToggle = parseBool(o.profit_on_just_product);
    return String(d.profit_rate ?? "") !== serverRate || !!d.profit_on_just_product !== !!serverToggle;
  }

  function needsRecalc(o, ship) {
    const sid = String(o.shipment_id || "").trim();
    if (!sid || !ship) return false;

    const shipT = safeTime(ship.updated_at);
    const ordT = safeTime(o.shipment_updated);

    if (!Number.isFinite(ordT)) return true;
    if (!Number.isFinite(shipT)) return false;

    return shipT > ordT;
  }

  async function onRecalculate(orderId) {
    const oid = String(orderId || "").trim();
    if (!oid) return;

    setRecalcErr((p) => ({ ...p, [oid]: "" }));
    setRecalcBusy((p) => ({ ...p, [oid]: true }));

    try {
      const res = await UK_API.orderShipmentRecalculate(user.email, oid);
      const t = res?.totals || {};

      setOrders((prev) =>
        prev.map((o) => {
          if (String(o.order_id || "").trim() !== oid) return o;
          return {
            ...o,
            total_order_quantity: t.total_order_quantity ?? o.total_order_quantity,
            total_product_cost_gbp: t.total_product_cost_gbp ?? o.total_product_cost_gbp,
            total_product_cost_bdt: t.total_product_cost_bdt ?? o.total_product_cost_bdt,
            total_curia_cost_gbp: t.total_curia_cost_gbp ?? o.total_curia_cost_gbp,
            total_curia_cost_bdt: t.total_curia_cost_bdt ?? o.total_curia_cost_bdt,
            total_cost_gbp: t.total_cost_gbp ?? o.total_cost_gbp,
            total_cost_bdt: t.total_cost_bdt ?? o.total_cost_bdt,
            shipment_updated: res?.shipment_updated ?? o.shipment_updated,
            updated_at: new Date().toISOString(),
          };
        })
      );
    } catch (e) {
      setRecalcErr((p) => ({ ...p, [oid]: e?.message || "Failed to recalculate" }));
    } finally {
      setRecalcBusy((p) => {
        const next = { ...p };
        delete next[oid];
        return next;
      });
    }
  }

  async function onChangeShipment(orderId, shipmentId) {
    const oid = String(orderId || "").trim();
    const sid = String(shipmentId || "").trim();
    if (!oid) return;

    if (!sid) {
      setOrders((prev) => prev.map((o) => (o.order_id === oid ? { ...o, shipment_id: "" } : o)));
      return;
    }

    setAssignErr((p) => ({ ...p, [oid]: "" }));
    setAssigning((p) => ({ ...p, [oid]: true }));

    setOrders((prev) => prev.map((o) => (o.order_id === oid ? { ...o, shipment_id: sid } : o)));

    try {
      const res = await UK_API.orderSetShipment(user.email, oid, sid);
      const t = res?.totals || {};

      setOrders((prev) =>
        prev.map((o) => {
          if (o.order_id !== oid) return o;
          return {
            ...o,
            shipment_id: sid,
            shipment_updated: res?.shipment_updated ?? o.shipment_updated,
            total_order_quantity: t.total_order_quantity ?? o.total_order_quantity,
            total_product_cost_gbp: t.total_product_cost_gbp ?? o.total_product_cost_gbp,
            total_product_cost_bdt: t.total_product_cost_bdt ?? o.total_product_cost_bdt,
            total_curia_cost_gbp: t.total_curia_cost_gbp ?? o.total_curia_cost_gbp,
            total_curia_cost_bdt: t.total_curia_cost_bdt ?? o.total_curia_cost_bdt,
            total_cost_gbp: t.total_cost_gbp ?? o.total_cost_gbp,
            total_cost_bdt: t.total_cost_bdt ?? o.total_cost_bdt,
            updated_at: new Date().toISOString(),
          };
        })
      );
    } catch (e) {
      setAssignErr((p) => ({ ...p, [oid]: e?.message || "Failed to set shipment" }));
    } finally {
      setAssigning((p) => {
        const next = { ...p };
        delete next[oid];
        return next;
      });
    }
  }

  async function onSaveProfit(orderId) {
    const oid = String(orderId || "").trim();
    if (!oid) return;

    const d = getDraft(oid);
    const profit_rate = Number(d.profit_rate);
    if (!Number.isFinite(profit_rate)) {
      setProfitErr((p) => ({ ...p, [oid]: "Profit rate must be a number" }));
      return;
    }

    setProfitErr((p) => ({ ...p, [oid]: "" }));
    setSavingProfit((p) => ({ ...p, [oid]: true }));

    try {
      const res = await UK_API.orderSetProfit(user.email, oid, profit_rate, d.profit_on_just_product);
      const totals = res?.totals || {};

      setOrders((prev) =>
        prev.map((o) => {
          if (o.order_id !== oid) return o;
          return {
            ...o,
            profit_rate,
            profit_on_just_product: d.profit_on_just_product ? "true" : "false",
            total_offered_bdt: totals.total_offered_bdt ?? o.total_offered_bdt,
            total_customer_bdt: totals.total_customer_bdt ?? o.total_customer_bdt,
            total_final_bdt: totals.total_final_bdt ?? o.total_final_bdt,
            updated_at: new Date().toISOString(),
          };
        })
      );
    } catch (e) {
      setProfitErr((p) => ({ ...p, [oid]: e?.message || "Failed to update profit" }));
    } finally {
      setSavingProfit((p) => {
        const next = { ...p };
        delete next[oid];
        return next;
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      {/* Top Bar */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-slate-900" />
            <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
            <Pill tone="slate">{sorted.length} total</Pill>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Assign shipments, recalculate when shipment changes, and set profit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <IconButton tone="slate" icon={Truck} onClick={() => navigate("/admin/shipments")}>
            Shipments
          </IconButton>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{err}</div>
      ) : null}

      {loading ? (
        <OrdersSkeleton />
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          No orders found.
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((o) => {
            const oid = String(o.order_id || "").trim();
            const sid = String(o.shipment_id || "").trim();

            const shipBusy = !!assigning[oid];
            const profitBusy = !!savingProfit[oid];
            const recalcLoading = !!recalcBusy[oid];

            const shipMsg = assignErr[oid] || "";
            const profitMsg = profitErr[oid] || "";
            const recalcMsg = recalcErr[oid] || "";

            const ship = sid ? shipmentsById.get(sid) : null;
            const draft = getDraft(oid);
            const dirty = isProfitDirty(o);

            const showRecalc = needsRecalc(o, ship);
            const canRecalc = !!sid && showRecalc && !recalcLoading && !shipBusy && !profitBusy;

            const status = String(o.status || "—").toLowerCase();

            return (
              <div key={oid} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                {/* Card Header */}
                <div className="p-4 md:p-5 border-b border-slate-100">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900 truncate">
                          {o.order_name || "Untitled"}
                        </h2>

                        <Pill tone="slate">
                          {status}
                        </Pill>

                        {sid ? (
                          showRecalc ? (
                            <Pill tone="amber" icon={AlertTriangle}>
                              Recalc needed
                            </Pill>
                          ) : (
                            <Pill tone="green" icon={CheckCircle2}>
                              Up to date
                            </Pill>
                          )
                        ) : (
                          <Pill tone="red" icon={AlertTriangle}>
                            No shipment
                          </Pill>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-slate-500 break-all">{oid}</div>

                      {/* Inline error banners */}
                      {shipMsg ? (
                        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                          {shipMsg}
                        </div>
                      ) : null}
                      {recalcMsg ? (
                        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                          {recalcMsg}
                        </div>
                      ) : null}
                    </div>

                    {/* Primary actions */}
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                       
  <IconButton
    tone="primary"
    icon={CheckCircle2}
    onClick={() => navigate(`/admin/orders/${oid}/review`)}
    title="Review customer prices and set final prices"
  >
    Review price
  </IconButton>

                      <IconButton
                        tone="slate"
                        icon={Scale}
                        onClick={() => navigate(`/admin/orders/${oid}/weights`)}
                        disabled={false}
                        title="Edit weights"
                      >
                        Weights
                      </IconButton>

                      <IconButton
                        tone="amber"
                        icon={RefreshCcw}
                        onClick={() => onRecalculate(oid)}
                        disabled={!canRecalc}
                        title={!sid ? "Assign shipment first" : showRecalc ? "Recalculate totals" : "Up to date"}
                      >
                        {recalcLoading ? <Spinner className="h-4 w-4" /> : null}
                        Recalc
                      </IconButton>

                      <IconButton
                        tone="primary"
                        icon={Eye}
                        onClick={() => navigate(`/admin/orders/${oid}`)}
                      >
                        View
                      </IconButton>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold text-slate-500">Creator</div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-900">{o.creator_name || "—"}</div>
                      <div className="text-xs text-slate-500 break-all">{o.creator_email || "—"}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold text-slate-500">Timing</div>
                      <div className="mt-0.5 text-xs text-slate-600">Created: <span className="font-semibold text-slate-900">{o.created_at || "—"}</span></div>
                      <div className="text-xs text-slate-600">Updated: <span className="font-semibold text-slate-900">{o.updated_at || "—"}</span></div>
                      {sid ? (
                        <div className="text-xs text-slate-600">
                          Shipment used at: <span className="font-semibold text-slate-900">{o.shipment_updated || "—"}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold text-slate-500">Quantity</div>
                      <div className="mt-0.5 text-sm font-bold text-slate-900">{fmtInt(o.total_order_quantity || 0)}</div>
                      <div className="text-xs text-slate-500">Total units</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold text-slate-500">Shipment</div>
                      {ship ? (
                        <>
                          <div className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{ship.name || "—"}</div>
                          <div className="text-xs text-slate-500 break-all">{sid}</div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Updated: <span className="font-semibold">{ship.updated_at || "—"}</span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-0.5 text-sm font-semibold text-slate-500">—</div>
                      )}
                    </div>
                  </div>

                  {/* Recalc callout */}
                  {sid && showRecalc ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-semibold">Shipment rates changed</div>
                        <div className="text-amber-700">
                          Shipment was updated after this order’s last calculation. Click <span className="font-semibold">Recalc</span> to update totals and curia.
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Card body */}
                <div className="p-4 md:p-5">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Totals */}
                    <div className="lg:col-span-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="h-4 w-4 text-slate-900" />
                        <div className="text-xs font-bold text-slate-900">Totals</div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Stat label="Product £" value={`£${fmtMoney(o.total_product_cost_gbp)}`} />
                        <Stat label="Curia £" value={`£${fmtMoney(o.total_curia_cost_gbp)}`} />
                        <Stat label="Total £" value={`£${fmtMoney(o.total_cost_gbp)}`} strong />
                        <Stat label="Total ৳" value={`৳${fmtMoney(o.total_cost_bdt)}`} strong />

                        <Stat label="Offered ৳" value={`৳${fmtMoney(o.total_offered_bdt)}`} strong />
                        <Stat label="Final ৳" value={`৳${fmtMoney(o.total_final_bdt)}`} strong />
                        <Stat label="Customer ৳" value={`৳${fmtMoney(o.total_customer_bdt)}`} />
                        <Stat label="Profit rate (%)" value={String(o.profit_rate ?? "—")} />
                      </div>
                    </div>

                    {/* Right column */}
                    <div className="lg:col-span-1 space-y-3">
                         {/* Status */}
  <div className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900">
        <CheckCircle2 className="h-4 w-4" /> Status
      </div>

      {!!statusBusy[oid] ? (
        <span className="inline-flex items-center gap-2 text-xs text-slate-600">
          <Spinner className="h-3 w-3" /> Saving…
        </span>
      ) : null}
    </div>

    <div className="mt-2">
      <select
        value={status}
        disabled={
          status === "delivered" || shipBusy || profitBusy || recalcLoading || !!statusBusy[oid]
        }
        onChange={(e) => onChangeStatus(oid, e.target.value)}
        className={[
          "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400",
          status === "delivered" ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>

    {status === "delivered" ? (
      <div className="mt-2 text-[11px] text-slate-400">
        Delivered orders are read-only.
      </div>
    ) : null}

    {statusErr[oid] ? (
      <div className="mt-2 rounded-xl bg-rose-50 px-2 py-2 text-xs font-medium text-rose-700">
        {statusErr[oid]}
      </div>
    ) : null}
  </div>
                      {/* Shipment assign */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900">
                            <Truck className="h-4 w-4" /> Shipment
                          </div>
                          {shipBusy ? (
                            <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <Spinner className="h-3 w-3" /> Updating…
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2">
                          <select
                            value={sid}
                            disabled={shipBusy || profitBusy || recalcLoading}
                            onChange={(e) => onChangeShipment(oid, e.target.value)}
                            className={[
                              "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400",
                              shipBusy || profitBusy || recalcLoading ? "opacity-60" : "",
                            ].join(" ")}
                          >
                            <option value="">— No shipment —</option>
                            {shipments.map((s) => (
                              <option key={s.shipment_id} value={s.shipment_id}>
                                {s.name} • {s.shipment_id}
                              </option>
                            ))}
                          </select>
                        </div>

                        {ship ? (
                          <div className="mt-2 text-[11px] text-slate-500">
                            Avg rate: <span className="font-semibold">{fmtMoney(ship.gbp_avg_rate)}</span>
                            {" • "}
                            Curia/kg: <span className="font-semibold">{fmtMoney(ship.cargo_cost_per_kg)}</span>
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-slate-400">Assign shipment to compute ৳ + curia.</div>
                        )}
                      </div>

                      {/* Profit */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900">
                            <Percent className="h-4 w-4" /> Profit
                          </div>

                          {profitBusy ? (
                            <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <Spinner className="h-3 w-3" /> Saving…
                            </span>
                          ) : dirty ? (
                            <Pill tone="amber" icon={AlertTriangle}>Unsaved</Pill>
                          ) : (
                            <Pill tone="green" icon={CheckCircle2}>Saved</Pill>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-700">Profit on just product</div>
                            <div className="text-[11px] text-slate-500">
                              {draft.profit_on_just_product
                                ? "Apply on £ product price (store GBP + converted BDT)"
                                : "Apply on ৳ total cost (store BDT only)"}
                            </div>
                          </div>
                          <Switch
                            checked={!!draft.profit_on_just_product}
                            disabled={profitBusy}
                            onChange={(nextVal) => {
                              setProfitDraft((p) => ({
                                ...p,
                                [oid]: { ...getDraft(oid), profit_on_just_product: !!nextVal },
                              }));
                            }}
                          />
                        </div>

                        <div className="mt-3 flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-[11px] font-semibold text-slate-600">Profit rate (%)</label>
                            <input
                              value={draft.profit_rate}
                              onChange={(e) => {
                                const v = e.target.value;
                                setProfitDraft((p) => ({
                                  ...p,
                                  [oid]: { ...getDraft(oid), profit_rate: v },
                                }));
                              }}
                              disabled={profitBusy}
                              inputMode="decimal"
                              placeholder="e.g. 15"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400 disabled:opacity-60"
                            />
                          </div>

                          <IconButton
                            tone="primary"
                            icon={Percent}
                            onClick={() => onSaveProfit(oid)}
                            disabled={profitBusy || !dirty || !sid || recalcLoading}
                            title={!sid ? "Assign shipment first" : dirty ? "Save profit" : "No changes"}
                          >
                            Save
                          </IconButton>
                        </div>

                        {profitMsg ? (
                          <div className="mt-2 rounded-xl bg-rose-50 px-2 py-2 text-xs font-medium text-rose-700">
                            {profitMsg}
                          </div>
                        ) : null}

                        {!sid ? (
                          <div className="mt-2 text-[11px] text-slate-400">
                            Profit needs shipment avg rate for conversions. Assign shipment first.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    Tip: Assign a shipment first. If shipment rates change later, a <span className="font-semibold">Recalc</span> badge appears.
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}