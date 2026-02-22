import { useEffect, useMemo, useState } from "react";

function Spinner({ className = "" }) {
  return (
    <span
      className={[
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-base font-semibold text-slate-900">{title}</div>
          </div>

          <div className="px-5 py-4">{children}</div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ShipmentDialog({
  open,
  mode = "create", // "create" | "edit"
  onClose,
  onSubmit,
  loading = false,
  error = "",
  initial = null, // shipment object for edit
}) {
  const title = mode === "edit" ? "Update shipment" : "Add shipment";

  const initialState = useMemo(() => {
    const s = initial || {};
    return {
      name: String(s.name || ""),
      gbp_avg_rate: s.gbp_avg_rate ?? "",
      gbp_rate_product: s.gbp_rate_product ?? "",
      gbp_rate_cargo: s.gbp_rate_cargo ?? "",
      cargo_cost_per_kg: s.cargo_cost_per_kg ?? "",
    };
  }, [initial]);

  const [form, setForm] = useState(initialState);

  useEffect(() => {
    if (open) setForm(initialState);
  }, [open, initialState]);

  const canSubmit = String(form.name || "").trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onClose?.();
      }}
      title={title}
      footer={
        <>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() =>
              onSubmit?.({
                name: String(form.name || "").trim(),
                gbp_avg_rate: num(form.gbp_avg_rate),
                gbp_rate_product: num(form.gbp_rate_product),
                gbp_rate_cargo: num(form.gbp_rate_cargo),
                cargo_cost_per_kg: num(form.cargo_cost_per_kg),
              })
            }
            disabled={loading || !canSubmit}
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving…
              </>
            ) : mode === "edit" ? (
              "Update"
            ) : (
              "Create"
            )}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Feb 2026 Shipment"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            disabled={loading}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">GBP avg rate</label>
            <input
              value={form.gbp_avg_rate}
              onChange={(e) => setForm((p) => ({ ...p, gbp_avg_rate: e.target.value }))}
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">GBP rate (product)</label>
            <input
              value={form.gbp_rate_product}
              onChange={(e) => setForm((p) => ({ ...p, gbp_rate_product: e.target.value }))}
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">GBP rate (cargo)</label>
            <input
              value={form.gbp_rate_cargo}
              onChange={(e) => setForm((p) => ({ ...p, gbp_rate_cargo: e.target.value }))}
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Cargo cost / kg</label>
            <input
              value={form.cargo_cost_per_kg}
              onChange={(e) => setForm((p) => ({ ...p, cargo_cost_per_kg: e.target.value }))}
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              disabled={loading}
              autoComplete="off"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="text-xs text-slate-500">
          Shipments are admin-only. Orders can be assigned to a shipment later.
        </div>
      </div>
    </Modal>
  );
}