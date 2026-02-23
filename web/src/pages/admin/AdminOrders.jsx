import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function OrdersSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const STATUSS = [
  "draft",
  "submitted",
  "priced",
  "under_review",
  "finalized",
  "processing",
  "partially_delivered",
  "delivered",
  "cancelled",
];

export default function AdminOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [pricingModes, setPricingModes] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rowBusy, setRowBusy] = useState({});
  const [rowErr, setRowErr] = useState({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteText, setDeleteText] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignShipmentId, setAssignShipmentId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  async function load() {
    if (!user?.email) return;

    setLoading(true);
    setErr("");
    try {
      const [o, pm, s] = await Promise.all([
        UK_API.getOrders(user.email),
        UK_API.pricingModeGetAll(user.email),
        UK_API.shipmentGetAll(user.email),
      ]);
      setOrders(Array.isArray(o.orders) ? o.orders : []);
      setPricingModes(Array.isArray(pm.modes) ? pm.modes : []);
      setShipments(Array.isArray(s.shipments) ? s.shipments : []);
    } catch (e) {
      setErr(e?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const defaultMode = useMemo(() => {
    const modes = pricingModes.filter((m) => Number(m.active) === 1 || String(m.active).toLowerCase() === "true");
    const gbp = modes.find((m) => String(m.pricing_mode_id || "").toUpperCase() === "PM_GBP_PROD_V1");
    if (gbp) return gbp.pricing_mode_id;
    return modes[0]?.pricing_mode_id || pricingModes[0]?.pricing_mode_id || "";
  }, [pricingModes]);

  const sorted = useMemo(() => {
    const next = [...orders];
    next.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return next;
  }, [orders]);

  async function runRow(orderId, fn) {
    const id = String(orderId || "").trim();
    if (!id) return false;

    setRowBusy((p) => ({ ...p, [id]: true }));
    setRowErr((p) => ({ ...p, [id]: "" }));
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setRowErr((p) => ({ ...p, [id]: e?.message || "Action failed" }));
      return false;
    } finally {
      setRowBusy((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  const deleteMatchText = String(deleteTarget?.order_name || deleteTarget?.order_id || "").trim();
  const deleteTargetId = String(deleteTarget?.order_id || "").trim();
  const deleteTargetStatus = String(deleteTarget?.status || "").toLowerCase();
  const canDeleteTarget = deleteTargetStatus === "delivered" || deleteTargetStatus === "cancelled";

  async function onAssignShipment() {
    const oid = String(assignTarget?.order_id || "").trim();
    const sid = String(assignShipmentId || "").trim();
    if (!oid || !sid) return;

    setAssignBusy(true);
    setErr("");
    try {
      const sug = await UK_API.allocationSuggestForShipment(user.email, sid, oid);
      const rows = Array.isArray(sug?.suggestions) ? sug.suggestions : [];
      if (!rows.length) {
        throw new Error("No remaining quantities to allocate for this order.");
      }

      for (const r of rows) {
        await UK_API.allocationCreate(user.email, {
          shipment_id: sid,
          order_item_id: r.order_item_id,
          allocated_qty: Number(r.allocated_qty || 0),
          shipped_qty: Number(r.shipped_qty || 0),
          unit_product_weight: 0,
          unit_package_weight: 0,
        });
      }

      await UK_API.recomputeShipment(user.email, sid);
      await UK_API.recomputeOrder(user.email, oid);
      await load();
      setAssignOpen(false);
      setAssignTarget(null);
      setAssignShipmentId("");
    } catch (e) {
      setErr(e?.message || "Failed to assign shipment");
    } finally {
      setAssignBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">Status flow and pricing lifecycle.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/shipments")}>Shipments</Button>
          <Button variant="outline" onClick={() => navigate("/admin/pricing-modes")}>Pricing Modes</Button>
        </div>
      </div>

      {err ? <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div> : null}

      {loading ? (
        <OrdersSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sorted.length === 0 ? (
              <div className="text-sm text-muted-foreground">No orders found.</div>
            ) : (
              sorted.map((o) => {
                const id = String(o.order_id || "");
                const status = String(o.status || "").toLowerCase();
                const busy = !!rowBusy[id];

                return (
                  <div key={id} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold">#{o.order_sl || "-"} • {o.order_name || "Untitled"}</div>
                          <Badge variant="secondary">{status || "-"}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {id} • {o.creator_name || "-"} • Qty {n0(o.total_order_qty)} • Alloc {n0(o.total_allocated_qty)} • Shipped {n0(o.total_shipped_qty)} • Remaining {n0(o.total_remaining_qty)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Revenue {n0(o.total_revenue_bdt)} • Cost {n0(o.total_total_cost_bdt)} • Profit {n0(o.total_profit_bdt)}
                        </div>
                        {rowErr[id] ? <div className="mt-2 text-xs text-destructive">{rowErr[id]}</div> : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/orders/${id}`)}>
                          View
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setAssignTarget(o);
                            setAssignShipmentId("");
                            setAssignOpen(true);
                          }}
                        >
                          Assign Shipment
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || status === "delivered"}
                          onClick={() => runRow(id, () => UK_API.recomputeOrder(user.email, id))}
                        >
                          Recompute
                        </Button>

                        <Button
                          size="sm"
                          disabled={busy || !defaultMode || !(status === "submitted" || status === "under_review")}
                          onClick={() =>
                            runRow(id, () => UK_API.orderPrice(user.email, id, defaultMode, 0.1))
                          }
                        >
                          Price
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || status !== "finalized"}
                          onClick={() => runRow(id, () => UK_API.orderStartProcessing(user.email, id))}
                        >
                          Start Processing
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy || status === "delivered" || status === "cancelled"}
                          onClick={() => runRow(id, () => UK_API.orderCancel(user.email, id))}
                        >
                          Cancel
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy || !(status === "delivered" || status === "cancelled")}
                          onClick={() => {
                            setDeleteTarget(o);
                            setDeleteText("");
                            setDeleteOpen(true);
                          }}
                        >
                          Permanent Delete
                        </Button>

                        <Select
                          value={status}
                          onValueChange={(v) => runRow(id, () => UK_API.updateOrderStatus(user.email, id, v))}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-[170px] text-xs">
                            <SelectValue placeholder="Change status" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!rowBusy[deleteTargetId]) setDeleteOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete Order</DialogTitle>
            <DialogDescription>
              This action cannot be undone. It will delete the order, all order items, and related allocations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Allowed only when status is delivered or cancelled.
            </div>
            <div className="text-xs text-muted-foreground">
              Type exact order name to confirm:
              <span className="ml-1 font-semibold text-foreground">{deleteMatchText || "-"}</span>
            </div>
            <Input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type exact order name"
              disabled={!!rowBusy[deleteTargetId]}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={!!rowBusy[deleteTargetId]}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !!rowBusy[deleteTargetId] ||
                !canDeleteTarget ||
                String(deleteText || "").trim() !== deleteMatchText
              }
              onClick={async () => {
                const ok = await runRow(deleteTargetId, () => UK_API.deleteOrder(user.email, deleteTargetId));
                if (ok) {
                  setDeleteOpen(false);
                  setDeleteTarget(null);
                  setDeleteText("");
                }
              }}
            >
              {rowBusy[deleteTargetId] ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignOpen}
        onOpenChange={(next) => {
          if (!assignBusy) setAssignOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Shipment To Order</DialogTitle>
            <DialogDescription>
              This will create allocation rows for remaining quantities of this order in the selected shipment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Order: <span className="font-semibold text-foreground">#{assignTarget?.order_sl || "-"} • {assignTarget?.order_name || "-"} ({assignTarget?.order_id || "-"})</span>
            </div>
            <Select value={assignShipmentId} onValueChange={setAssignShipmentId} disabled={assignBusy}>
              <SelectTrigger>
                <SelectValue placeholder="Select shipment" />
              </SelectTrigger>
              <SelectContent>
                {shipments.map((s) => (
                  <SelectItem key={s.shipment_id} value={s.shipment_id}>
                    {s.name || s.shipment_id} ({s.shipment_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={assignBusy} onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button disabled={assignBusy || !assignShipmentId} onClick={onAssignShipment}>
              {assignBusy ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
