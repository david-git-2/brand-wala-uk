import { useEffect, useMemo, useState } from "react";
import { shipmentService } from "@/services/shipments/shipmentService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function r2(v) {
  return Number(n(v, 0).toFixed(2));
}

function r0(v) {
  return Math.round(n(v, 0));
}

function paymentId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `PAY_${ts}_${rnd}`;
}

function fmt0(v) {
  return Math.round(n(v, 0)).toLocaleString();
}

export default function AdminShipmentAccounting() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [accounting, setAccounting] = useState(null);
  const [payments, setPayments] = useState([]);
  const [manualOverride, setManualOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    cost_total_gbp: "",
    cost_rate_bdt_per_gbp: "",
    cost_total_bdt: "",
    revenue_expected_bdt: "",
    revenue_collected_bdt: "",
    receivable_bdt: "",
    profit_bdt: "",
    status: "open",
  });

  const [paymentForm, setPaymentForm] = useState({
    customer_email: "",
    customer_name: "",
    amount_bdt: "",
    method: "",
    note: "",
    paid_at: "",
  });

  const collectedAuto = useMemo(
    () => payments.reduce((sum, p) => sum + n(p.amount_bdt, 0), 0),
    [payments],
  );
  const receivableAuto = useMemo(
    () => r0(n(form.revenue_expected_bdt, 0) - collectedAuto),
    [form.revenue_expected_bdt, collectedAuto],
  );
  const profitAuto = useMemo(
    () => r0(collectedAuto - n(form.cost_total_bdt, 0)),
    [collectedAuto, form.cost_total_bdt],
  );

  async function loadBase() {
    setLoading(true);
    setErr("");
    try {
      const rows = await shipmentService.listShipments();
      setShipments(rows || []);
      if (!selectedShipmentId && rows?.length) setSelectedShipmentId(rows[0].shipment_id);
    } catch (e) {
      setErr(e?.message || "Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }

  async function loadShipmentAccounting(shipmentId) {
    if (!shipmentId) return;
    setErr("");
    try {
      const [ac, pay, ship] = await Promise.all([
        shipmentService.getShipmentAccounting(shipmentId),
        shipmentService.listCustomerPayments(shipmentId),
        shipmentService.getShipmentById(shipmentId),
      ]);
      setPayments(pay || []);
      setAccounting(ac);
      const seedCostGbp = ac?.cost_total_gbp ?? ship?.total_value_gbp ?? 0;
      const seedRate = ac?.cost_rate_bdt_per_gbp ?? ship?.gbp_rate_avg_bdt ?? 0;
      const seedCostBdt = ac?.cost_total_bdt ?? r0(seedCostGbp * seedRate);
      setForm({
        cost_total_gbp: seedCostGbp,
        cost_rate_bdt_per_gbp: seedRate,
        cost_total_bdt: seedCostBdt,
        revenue_expected_bdt: ac?.revenue_expected_bdt ?? 0,
        revenue_collected_bdt: ac?.revenue_collected_bdt ?? 0,
        receivable_bdt: ac?.receivable_bdt ?? 0,
        profit_bdt: ac?.profit_bdt ?? 0,
        status: ac?.status || "open",
      });
    } catch (e) {
      setErr(e?.message || "Failed to load shipment accounting");
    }
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedShipmentId) loadShipmentAccounting(selectedShipmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShipmentId]);

  async function saveAccounting() {
    if (!selectedShipmentId) return;
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const payload = {
        shipment_id: selectedShipmentId,
        shipment_name:
          shipments.find((s) => s.shipment_id === selectedShipmentId)?.name || "",
        cost_total_gbp: r2(form.cost_total_gbp),
        cost_rate_bdt_per_gbp: r2(form.cost_rate_bdt_per_gbp),
        cost_total_bdt: r0(form.cost_total_bdt),
        revenue_expected_bdt: r0(form.revenue_expected_bdt),
        status: String(form.status || "open").toLowerCase(),
        revenue_collected_bdt: manualOverride ? r0(form.revenue_collected_bdt) : collectedAuto,
        receivable_bdt: manualOverride ? r0(form.receivable_bdt) : receivableAuto,
        profit_bdt: manualOverride ? r0(form.profit_bdt) : profitAuto,
      };
      if (accounting?.shipment_id) {
        await shipmentService.updateShipmentAccounting(selectedShipmentId, payload);
      } else {
        await shipmentService.createShipmentAccounting(payload);
      }
      await loadShipmentAccounting(selectedShipmentId);
      setMsg("Shipment accounting saved.");
    } catch (e) {
      setErr(e?.message || "Failed to save shipment accounting");
    } finally {
      setSaving(false);
    }
  }

  async function addPayment() {
    if (!selectedShipmentId) return;
    const amount = n(paymentForm.amount_bdt, 0);
    if (!(amount > 0)) {
      setErr("Payment amount must be greater than 0.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await shipmentService.addCustomerPayment(selectedShipmentId, paymentId(), {
        ...paymentForm,
        amount_bdt: amount,
        paid_at: paymentForm.paid_at || new Date().toISOString(),
        created_by: user?.email || "",
      });
      setPaymentForm({
        customer_email: "",
        customer_name: "",
        amount_bdt: "",
        method: "",
        note: "",
        paid_at: "",
      });
      await loadShipmentAccounting(selectedShipmentId);
      setMsg("Payment added.");
    } catch (e) {
      setErr(e?.message || "Failed to add payment");
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(id) {
    if (!selectedShipmentId || !id) return;
    setSaving(true);
    setErr("");
    try {
      await shipmentService.removeCustomerPayment(selectedShipmentId, id);
      await loadShipmentAccounting(selectedShipmentId);
      setMsg("Payment removed.");
    } catch (e) {
      setErr(e?.message || "Failed to remove payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Shipment Accounting</h1>
        <p className="text-sm text-muted-foreground">Admin only. Auto totals with optional manual override.</p>
      </div>

      {err ? <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{err}</div> : null}
      {msg ? <div className="mb-3 rounded-lg border p-3 text-sm">{msg}</div> : null}

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Shipment</label>
              <Select value={selectedShipmentId} onValueChange={setSelectedShipmentId} disabled={loading}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select shipment" />
                </SelectTrigger>
                <SelectContent>
                  {shipments.map((s) => (
                    <SelectItem key={s.shipment_id} value={s.shipment_id}>
                      {s.name || s.shipment_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant={manualOverride ? "default" : "outline"} onClick={() => setManualOverride((v) => !v)}>
                {manualOverride ? "Manual Override: ON" : "Manual Override: OFF"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Accounting Header</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Cost Total (GBP)</label>
                <Input value={form.cost_total_gbp} onChange={(e) => setForm((p) => ({ ...p, cost_total_gbp: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Rate (BDT/GBP)</label>
                <Input value={form.cost_rate_bdt_per_gbp} onChange={(e) => setForm((p) => ({ ...p, cost_rate_bdt_per_gbp: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Cost Total (BDT)</label>
                <Input value={form.cost_total_bdt} onChange={(e) => setForm((p) => ({ ...p, cost_total_bdt: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Revenue Expected (BDT)</label>
                <Input value={form.revenue_expected_bdt} onChange={(e) => setForm((p) => ({ ...p, revenue_expected_bdt: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Revenue Collected (BDT)</label>
                <Input
                  disabled={!manualOverride}
                  value={manualOverride ? form.revenue_collected_bdt : collectedAuto}
                  onChange={(e) => setForm((p) => ({ ...p, revenue_collected_bdt: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Receivable (BDT)</label>
                <Input
                  disabled={!manualOverride}
                  value={manualOverride ? form.receivable_bdt : receivableAuto}
                  onChange={(e) => setForm((p) => ({ ...p, receivable_bdt: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Profit (BDT)</label>
                <Input
                  disabled={!manualOverride}
                  value={manualOverride ? form.profit_bdt : profitAuto}
                  onChange={(e) => setForm((p) => ({ ...p, profit_bdt: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">open</SelectItem>
                    <SelectItem value="closed">closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={saveAccounting} disabled={saving || !selectedShipmentId}>
              {saving ? "Saving..." : "Save Accounting"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Customer Payments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder="Customer Email" value={paymentForm.customer_email} onChange={(e) => setPaymentForm((p) => ({ ...p, customer_email: e.target.value }))} />
              <Input placeholder="Customer Name" value={paymentForm.customer_name} onChange={(e) => setPaymentForm((p) => ({ ...p, customer_name: e.target.value }))} />
              <Input placeholder="Amount BDT" inputMode="decimal" value={paymentForm.amount_bdt} onChange={(e) => setPaymentForm((p) => ({ ...p, amount_bdt: e.target.value }))} />
              <Input placeholder="Method (free text)" value={paymentForm.method} onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))} />
              <Input placeholder="Paid At ISO (optional)" value={paymentForm.paid_at} onChange={(e) => setPaymentForm((p) => ({ ...p, paid_at: e.target.value }))} />
              <Input placeholder="Note" value={paymentForm.note} onChange={(e) => setPaymentForm((p) => ({ ...p, note: e.target.value }))} />
            </div>
            <Button onClick={addPayment} disabled={saving || !selectedShipmentId}>
              {saving ? "Saving..." : "Add Payment"}
            </Button>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-2 py-2">Customer</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.payment_id}>
                      <td className="px-2 py-2">
                        <div>{p.customer_name || "-"}</div>
                        <div className="text-[10px] text-muted-foreground">{p.customer_email || "-"}</div>
                      </td>
                      <td className="px-2 py-2">{p.method || "-"}</td>
                      <td className="px-2 py-2">৳{fmt0(p.amount_bdt)}</td>
                      <td className="px-2 py-2">
                        <Button size="icon" variant="destructive" onClick={() => deletePayment(p.payment_id)} disabled={saving}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!payments.length ? (
                    <tr>
                      <td className="px-2 py-3 text-muted-foreground" colSpan={4}>No payments yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

