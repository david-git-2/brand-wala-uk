import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import ConfirmDeleteDialog from "../../components/common/ConfirmDeleteDialog";
import {
  createAllocation as createShipmentAllocation,
  deleteAllocation as deleteShipmentAllocation,
  getShipment,
  listAllocationsForShipment,
  listShipmentProductSnapshots,
  recalcShipmentAllocations,
  suggestAllocationsForShipment,
  upsertShipmentProductSnapshot,
  updateAllocation as updateShipmentAllocation,
} from "@/firebase/shipments";
import { getOrderItemsForViewer, getOrdersForViewer } from "@/firebase/orders";

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

function kgToGramInput(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "";
  const g = x * 1000;
  return Number.isInteger(g) ? String(g) : String(Number(g.toFixed(3)));
}

function gramInputToKg(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const g = Number(s);
  return Number.isFinite(g) ? g / 1000 : "";
}

function toDirectGoogleImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const m = raw.match(/(?:\/d\/|id=)([-\w]{20,})/i);
  if (m?.[1]) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  return raw;
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

function tsMs(v) {
  if (!v) return 0;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

function formatTs(v) {
  const ms = tsMs(v);
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
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
    needed_qty: "",
    arrived_qty: "0",
    unit_product_weight: "",
    unit_package_weight: "",
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [topMsg, setTopMsg] = useState("");

  const [savingCreate, setSavingCreate] = useState(false);
  const [savingAddOrder, setSavingAddOrder] = useState(false);
  const [savingRow, setSavingRow] = useState({});
  const [rowDraft, setRowDraft] = useState({});
  const [rowErr, setRowErr] = useState({});
  const [snapshotDraft, setSnapshotDraft] = useState({});
  const [snapshotSaving, setSnapshotSaving] = useState({});

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function loadCore() {
    if (!user?.email || !shipmentId) return;

    const [shipmentRes, allocRes, ordersRes] = await Promise.all([
      getShipment(shipmentId),
      listAllocationsForShipment(shipmentId),
      getOrdersForViewer({ email: user.email, role: user.role }),
    ]);

    const nextAlloc = Array.isArray(allocRes) ? allocRes : [];
    const nextOrders = Array.isArray(ordersRes) ? ordersRes : [];

    setShipment(shipmentRes || null);
    setAllocations(nextAlloc);
    setOrders(nextOrders);

    const savedSnapshots = await listShipmentProductSnapshots(shipmentId);
    const savedByProduct = {};
    savedSnapshots.forEach((s) => {
      const key = String(s.product_id || "").trim();
      if (!key) return;
      savedByProduct[key] = s;
    });

    const relatedOrderIds = [...new Set(nextAlloc.map((a) => String(a.order_id || "").trim()).filter(Boolean))];
    if (relatedOrderIds.length) {
      const loaded = await Promise.all(
        relatedOrderIds.map(async (oid) => {
          try {
            const res = await getOrderItemsForViewer({ email: user.email, role: user.role, order_id: oid });
            return [oid, Array.isArray(res.items) ? res.items : []];
          } catch (_) {
            return [oid, []];
          }
        }),
      );
      setItemsByOrder((prev) => {
        const next = { ...prev };
        for (const [oid, rows] of loaded) next[oid] = rows;
        return next;
      });
    }

    setRowDraft((prev) => {
      const next = { ...prev };
      for (const a of nextAlloc) {
        const id = String(a.allocation_id || "");
        next[id] = {
          needed_qty: String(a.needed_qty ?? a.allocated_qty ?? ""),
          arrived_qty: String(a.arrived_qty ?? a.shipped_qty ?? ""),
          unit_product_weight: kgToGramInput(a.unit_product_weight),
          unit_package_weight: kgToGramInput(a.unit_package_weight),
        };
      }
      return next;
    });

    setSnapshotDraft((prev) => ({ ...prev, __saved: savedByProduct }));
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
  }, [user?.email, user?.role, shipmentId]);

  async function loadOrderItems(orderId) {
    const oid = String(orderId || "").trim();
    if (!oid || itemsByOrder[oid]) return;
    try {
      const res = await getOrderItemsForViewer({ email: user.email, role: user.role, order_id: oid });
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
  const itemByOrderItemId = useMemo(() => {
    const out = {};
    Object.keys(itemsByOrder).forEach((oid) => {
      const list = itemsByOrder[oid] || [];
      list.forEach((it) => {
        const key = String(it.order_item_id || "").trim();
        if (!key) return;
        out[key] = it;
      });
    });
    return out;
  }, [itemsByOrder]);

  const selectableOrders = useMemo(() => {
    const list = [...orders];
    list.sort((a, b) => tsMs(a.created_at) - tsMs(b.created_at));
    return list;
  }, [orders]);
  const orderNameById = useMemo(() => {
    const out = {};
    selectableOrders.forEach((o, idx) => {
      out[String(o.order_id || "")] = o.order_name || `Order ${idx + 1}`;
    });
    return out;
  }, [selectableOrders]);

  const aggregateRows = useMemo(() => {
    const itemMap = {};
    Object.keys(itemsByOrder).forEach((oid) => {
      const list = itemsByOrder[oid] || [];
      list.forEach((it) => {
        const key = String(it.order_item_id || "").trim();
        if (!key) return;
        itemMap[key] = it;
      });
    });

    const agg = {};
    for (const a of allocations) {
      const key = String(a.order_item_id || "").trim();
      if (!key) continue;
      if (!agg[key]) {
        const it = itemMap[key] || {};
        agg[key] = {
          order_item_id: key,
          order_id: String(a.order_id || ""),
          name: it.name || "",
          image_url: it.image_url || "",
          product_id: it.product_id || a.product_id || "",
          ordered_qty: n(it.ordered_quantity, 0),
          needed_qty: 0,
          arrived_qty: 0,
          needed_weight: 0,
          arrived_weight: 0,
        };
      }
      agg[key].needed_qty += n(a.needed_qty, n(a.allocated_qty, 0));
      agg[key].arrived_qty += n(a.arrived_qty, n(a.shipped_qty, 0));
      agg[key].needed_weight += n(a.needed_weight, n(a.allocated_weight, 0));
      agg[key].arrived_weight += n(a.arrived_weight, n(a.shipped_weight, 0));
    }

    return Object.values(agg)
      .map((r) => ({ ...r, remaining_qty: r.ordered_qty - r.arrived_qty }))
      .sort((a, b) => String(a.order_item_id).localeCompare(String(b.order_item_id)));
  }, [allocations, itemsByOrder]);

  const productSnapshotRows = useMemo(() => {
    const grouped = {};
    for (const r of aggregateRows) {
      const key = String(r.product_id || "").trim();
      if (!key) continue;
      if (!grouped[key]) {
        grouped[key] = {
          product_id: key,
          name: r.name || key,
          needed_base_qty: 0,
          breakdown: [],
        };
      }
      grouped[key].needed_base_qty += n(r.remaining_qty, 0);
      grouped[key].breakdown.push({
        order_id: r.order_id,
        order_item_id: r.order_item_id,
        needed_qty: n(r.remaining_qty, 0),
      });
    }
    return Object.values(grouped).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [aggregateRows]);

  const savedSnapshotsByProduct = snapshotDraft.__saved || {};

  function getSnapshotRowDraft(row) {
    const saved = savedSnapshotsByProduct[row.product_id] || {};
    const local = snapshotDraft[row.product_id] || {};
    const needed_qty = local.needed_qty ?? saved.needed_qty ?? row.needed_base_qty;
    const ordered_qty = local.ordered_qty ?? (saved.ordered_qty ?? "");
    const arrived_qty = local.arrived_qty ?? (saved.arrived_qty ?? saved.received_qty ?? "");
    return { needed_qty, ordered_qty, arrived_qty };
  }

  function patchSnapshot(product_id, patch) {
    setSnapshotDraft((prev) => ({
      ...prev,
      [product_id]: {
        ...(prev[product_id] || {}),
        ...patch,
      },
    }));
  }

  async function saveSnapshotRow(row) {
    const product_id = String(row.product_id || "").trim();
    if (!product_id) return;
    const d = getSnapshotRowDraft(row);
    setSnapshotSaving((p) => ({ ...p, [product_id]: true }));
    try {
      const saved = await upsertShipmentProductSnapshot({
        shipment_id: shipmentId,
        product_id,
        name: row.name,
        needed_qty: Number(d.needed_qty || 0),
        ordered_qty: d.ordered_qty === "" ? "" : Number(d.ordered_qty),
        arrived_qty: d.arrived_qty === "" ? "" : Number(d.arrived_qty),
        order_breakdown: row.breakdown,
      });
      setSnapshotDraft((prev) => ({
        ...prev,
        __saved: {
          ...(prev.__saved || {}),
          [product_id]: saved,
        },
      }));
      setTopMsg(`Saved snapshot for ${row.name}.`);
    } catch (e) {
      setTopMsg(e?.message || "Failed to save snapshot row.");
    } finally {
      setSnapshotSaving((p) => {
        const next = { ...p };
        delete next[product_id];
        return next;
      });
    }
  }


  async function createAllocation() {
    if (!form.order_item_id || !form.needed_qty) return;

    setSavingCreate(true);
    setTopMsg("");
    try {
      await createShipmentAllocation({
        shipment_id: shipmentId,
        order_id: form.order_id,
        order_item_id: form.order_item_id,
        needed_qty: Number(form.needed_qty),
        arrived_qty: Number(form.arrived_qty || 0),
        unit_product_weight: gramInputToKg(form.unit_product_weight),
        unit_package_weight: gramInputToKg(form.unit_package_weight),
      });

      await loadCore();
      setForm((p) => ({ ...p, order_item_id: "", needed_qty: "", arrived_qty: "0", unit_product_weight: "", unit_package_weight: "" }));
      setTopMsg("Shipment item added.");
    } catch (e) {
      setTopMsg(e?.message || "Failed to create shipment item");
    } finally {
      setSavingCreate(false);
    }
  }

  async function addFullOrderToShipment() {
    const oid = String(form.order_id || "").trim();
    if (!oid) return;

    setSavingAddOrder(true);
    setTopMsg("");
    try {
      const rows = await suggestAllocationsForShipment(shipmentId, oid);
      if (!rows.length) throw new Error("No remaining needed quantities for this order.");

      for (const r of rows) {
        await createShipmentAllocation({
          shipment_id: shipmentId,
          order_id: oid,
          order_item_id: r.order_item_id,
          needed_qty: Number(r.needed_qty ?? r.allocated_qty ?? 0),
          arrived_qty: Number(r.arrived_qty ?? r.shipped_qty ?? 0),
          unit_product_weight: 0,
          unit_package_weight: 0,
        });
      }

      await recalcShipmentAllocations(shipmentId);
      await loadCore();
      setTopMsg(`Added ${rows.length} item(s) from order ${oid} to shipment.`);
    } catch (e) {
      setTopMsg(e?.message || "Failed to add full order");
    } finally {
      setSavingAddOrder(false);
    }
  }

  async function saveAllocationRow(a) {
    const id = String(a.allocation_id || "");
    const d = rowDraft[id] || {};

    setSavingRow((p) => ({ ...p, [id]: true }));
    setRowErr((p) => ({ ...p, [id]: "" }));
    try {
      await updateShipmentAllocation(id, {
        needed_qty: d.needed_qty === "" ? "" : Number(d.needed_qty),
        arrived_qty: d.arrived_qty === "" ? "" : Number(d.arrived_qty),
        unit_product_weight: gramInputToKg(d.unit_product_weight),
        unit_package_weight: gramInputToKg(d.unit_package_weight),
      });
      await recalcShipmentAllocations(shipmentId);

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
      await deleteShipmentAllocation(id);
      await recalcShipmentAllocations(shipmentId);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/admin/shipments/${shipmentId}/weights`)}>Weight Sheet</Button>
          <Button variant="outline" onClick={() => navigate("/admin/orders")}>Orders</Button>
        </div>
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
              <div className="rounded-lg border p-2">Created: {formatTs(shipment?.created_at)}</div>
              <div className="rounded-lg border p-2">Updated: {formatTs(shipment?.updated_at)}</div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Add Shipment Item</CardTitle>
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
                    {selectableOrders.map((o, idx) => (
                      <SelectItem key={o.order_id} value={o.order_id}>
                        #{o.order_sl || idx + 1} • {o.order_name || "Untitled"}
                      </SelectItem>
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
                        {it.name || "Item"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Needed Qty</label>
                <Input value={form.needed_qty} onChange={(e) => setForm((p) => ({ ...p, needed_qty: e.target.value }))} inputMode="decimal" />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Arrived Qty</label>
                <Input value={form.arrived_qty} onChange={(e) => setForm((p) => ({ ...p, arrived_qty: e.target.value }))} inputMode="decimal" />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Unit Product Wt (g)</label>
                <Input value={form.unit_product_weight} onChange={(e) => setForm((p) => ({ ...p, unit_product_weight: e.target.value }))} inputMode="decimal" />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Unit Package Wt (g)</label>
                <Input value={form.unit_package_weight} onChange={(e) => setForm((p) => ({ ...p, unit_package_weight: e.target.value }))} inputMode="decimal" />
              </div>

              <div className="md:col-span-6">
                <div className="flex flex-wrap gap-2">
                  <Button disabled={savingCreate || !form.order_item_id || !form.needed_qty} onClick={createAllocation}>
                    {savingCreate ? "Adding..." : "Add Selected Item"}
                  </Button>
                  <Button variant="outline" disabled={savingAddOrder || !form.order_id} onClick={addFullOrderToShipment}>
                    {savingAddOrder ? "Adding Order..." : "Add Full Order"}
                  </Button>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Add Full Order will create shipment rows for all remaining needed quantities in this order.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Shipment Items ({allocations.length})</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={async () => {
                  await recalcShipmentAllocations(shipmentId);
                  await loadCore();
                  setTopMsg("Shipment and related orders recomputed.");
                }}>
                  Recompute Shipment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {allocations.length === 0 ? (
                <div className="text-sm text-muted-foreground">No shipment items yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Order</th>
                        <th className="px-3 py-2">Needed</th>
                        <th className="px-3 py-2">Arrived</th>
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
                        const meta = itemByOrderItemId[String(a.order_item_id || "").trim()] || {};
                        const imgUrl = toDirectGoogleImageUrl(meta.image_url);
                        return (
                          <tr key={id}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-9 w-9 overflow-hidden rounded border bg-muted">
                                  {imgUrl ? <img src={imgUrl} alt={meta.name || meta.product_id || "product"} className="h-full w-full object-cover" /> : null}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{meta.name || meta.product_id || "Product"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">{orderNameById[String(a.order_id || "")] || "Order"}</td>
                            <td className="px-3 py-2"><Input className="h-8 w-24 text-xs" value={d.needed_qty ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], needed_qty: e.target.value } }))} /></td>
                            <td className="px-3 py-2"><Input className="h-8 w-24 text-xs" value={d.arrived_qty ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], arrived_qty: e.target.value } }))} /></td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <Input className="h-8 w-20 text-xs" value={d.unit_product_weight ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], unit_product_weight: e.target.value } }))} />
                                <Input className="h-8 w-20 text-xs" value={d.unit_package_weight ?? ""} onChange={(e) => setRowDraft((p) => ({ ...p, [id]: { ...p[id], unit_package_weight: e.target.value } }))} />
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">total wt {n(a.unit_total_weight)} • arrived wt {n(a.arrived_weight ?? a.shipped_weight)}</div>
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

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Shipment Pick List Aggregate</CardTitle>
            </CardHeader>
            <CardContent>
              {aggregateRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">No aggregate rows yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Order</th>
                        <th className="px-3 py-2">Ordered</th>
                        <th className="px-3 py-2">Needed</th>
                        <th className="px-3 py-2">Arrived</th>
                        <th className="px-3 py-2">Remaining</th>
                        <th className="px-3 py-2">Needed Wt</th>
                        <th className="px-3 py-2">Arrived Wt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {aggregateRows.map((r) => (
                        <tr key={r.order_item_id}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-9 w-9 overflow-hidden rounded border bg-muted">
                                {toDirectGoogleImageUrl(r.image_url) ? (
                                  <img src={toDirectGoogleImageUrl(r.image_url)} alt={r.name || r.product_id || "product"} className="h-full w-full object-cover" />
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{r.name || r.product_id || "-"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">{orderNameById[String(r.order_id || "")] || "Order"}</td>
                          <td className="px-3 py-2">{fmt0(r.ordered_qty)}</td>
                          <td className="px-3 py-2">{fmt0(r.needed_qty)}</td>
                          <td className="px-3 py-2">{fmt0(r.arrived_qty)}</td>
                          <td className="px-3 py-2">{fmt0(r.remaining_qty)}</td>
                          <td className="px-3 py-2">{n(r.needed_weight).toFixed(2)}</td>
                          <td className="px-3 py-2">{n(r.arrived_weight).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Product Snapshot (Needed / Ordered / Arrived)</CardTitle>
            </CardHeader>
            <CardContent>
              {productSnapshotRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">No product snapshot rows yet.</div>
              ) : (
                <div className="space-y-3">
                  {productSnapshotRows.map((r) => {
                    const d = getSnapshotRowDraft(r);
                    const busy = !!snapshotSaving[r.product_id];
                    const img = toDirectGoogleImageUrl(
                      aggregateRows.find((x) => String(x.product_id) === String(r.product_id))?.image_url || "",
                    );
                    return (
                      <div key={r.product_id} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="h-9 w-9 overflow-hidden rounded border bg-muted">
                                {img ? <img src={img} alt={r.name} className="h-full w-full object-cover" /> : null}
                              </div>
                              <div className="font-semibold">{r.name}</div>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {r.breakdown.map((b) => `${orderNameById[String(b.order_id)] || "Order"}: ${fmt0(b.needed_qty)}`).join(" • ")}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                            <div>
                              <label className="mb-1 block text-[10px] text-muted-foreground">Needed Qty</label>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 px-0"
                                  onClick={() => patchSnapshot(r.product_id, { needed_qty: Math.max(0, n(d.needed_qty) - 1) })}
                                  disabled={busy}
                                >
                                  -
                                </Button>
                                <Input
                                  className="h-8 w-20 text-xs"
                                  value={String(d.needed_qty ?? "")}
                                  inputMode="decimal"
                                  onChange={(e) => patchSnapshot(r.product_id, { needed_qty: e.target.value })}
                                  disabled={busy}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 px-0"
                                  onClick={() => patchSnapshot(r.product_id, { needed_qty: n(d.needed_qty) + 1 })}
                                  disabled={busy}
                                >
                                  +
                                </Button>
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] text-muted-foreground">Ordered Qty</label>
                              <Input
                                className="h-8 w-24 text-xs"
                                value={String(d.ordered_qty ?? "")}
                                inputMode="decimal"
                                onChange={(e) => patchSnapshot(r.product_id, { ordered_qty: e.target.value })}
                                placeholder=""
                                disabled={busy}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] text-muted-foreground">Arrived Qty</label>
                              <Input
                                className="h-8 w-24 text-xs"
                                value={String(d.arrived_qty ?? "")}
                                inputMode="decimal"
                                onChange={(e) => patchSnapshot(r.product_id, { arrived_qty: e.target.value })}
                                placeholder=""
                                disabled={busy}
                              />
                            </div>
                            <div className="pt-4">
                              <Button size="sm" onClick={() => saveSnapshotRow(r)} disabled={busy}>
                                {busy ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
        title="Delete shipment item"
        description={deleteTarget ? `Delete ${deleteTarget.allocation_id}?` : "Delete shipment item?"}
        confirmText="Delete"
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={onDelete}
      />
    </div>
  );
}
