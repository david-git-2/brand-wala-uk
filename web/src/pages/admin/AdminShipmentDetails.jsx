import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";
import ConfirmDeleteDialog from "../../components/common/ConfirmDeleteDialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function fmt0(v) {
  return Math.round(n(v, 0));
}

function ShipmentSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-5 w-64" />
        <div className="grid gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminShipmentDetails() {
  const { shipmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [shipment, setShipment] = useState(null);
  const [orders, setOrders] = useState([]);
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [allocations, setAllocations] = useState([]);

  const [form, setForm] = useState({
    order_id: "",
    order_item_id: "",
    allocated_qty: "",
    shipped_qty: "0",
    unit_product_weight: "",
    unit_package_weight: "",
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [topMsg, setTopMsg] = useState("");

  const [savingCreate, setSavingCreate] = useState(false);
  const [savingRow, setSavingRow] = useState({});
  const [rowDraft, setRowDraft] = useState({});
  const [rowErr, setRowErr] = useState({});

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function loadCore() {
    if (!user?.email || !shipmentId) return;

    const [shipmentRes, allocRes, ordersRes] = await Promise.all([
      UK_API.shipmentGetOne(user.email, shipmentId),
      UK_API.allocationGetForShipment(user.email, shipmentId),
      UK_API.getOrders(user.email),
    ]);

    const nextAlloc = Array.isArray(allocRes.allocations) ? allocRes.allocations : [];
    const nextOrders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];

    setShipment(shipmentRes.shipment || null);
    setAllocations(nextAlloc);
    setOrders(nextOrders);

    setRowDraft((prev) => {
      const next = { ...prev };
      for (const a of nextAlloc) {
        const id = String(a.allocation_id || "");
        next[id] = {
          allocated_qty: String(a.allocated_qty ?? ""),
          shipped_qty: String(a.shipped_qty ?? ""),
          unit_product_weight: String(a.unit_product_weight ?? ""),
          unit_package_weight: String(a.unit_package_weight ?? ""),
        };
      }
      return next;
    });
  }

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!user?.email || !shipmentId) return;
      setLoading(true);
      setErr("");
      setTopMsg("");
      try {
        await loadCore();
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load shipment details");
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [user?.email, shipmentId]);

  async function loadOrderItems(orderId) {
    const oid = String(orderId || "").trim();
    if (!oid || itemsByOrder[oid]) return;
    try {
      const res = await UK_API.getOrderItems(user.email, oid);
      setItemsByOrder((p) => ({ ...p, [oid]: Array.isArray(res.items) ? res.items : [] }));
    } catch (e) {
      setTopMsg(e?.message || "Failed to load order items");
    }
  }

  useEffect(() => {
    if (!form.order_id) return;
    loadOrderItems(form.order_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.order_id]);

  const orderItems = useMemo(() => itemsByOrder[form.order_id] || [], [itemsByOrder, form.order_id]);

  async function createAllocation() {
    if (!form.order_item_id || !form.allocated_qty) return;

    setSavingCreate(true);
    setTopMsg("");
    try {
      await UK_API.allocationCreate(user.email, {
        shipment_id: shipmentId,
        order_item_id: form.order_item_id,
        allocated_qty: Number(form.allocated_qty),
        shipped_qty: Number(form.shipped_qty || 0),
        unit_product_weight: form.unit_product_weight === "" ? "" : Number(form.unit_product_weight),
        unit_package_weight: form.unit_package_weight === "" ? "" : Number(form.unit_package_weight),
      });

      await loadCore();
      setForm((p) => ({ ...p, order_item_id: "", allocated_qty: "", shipped_qty: "0", unit_product_weight: "", unit_package_weight: "" }));
      setTopMsg("Allocation added.");
    } catch (e) {
      setTopMsg(e?.message || "Failed to create allocation");
    } finally {
      setSavingCreate(false);
    }
  }

  async function saveAllocationRow(a) {
    const id = String(a.allocation_id || "");
    const d = rowDraft[id] || {};

    setSavingRow((p) => ({ ...p, [id]: true }));
    setRowErr((p) => ({ ...p, [id]: "" }));
    try {
      await UK_API.allocationUpdate(user.email, id, {
        allocated_qty: d.allocated_qty === "" ? "" : Number(d.allocated_qty),
        shipped_qty: d.shipped_qty === "" ? "" : Number(d.shipped_qty),
        unit_product_weight: d.unit_product_weight === "" ? "" : Number(d.unit_product_weight),
        unit_package_weight: d.unit_package_weight === "" ? "" : Number(d.unit_package_weight),
      });
      await UK_API.recomputeShipment(user.email, shipmentId);

      const relatedOrderIds = [...new Set(allocations.map((x) => String(x.order_id || "")).filter(Boolean))];
      await Promise.all(relatedOrderIds.map((oid) => UK_API.recomputeOrder(user.email, oid).catch(() => null)));

      await loadCore();
    } catch (e) {
      setRowErr((p) => ({ ...p, [id]: e?.message || "Failed to save" }));
    } finally {
      setSavingRow((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  function openDelete(a) {
    setDeleteTarget(a);
    setDeleteError("");
    setDeleteOpen(true);
  }

  async function onDelete() {
    const id = String(deleteTarget?.allocation_id || "");
    if (!id) return;

    setDeleting(true);
    setDeleteError("");
    try {
      await UK_API.allocationDelete(user.email, id);
      await UK_API.recomputeShipment(user.email, shipmentId);
      await loadCore();
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e?.message || "Failed to delete allocation");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <Button variant="link" className="h-auto p-0 text-sm" onClick={() => navigate("/admin/shipments")}>Back to shipments</Button>
          <h1 className="text-2xl font-semibold tracking-tight">Shipment Details</h1>
          <p className="text-sm text-muted-foreground">{shipmentId}</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/orders")}>Orders</Button>
      </div>

      {err ? <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div> : null}
      {topMsg ? <div className="mb-3 rounded-lg border px-4 py-3 text-sm">{topMsg}</div> : null}

      {loading ? (
        <ShipmentSkeleton />
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Shipment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-4">
              <div className="rounded-lg border p-2">Name: {shipment?.name || "-"}</div>
              <div className="rounded-lg border p-2">GBP Avg: {n(shipment?.gbp_avg_rate)}</div>
              <div className="rounded-lg border p-2">Product Rate: {n(shipment?.gbp_rate_product)}</div>
              <div className="rounded-lg border p-2">Cargo Rate: {n(shipment?.gbp_rate_cargo)}</div>
              <div className="rounded-lg border p-2">Cargo Cost/KG: {n(shipment?.cargo_cost_per_kg)}</div>
              <div className="rounded-lg border p-2">Status: {shipment?.status || "-"}</div>
              <div className="rounded-lg border p-2">Created: {shipment?.created_at || "-"}</div>
              <div className="rounded-lg border p-2">Updated: {shipment?.updated_at || "-"}</div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Add Allocation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-6">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Order</label>
                <Select
                  value={form.order_id}
                  onValueChange={(v) => setForm((p) => ({ ...p, order_id: v, order_item_id: "" }))}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select order" /></SelectTrigger>
                  <SelectContent>
                    {orders.map((o) => (
                      <SelectItem key={o.order_id} value={o.order_id}>{o.order_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Order Item</label>
                <Select
                  value={form.order_item_id}
                  onValueChange={(v) => setForm((p) => ({ ...p, order_item_id: v }))}
                  disabled={!form.order_id}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {orderItems.map((it) => (
                      <SelectItem key={it.order_item_id} value={it.order_item_id}>
                        {it.order_item_id} ({it.name || it.product_id || "item"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Allocated Qty</label>
                <Input value={form.allocated_qty} onChange={(e) => setForm((p) => ({ ...p, allocated_qty: e.target.value }))} inputMode="decimal" />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Shipped Qty</label>
                <Input value={form.shipped_qty} onChange={(e) => setForm((p) => ({ ...p, shipped_qty: e.target.value }))} inputMode="decimal" />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Unit Product Wt</label>
                <Input value={form.unit_product_weight} onChange={(e) => setForm((p) => ({ ...p, unit_product_weight: e.target.value }))} inputMode="decimal" />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Unit Package Wt</label>
                <Input value={form.unit_package_weight} onChange={(e) => setForm((p) => ({ ...p, unit_package_weight: e.target.value }))} inputMode="decimal" />
              </div>

              <div className="md:col-span-6">
                <Button disabled={savingCreate || !form.order_item_id || !form.allocated_qty} onClick={createAllocation}>
                  {savingCreate ? "Adding..." : "Add Allocation"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Allocations ({allocations.length})</CardTitle>
              <Button variant="outline" onClick={async () => {
                await UK_API.recomputeShipment(user.email, shipmentId);
                const relatedOrderIds = [...new Set(allocations.map((x) => String(x.order_id || "")).filter(Boolean))];
                await Promise.all(relatedOrderIds.map((oid) => UK_API.recomputeOrder(user.email, oid).catch(() => null)));
                await loadCore();
                setTopMsg("Shipment and related orders recomputed.");
              }}>
                Recompute Shipment
              </Button>
            </CardHeader>
            <CardContent>
              {allocations.length === 0 ? (
                <div className="text-sm text-muted-foreground">No allocations yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2">Allocation</th>
                        <th className="px-3 py-2">Order/Item</th>
                        <th className="px-3 py-2">Allocated</th>
                        <th className="px-3 py-2">Shipped</th>
                        <th className="px-3 py-2">Weights</th>
                        <th className="px-3 py-2">Costs (BDT)</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allocations.map((a) => {
                        const id = String(a.allocation_id || "");
                        const d = rowDraft[id] || {};
                        const busy = !!savingRow[id];
                        return (
                          <tr key={id}>
                            <td className="px-3 py-2">{id}</td>
                            <td className="px-3 py-2">{a.order_id}<br />{a.order_item_id}</td>
                            <td className="px-3 py-2"><Input className="h-8 w-24 text-xs" value={d.allocated_qty ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], allocated_qty: e.target.value } }))} /></td>
                            <td className="px-3 py-2"><Input className="h-8 w-24 text-xs" value={d.shipped_qty ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], shipped_qty: e.target.value } }))} /></td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <Input className="h-8 w-20 text-xs" value={d.unit_product_weight ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], unit_product_weight: e.target.value } }))} />
                                <Input className="h-8 w-20 text-xs" value={d.unit_package_weight ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], unit_package_weight: e.target.value } }))} />
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">total wt {n(a.unit_total_weight)} • shipped wt {n(a.shipped_weight)}</div>
                            </td>
                            <td className="px-3 py-2">cost {fmt0(a.total_cost_bdt)}<br />profit {fmt0(a.profit_bdt)}</td>
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => saveAllocationRow(a)}>
                                  {busy ? "Saving..." : "Save"}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => openDelete(a)}>Delete</Button>
                              </div>
                              {rowErr[id] ? <div className="mt-1 text-[10px] text-destructive">{rowErr[id]}</div> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDeleteDialog
        open={deleteOpen}
        loading={deleting}
        error={deleteError}
        title="Delete allocation"
        description={deleteTarget ? `Delete ${deleteTarget.allocation_id}?` : "Delete allocation?"}
        confirmText="Delete"
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={onDelete}
      />
    </div>
  );
}
