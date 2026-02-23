import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { UK_API } from "@/api/ukApi";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDeleteDialog from "@/components/common/ConfirmDeleteDialog";

const CURRENCIES = ["GBP", "BDT"];
const PROFIT_BASES = ["PRODUCT_ONLY", "PRODUCT_PLUS_CARGO"];
const CARGO_CHARGES = ["PASS_THROUGH", "INCLUDED_IN_PRICE"];
const CONVERSION_RULES = ["SEPARATE_RATES", "AVG_RATE"];
const RATE_SOURCES = ["avg", "product", "cargo"];
const MODE_EXAMPLES = [
  {
    label: "Default 1: GBP Product",
    values: {
      name: "GBP Product Profit",
      version: "v1",
      currency: "GBP",
      profit_base: "PRODUCT_ONLY",
      cargo_charge: "PASS_THROUGH",
      conversion_rule: "SEPARATE_RATES",
      rate_source_revenue: "avg",
      active: "1",
      notes: "Profit on buy price only. Cargo charged separately.",
    },
  },
  {
    label: "Default 2: BDT Landed",
    values: {
      name: "BDT Landed Profit",
      version: "v1",
      currency: "BDT",
      profit_base: "PRODUCT_PLUS_CARGO",
      cargo_charge: "INCLUDED_IN_PRICE",
      conversion_rule: "SEPARATE_RATES",
      rate_source_revenue: "avg",
      active: "1",
      notes: "Profit on product + cargo in BDT.",
    },
  },
];

function defaultForm() {
  return {
    name: "",
    version: "v1",
    currency: "GBP",
    profit_base: "PRODUCT_ONLY",
    cargo_charge: "PASS_THROUGH",
    conversion_rule: "SEPARATE_RATES",
    rate_source_revenue: "avg",
    active: "1",
    notes: "",
  };
}

function PricingModesSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPricingModes() {
  const { user } = useAuth();
  const email = user?.email || "";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(defaultForm());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState("");

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setErr("");
    setNotice("");
    try {
      const res = await UK_API.pricingModeGetAll(email, true);
      setRows(Array.isArray(res.pricing_modes) ? res.pricing_modes : []);
    } catch (e) {
      setErr(e?.message || "Failed to load pricing modes");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const text = [
        r.pricing_mode_id,
        r.name,
        r.version,
        r.currency,
        r.profit_base,
        r.cargo_charge,
        r.conversion_rule,
        r.rate_source_revenue,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return text.includes(needle);
    });
  }, [rows, q]);

  function onEdit(row) {
    setEditingId(String(row.pricing_mode_id || ""));
    setForm({
      name: String(row.name || ""),
      version: String(row.version || "v1"),
      currency: String(row.currency || "GBP"),
      profit_base: String(row.profit_base || "PRODUCT_ONLY"),
      cargo_charge: String(row.cargo_charge || "PASS_THROUGH"),
      conversion_rule: String(row.conversion_rule || "SEPARATE_RATES"),
      rate_source_revenue: String(row.rate_source_revenue || "avg"),
      active: row.active ? "1" : "0",
      notes: String(row.notes || ""),
    });
  }

  function onReset() {
    setEditingId("");
    setForm(defaultForm());
  }

  function applyExample(values) {
    setEditingId("");
    setForm({ ...defaultForm(), ...values });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!email) return;

    setSaving(true);
    setErr("");
    setNotice("");
    try {
      const payload = {
        pricing_mode_id: editingId ? editingId : undefined,
        name: form.name.trim(),
        version: form.version.trim(),
        currency: form.currency,
        profit_base: form.profit_base,
        cargo_charge: form.cargo_charge,
        conversion_rule: form.conversion_rule,
        rate_source_revenue: form.rate_source_revenue,
        active: Number(form.active),
        notes: form.notes.trim(),
      };

      if (editingId) {
        await UK_API.pricingModeUpdate(email, editingId, payload);
      } else {
        await UK_API.pricingModeCreate(email, payload);
      }

      onReset();
      await load();
      setNotice(editingId ? "Pricing mode updated." : "Pricing mode created.");
    } catch (e2) {
      setErr(e2?.message || "Failed to save pricing mode");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!email) return;
    setSaving(true);
    setErr("");
    setNotice("");
    try {
      await UK_API.pricingModeDelete(email, id);
      await load();
      setNotice("Pricing mode deleted.");
    } catch (e) {
      setErr(e?.message || "Failed to delete pricing mode");
    } finally {
      setSaving(false);
    }
  }

  function openDelete(id) {
    setDeleteTargetId(String(id || ""));
    setDeleteOpen(true);
  }

  async function seedDefaults() {
    if (!email) return;
    setSaving(true);
    setErr("");
    setNotice("");
    try {
      const res = await UK_API.pricingModeSeedDefaults(email);
      await load();
      setNotice(
        `Defaults ready. Created: ${Number(res.created || 0)}, existing kept: ${Number(res.skipped_existing || 0)}.`,
      );
    } catch (e) {
      setErr(e?.message || "Failed to create default pricing modes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Pricing Modes</h1>
              <p className="text-sm text-muted-foreground">Manage pricing model versions for GBP and BDT flows.</p>
            </div>
            <Button onClick={seedDefaults} disabled={saving}>
              {saving ? "Working..." : "Create 2 Defaults"}
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">How To Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Create a mode for each pricing strategy (GBP product-profit or BDT landed-profit).</p>
            <p>2. Set `active=1` for modes you want admins to use when pricing orders.</p>
            <p>3. In admin order flow, apply a mode using the Price action.</p>
            <p>4. Delete works only for unused modes. If already used in orders, set `active=0` instead.</p>
            <p>5. `pricing_mode_id` is auto-generated from currency + profit base + version.</p>
            <div className="pt-2">
              <div className="mb-2 text-xs font-medium text-foreground">Quick examples (prefill form):</div>
              <div className="flex flex-wrap gap-2">
                {MODE_EXAMPLES.map((ex) => (
                  <Button key={ex.label} type="button" variant="outline" size="sm" onClick={() => applyExample(ex.values)}>
                    {ex.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">{editingId ? "Edit Pricing Mode" : "Create Pricing Mode"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={onSubmit}>
                {!editingId ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Pricing Mode ID will be auto-generated on create.
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Pricing Mode ID: <span className="font-semibold text-foreground">{editingId}</span>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="GBP Product Profit"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Version</label>
                    <Input value={form.version} onChange={(e) => setForm((s) => ({ ...s, version: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Currency</label>
                    <Select value={form.currency} onValueChange={(v) => setForm((s) => ({ ...s, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Profit Base</label>
                  <Select value={form.profit_base} onValueChange={(v) => setForm((s) => ({ ...s, profit_base: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROFIT_BASES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Cargo Charge</label>
                  <Select value={form.cargo_charge} onValueChange={(v) => setForm((s) => ({ ...s, cargo_charge: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CARGO_CHARGES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Conversion Rule</label>
                    <Select value={form.conversion_rule} onValueChange={(v) => setForm((s) => ({ ...s, conversion_rule: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONVERSION_RULES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Rate Source Revenue</label>
                    <Select value={form.rate_source_revenue} onValueChange={(v) => setForm((s) => ({ ...s, rate_source_revenue: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RATE_SOURCES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Active (1/0)</label>
                  <Select value={form.active} onValueChange={(v) => setForm((s) => ({ ...s, active: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="0">0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>

                <div className="flex gap-2">
                  <Button disabled={saving} type="submit" className="flex-1">
                    {saving ? "Saving..." : editingId ? "Update" : "Create"}
                  </Button>
                  {editingId ? (
                    <Button type="button" variant="outline" onClick={onReset} disabled={saving}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Pricing Models ({filtered.length})</CardTitle>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search pricing modes..."
                  className="sm:max-w-xs"
                />
              </div>
            </CardHeader>
            <CardContent>
              {err ? (
                <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {err}
                </div>
              ) : null}
              {notice ? (
                <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {notice}
                </div>
              ) : null}

              {loading ? (
                <PricingModesSkeleton />
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">No pricing modes found.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((r) => (
                    <div key={r.pricing_mode_id} className="rounded-xl border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">{r.pricing_mode_id}</div>
                          <div className="text-sm text-muted-foreground">{r.name || "—"} · {r.version || "—"}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{r.currency}</Badge>
                          <Badge variant="outline">{r.profit_base}</Badge>
                          <Badge variant="outline">{r.conversion_rule}</Badge>
                          <Badge variant={r.active ? "default" : "outline"}>{r.active ? "active=1" : "active=0"}</Badge>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => onEdit(r)} disabled={saving}>Edit</Button>
                        <Button variant="destructive" onClick={() => openDelete(r.pricing_mode_id)} disabled={saving}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        loading={saving}
        title="Delete pricing mode"
        description={
          deleteTargetId
            ? `Delete pricing mode "${deleteTargetId}"?`
            : "Delete this pricing mode?"
        }
        confirmText="Delete"
        onClose={() => {
          if (!saving) setDeleteOpen(false);
        }}
        onConfirm={() => onDelete(deleteTargetId)}
      />
    </div>
  );
}
