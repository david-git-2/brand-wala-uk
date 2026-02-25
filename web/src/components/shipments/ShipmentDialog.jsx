import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function maybeNum(v) {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default function ShipmentDialog({
  open,
  mode = "create",
  onClose,
  onSubmit,
  loading = false,
  error = "",
  initial = null,
}) {
  const title = mode === "edit" ? "Update Shipment" : "Add Shipment";

  const initialState = useMemo(() => {
    const s = initial || {};
    return {
      name: String(s.name || ""),
      gbp_avg_rate: s.gbp_avg_rate ?? s.gbp_rate_avg_bdt ?? "",
      gbp_rate_product: s.gbp_rate_product ?? s.gbp_rate_product_bdt ?? "",
      gbp_rate_cargo: s.gbp_rate_cargo ?? s.gbp_rate_cargo_bdt ?? "",
      cargo_cost_per_kg: s.cargo_cost_per_kg ?? s.cargo_cost_per_kg_gbp ?? "",
      status: String(s.status || "draft"),
    };
  }, [initial]);

  const [form, setForm] = useState(initialState);

  useEffect(() => {
    if (open) setForm(initialState);
  }, [open, initialState]);

  const canSubmit = String(form.name || "").trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading && !next) onClose?.(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Admin-only shipment setup for rates and cargo cost.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Feb 2026 Shipment"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">GBP Avg Rate</label>
              <Input
                value={form.gbp_avg_rate}
                onChange={(e) => setForm((p) => ({ ...p, gbp_avg_rate: e.target.value }))}
                inputMode="decimal"
                disabled={loading}
                autoComplete="off"
                placeholder="Optional (auto-derived)"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave empty to auto-calculate: one rate uses that value, two rates use their average.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">GBP Rate Product</label>
              <Input
                value={form.gbp_rate_product}
                onChange={(e) => setForm((p) => ({ ...p, gbp_rate_product: e.target.value }))}
                inputMode="decimal"
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">GBP Rate Cargo</label>
              <Input
                value={form.gbp_rate_cargo}
                onChange={(e) => setForm((p) => ({ ...p, gbp_rate_cargo: e.target.value }))}
                inputMode="decimal"
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Cargo Cost / KG</label>
              <Input
                value={form.cargo_cost_per_kg}
                onChange={(e) => setForm((p) => ({ ...p, cargo_cost_per_kg: e.target.value }))}
                inputMode="decimal"
                disabled={loading}
                autoComplete="off"
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit?.({
                name: String(form.name || "").trim(),
                gbp_avg_rate: maybeNum(form.gbp_avg_rate),
                gbp_rate_product: maybeNum(form.gbp_rate_product),
                gbp_rate_cargo: maybeNum(form.gbp_rate_cargo),
                cargo_cost_per_kg: num(form.cargo_cost_per_kg),
              })
            }
            disabled={loading || !canSubmit}
          >
            {loading ? "Saving..." : mode === "edit" ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
