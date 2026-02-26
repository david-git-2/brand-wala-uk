import { useEffect, useMemo, useState } from "react";
import { investorService } from "@/services/investors/investorService";
import { investorTransactionService } from "@/services/investorTransactions/investorTransactionService";
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

function fmt0(v) {
  return Math.round(n(v, 0)).toLocaleString();
}

function investorId(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return "";
  return `INV_${base}`;
}

export default function AdminInvestors() {
  const { user } = useAuth();
  const [investors, setInvestors] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [periodFilter, setPeriodFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [investorForm, setInvestorForm] = useState({
    name: "",
    email: "",
    phone: "",
    default_share_pct: "",
    opening_balance_bdt: "",
    notes: "",
  });

  const [txnForm, setTxnForm] = useState({
    type: "profit_share",
    direction: "in",
    amount_bdt: "",
    note: "",
    txn_at: "",
    shipment_id: "",
  });

  const selectedInvestor = useMemo(
    () => investors.find((x) => x.investor_id === selectedInvestorId) || null,
    [investors, selectedInvestorId],
  );

  async function loadInvestors() {
    const rows = await investorService.listInvestors();
    setInvestors(rows || []);
    if (!selectedInvestorId && rows?.length) setSelectedInvestorId(rows[0].investor_id);
  }

  async function loadTransactions(iid) {
    if (!iid) return setTransactions([]);
    if (periodFilter) {
      const rows = await investorTransactionService.listByPeriod(periodFilter);
      setTransactions((rows || []).filter((x) => String(x.investor_id || "") === iid));
      return;
    }
    const rows = await investorTransactionService.listByInvestorId(iid);
    setTransactions(rows || []);
  }

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([
        loadInvestors(),
        shipmentService.listShipments().then((rows) => setShipments(rows || [])),
      ]);
    } catch (e) {
      setErr(e?.message || "Failed to load investors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTransactions(selectedInvestorId).catch((e) => setErr(e?.message || "Failed to load transactions"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvestorId, periodFilter]);

  async function createInvestor() {
    const name = String(investorForm.name || "").trim();
    const id = investorId(name);
    if (!id) {
      setErr("Investor name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      await investorService.createInvestor({
        investor_id: id,
        name,
        email: investorForm.email,
        phone: investorForm.phone,
        default_share_pct: n(investorForm.default_share_pct, 0),
        opening_balance_bdt: n(investorForm.opening_balance_bdt, 0),
        current_balance_bdt: n(investorForm.opening_balance_bdt, 0),
        status: "active",
        notes: investorForm.notes,
      });
      setInvestorForm({
        name: "",
        email: "",
        phone: "",
        default_share_pct: "",
        opening_balance_bdt: "",
        notes: "",
      });
      await loadInvestors();
      setMsg("Investor created.");
    } catch (e) {
      setErr(e?.message || "Failed to create investor");
    } finally {
      setSaving(false);
    }
  }

  async function addTransaction() {
    if (!selectedInvestorId) {
      setErr("Select an investor first.");
      return;
    }
    const amount = n(txnForm.amount_bdt, 0);
    if (!(amount > 0)) {
      setErr("Amount must be greater than 0.");
      return;
    }
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      await investorTransactionService.createTransaction({
        investor_id: selectedInvestorId,
        type: txnForm.type,
        direction: txnForm.direction,
        amount_bdt: amount,
        note: txnForm.note,
        txn_at: txnForm.txn_at || new Date().toISOString(),
        shipment_id: txnForm.shipment_id || "",
        shipment_accounting_id: txnForm.shipment_id || "",
        is_shipment_linked: txnForm.shipment_id ? 1 : 0,
        created_by: user?.email || "",
      });
      setTxnForm({
        type: "profit_share",
        direction: "in",
        amount_bdt: "",
        note: "",
        txn_at: "",
        shipment_id: "",
      });
      await loadTransactions(selectedInvestorId);
      const latest = await investorTransactionService.listByInvestorId(selectedInvestorId);
      if (latest?.length) {
        await investorService.updateInvestor(selectedInvestorId, {
          current_balance_bdt: n(latest[0].running_balance_bdt, 0),
        });
        await loadInvestors();
      }
      setMsg("Transaction added.");
    } catch (e) {
      setErr(e?.message || "Failed to add transaction");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction(txnId) {
    if (!txnId || !selectedInvestorId) return;
    setSaving(true);
    setErr("");
    try {
      await investorTransactionService.removeTransaction(txnId);
      await loadTransactions(selectedInvestorId);
      setMsg("Transaction removed.");
    } catch (e) {
      setErr(e?.message || "Failed to remove transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Investors</h1>
        <p className="text-sm text-muted-foreground">Admin only. Running balance is auto-calculated from ledger.</p>
      </div>

      {err ? <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{err}</div> : null}
      {msg ? <div className="mb-3 rounded-lg border p-3 text-sm">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Create Investor</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            <Input placeholder="Name" value={investorForm.name} onChange={(e) => setInvestorForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Email" value={investorForm.email} onChange={(e) => setInvestorForm((p) => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Phone" value={investorForm.phone} onChange={(e) => setInvestorForm((p) => ({ ...p, phone: e.target.value }))} />
            <Input placeholder="Default Share %" value={investorForm.default_share_pct} onChange={(e) => setInvestorForm((p) => ({ ...p, default_share_pct: e.target.value }))} />
            <Input placeholder="Opening Balance (BDT)" value={investorForm.opening_balance_bdt} onChange={(e) => setInvestorForm((p) => ({ ...p, opening_balance_bdt: e.target.value }))} />
            <Input placeholder="Notes" value={investorForm.notes} onChange={(e) => setInvestorForm((p) => ({ ...p, notes: e.target.value }))} />
            <div className="md:col-span-2">
              <Button onClick={createInvestor} disabled={saving || loading}>
                {saving ? "Saving..." : "Create Investor"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Investors</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Select value={selectedInvestorId} onValueChange={setSelectedInvestorId} disabled={loading}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select investor" /></SelectTrigger>
              <SelectContent>
                {investors.map((x) => (
                  <SelectItem key={x.investor_id} value={x.investor_id}>
                    {x.name || x.investor_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedInvestor ? (
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{selectedInvestor.name}</div>
                <div className="text-muted-foreground">{selectedInvestor.email || "-"}</div>
                <div className="mt-1">Current Balance: ৳{fmt0(selectedInvestor.current_balance_bdt)}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Investor Transactions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              placeholder="Period filter YYYY-MM (optional)"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
            />
            <Select value={txnForm.type} onValueChange={(v) => setTxnForm((p) => ({ ...p, type: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profit_share">profit_share</SelectItem>
                <SelectItem value="capital_add">capital_add</SelectItem>
                <SelectItem value="capital_withdraw">capital_withdraw</SelectItem>
                <SelectItem value="expense">expense</SelectItem>
                <SelectItem value="adjustment">adjustment</SelectItem>
              </SelectContent>
            </Select>
            <Select value={txnForm.direction} onValueChange={(v) => setTxnForm((p) => ({ ...p, direction: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">in</SelectItem>
                <SelectItem value="out">out</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Amount BDT" value={txnForm.amount_bdt} onChange={(e) => setTxnForm((p) => ({ ...p, amount_bdt: e.target.value }))} />
            <Input placeholder="Txn at ISO (optional)" value={txnForm.txn_at} onChange={(e) => setTxnForm((p) => ({ ...p, txn_at: e.target.value }))} />
            <Select value={txnForm.shipment_id || "__none__"} onValueChange={(v) => setTxnForm((p) => ({ ...p, shipment_id: v === "__none__" ? "" : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Link shipment (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No shipment link</SelectItem>
                {shipments.map((s) => (
                  <SelectItem key={s.shipment_id} value={s.shipment_id}>
                    {s.name || s.shipment_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="md:col-span-2">
              <Input placeholder="Note" value={txnForm.note} onChange={(e) => setTxnForm((p) => ({ ...p, note: e.target.value }))} />
            </div>
            <div>
              <Button onClick={addTransaction} disabled={saving || !selectedInvestorId}>
                {saving ? "Saving..." : "Add Transaction"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Direction</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Running Balance</th>
                  <th className="px-2 py-2">Period</th>
                  <th className="px-2 py-2">Shipment</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((t) => (
                  <tr key={t.txn_id}>
                    <td className="px-2 py-2">{t.type || "-"}</td>
                    <td className="px-2 py-2">{t.direction || "-"}</td>
                    <td className="px-2 py-2">৳{fmt0(t.amount_bdt)}</td>
                    <td className="px-2 py-2">৳{fmt0(t.running_balance_bdt)}</td>
                    <td className="px-2 py-2">{t.period_key || "-"}</td>
                    <td className="px-2 py-2">{t.shipment_id || "-"}</td>
                    <td className="px-2 py-2">
                      <Button size="icon" variant="destructive" onClick={() => deleteTransaction(t.txn_id)} disabled={saving}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!transactions.length ? (
                  <tr><td className="px-2 py-3 text-muted-foreground" colSpan={7}>No transactions.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

