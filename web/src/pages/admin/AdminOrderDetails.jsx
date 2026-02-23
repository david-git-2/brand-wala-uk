import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyCheck, Save, SaveAll } from "lucide-react";

function SkeletonRows() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <Skeleton className="h-4 w-72" />
            <Skeleton className="mt-2 h-3 w-44" />
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              {Array.from({ length: 5 }).map((__, j) => (
                <Skeleton key={j} className="h-10" />
              ))}
            </div>
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

export default function AdminOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [pricingModes, setPricingModes] = useState([]);

  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState({});
  const [rowErr, setRowErr] = useState({});

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [topMsg, setTopMsg] = useState("");

  const [actionBusy, setActionBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [bulk, setBulk] = useState({
    pricing_mode_id: "",
    profit_rate: "",
    offered_unit_gbp: "",
    offered_unit_bdt: "",
    final_unit_gbp: "",
    final_unit_bdt: "",
  });

  async function loadAll() {
    if (!user?.email || !orderId) return;

    const [ordersRes, itemsRes, allocRes, pmRes] = await Promise.all([
      UK_API.getOrders(user.email),
      UK_API.getOrderItems(user.email, orderId),
      UK_API.allocationGetForOrder(user.email, orderId),
      UK_API.pricingModeGetAll(user.email, true),
    ]);

    const allOrders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];
    const currentOrder = allOrders.find((o) => String(o.order_id) === String(orderId)) || null;

    const nextItems = Array.isArray(itemsRes.items) ? itemsRes.items : [];
    const nextAlloc = Array.isArray(allocRes.allocations) ? allocRes.allocations : [];
    const nextModes = Array.isArray(pmRes.modes) ? pmRes.modes : [];

    setOrder(currentOrder);
    setItems(nextItems);
    setAllocations(nextAlloc);
    setPricingModes(nextModes);

    setDraft((prev) => {
      const next = { ...prev };
      for (const it of nextItems) {
        const id = String(it.order_item_id || "").trim();
        if (!id) continue;
        next[id] = {
          pricing_mode_id: String(it.pricing_mode_id || ""),
          profit_rate: String(it.profit_rate ?? ""),
          offered_unit_gbp: String(it.offered_unit_gbp ?? ""),
          offered_unit_bdt: String(it.offered_unit_bdt ?? ""),
          final_unit_gbp: String(it.final_unit_gbp ?? ""),
          final_unit_bdt: String(it.final_unit_bdt ?? ""),
        };
      }
      return next;
    });
  }

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");
      setTopMsg("");
      try {
        await loadAll();
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load order details");
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [user?.email, orderId]);

  const status = String(order?.status || "").toLowerCase();
  const counterEnabled = order?.counter_enabled !== false;
  const canPermanentDelete = status === "delivered" || status === "cancelled";
  const deleteMatchText = String(order?.order_name || order?.order_id || "").trim();

  const modeOptions = useMemo(
    () => pricingModes.filter((m) => Number(m.active) === 1 || String(m.active).toLowerCase() === "true"),
    [pricingModes],
  );

  const defaultModeId = useMemo(() => {
    const pm = modeOptions.find((m) => String(m.pricing_mode_id).toUpperCase() === "PM_GBP_PROD_V1");
    return pm?.pricing_mode_id || modeOptions[0]?.pricing_mode_id || "";
  }, [modeOptions]);

  useEffect(() => {
    setBulk((p) => ({
      ...p,
      pricing_mode_id: p.pricing_mode_id || defaultModeId || "",
    }));
  }, [defaultModeId]);

  async function saveItem(item) {
    const id = String(item.order_item_id || "").trim();
    if (!id) return;

    const d = draft[id] || {};
    const payload = {
      order_item_id: id,
      pricing_mode_id: String(d.pricing_mode_id || "").trim(),
      profit_rate: d.profit_rate === "" ? "" : Number(d.profit_rate),
      offered_unit_gbp: d.offered_unit_gbp === "" ? "" : Number(d.offered_unit_gbp),
      offered_unit_bdt: d.offered_unit_bdt === "" ? "" : Number(d.offered_unit_bdt),
      final_unit_gbp: d.final_unit_gbp === "" ? "" : Number(d.final_unit_gbp),
      final_unit_bdt: d.final_unit_bdt === "" ? "" : Number(d.final_unit_bdt),
    };

    setSaving((p) => ({ ...p, [id]: true }));
    setRowErr((p) => ({ ...p, [id]: "" }));
    try {
      await UK_API.updateOrderItems(user.email, orderId, [payload]);
      await loadAll();
    } catch (e) {
      setRowErr((p) => ({ ...p, [id]: e?.message || "Failed to save item" }));
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  async function runAction(fn, successMsg) {
    setActionBusy(true);
    setTopMsg("");
    try {
      await fn();
      await loadAll();
      if (successMsg) setTopMsg(successMsg);
    } catch (e) {
      setTopMsg(e?.message || "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function onPermanentDelete() {
    if (!canPermanentDelete || !deleteMatchText) return;
    if (String(deleteText || "").trim() !== deleteMatchText) return;

    setDeleting(true);
    setTopMsg("");
    try {
      await UK_API.deleteOrder(user.email, orderId);
      setDeleteOpen(false);
      navigate("/admin/orders");
    } catch (e) {
      setTopMsg(e?.message || "Failed to permanently delete order");
    } finally {
      setDeleting(false);
    }
  }

  function buildPatchFromBulk(itemId) {
    const row = { order_item_id: itemId };
    if (bulk.pricing_mode_id !== "") row.pricing_mode_id = bulk.pricing_mode_id;
    if (bulk.profit_rate !== "") row.profit_rate = Number(bulk.profit_rate);
    if (bulk.offered_unit_gbp !== "") row.offered_unit_gbp = Number(bulk.offered_unit_gbp);
    if (bulk.offered_unit_bdt !== "") row.offered_unit_bdt = Number(bulk.offered_unit_bdt);
    if (bulk.final_unit_gbp !== "") row.final_unit_gbp = Number(bulk.final_unit_gbp);
    if (bulk.final_unit_bdt !== "") row.final_unit_bdt = Number(bulk.final_unit_bdt);
    return row;
  }

  function applyBulkToDraft() {
    setDraft((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const id = String(it.order_item_id || "").trim();
        if (!id) continue;
        next[id] = {
          ...(next[id] || {}),
          ...(bulk.pricing_mode_id !== "" ? { pricing_mode_id: bulk.pricing_mode_id } : {}),
          ...(bulk.profit_rate !== "" ? { profit_rate: bulk.profit_rate } : {}),
          ...(bulk.offered_unit_gbp !== "" ? { offered_unit_gbp: bulk.offered_unit_gbp } : {}),
          ...(bulk.offered_unit_bdt !== "" ? { offered_unit_bdt: bulk.offered_unit_bdt } : {}),
          ...(bulk.final_unit_gbp !== "" ? { final_unit_gbp: bulk.final_unit_gbp } : {}),
          ...(bulk.final_unit_bdt !== "" ? { final_unit_bdt: bulk.final_unit_bdt } : {}),
        };
      }
      return next;
    });
    setTopMsg("Applied bulk values to all item forms. Click Save per row or use Apply & Save All.");
  }

  async function applyAndSaveBulk() {
    if (!items.length) return;
    const payload = items
      .map((it) => buildPatchFromBulk(String(it.order_item_id || "").trim()))
      .filter((r) => Object.keys(r).length > 1);

    if (!payload.length) {
      setTopMsg("Enter at least one bulk field value before Apply & Save All.");
      return;
    }

    setActionBusy(true);
    setTopMsg("");
    try {
      await UK_API.updateOrderItems(user.email, orderId, payload);
      await loadAll();
      setTopMsg("Bulk values saved for all items.");
    } catch (e) {
      setTopMsg(e?.message || "Bulk update failed");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <TooltipProvider delayDuration={120}>
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Details</h1>
          <div className="text-sm text-muted-foreground">{orderId}</div>
          {status ? <Badge className="mt-2" variant="secondary">{status}</Badge> : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/orders")}>Back</Button>
          <Button variant="outline" onClick={() => navigate("/admin/shipments")}>Shipments</Button>
        </div>
      </div>

      {err ? <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div> : null}
      {topMsg ? <div className="mb-3 rounded-lg border px-4 py-3 text-sm">{topMsg}</div> : null}

      {!loading && order ? (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Order Actions</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={actionBusy || !(status === "submitted" || status === "under_review") || !defaultModeId}
                onClick={() => {
                  const rows = items.map((it) => {
                    const itemId = String(it.order_item_id || "").trim();
                    const d = draft[itemId] || {};
                    return {
                      order_item_id: itemId,
                      pricing_mode_id: String(d.pricing_mode_id || it.pricing_mode_id || defaultModeId || "").trim(),
                      profit_rate:
                        d.profit_rate !== "" && d.profit_rate !== undefined
                          ? Number(d.profit_rate)
                          : (it.profit_rate !== "" && it.profit_rate !== undefined ? Number(it.profit_rate) : 0.1),
                    };
                  }).filter((r) => r.order_item_id && r.pricing_mode_id);

                  const firstMode = rows[0]?.pricing_mode_id || defaultModeId;
                  return runAction(
                    () => UK_API.orderPrice(user.email, orderId, firstMode, 0.1, rows),
                    "Order priced",
                  );
                }}
              >
                Price
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={actionBusy || !(status === "priced" || status === "under_review")}
                onClick={() => {
                  const finalizeRows = items
                    .map((it) => {
                      const d = draft[it.order_item_id] || {};
                      const row = { order_item_id: it.order_item_id };
                      if (d.final_unit_gbp !== "") row.final_unit_gbp = Number(d.final_unit_gbp);
                      if (d.final_unit_bdt !== "") row.final_unit_bdt = Number(d.final_unit_bdt);
                      return row;
                    })
                    .filter((r) => Object.keys(r).length > 1);

                  return runAction(
                    () => UK_API.orderFinalize(user.email, orderId, finalizeRows.length ? finalizeRows : undefined),
                    "Order finalized",
                  );
                }}
              >
                Finalize
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={actionBusy || status !== "finalized"}
                onClick={() => runAction(() => UK_API.orderStartProcessing(user.email, orderId), "Order moved to processing")}
              >
                Start Processing
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={actionBusy || status === "delivered"}
                onClick={() => runAction(() => UK_API.recomputeOrder(user.email, orderId), "Order totals recomputed")}
              >
                Recompute
              </Button>

              <Button
                size="sm"
                variant="destructive"
                disabled={actionBusy || status === "delivered" || status === "cancelled"}
                onClick={() => runAction(() => UK_API.orderCancel(user.email, orderId), "Order cancelled")}
              >
                Cancel
              </Button>

              <Button
                size="sm"
                variant={counterEnabled ? "outline" : "default"}
                disabled={actionBusy || status === "delivered" || status === "cancelled"}
                onClick={() =>
                  runAction(
                    () => UK_API.updateOrder(user.email, orderId, { counter_enabled: counterEnabled ? 0 : 1 }),
                    counterEnabled ? "Counter offer disabled" : "Counter offer enabled",
                  )
                }
              >
                {counterEnabled ? "Disable Counter" : "Enable Counter"}
              </Button>

              <Button
                size="sm"
                variant="destructive"
                disabled={actionBusy || !canPermanentDelete}
                onClick={() => {
                  setDeleteText("");
                  setDeleteOpen(true);
                }}
              >
                Permanent Delete
              </Button>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Qty {n0(order.total_order_qty)} • Alloc {n0(order.total_allocated_qty)} • Shipped {n0(order.total_shipped_qty)} • Remaining {n0(order.total_remaining_qty)} • Revenue {n0(order.total_revenue_bdt)} • Cost {n0(order.total_total_cost_bdt)} • Profit {n0(order.total_profit_bdt)}
            <div className="mt-1">Counter offer: <span className="font-medium text-foreground">{counterEnabled ? "Enabled" : "Disabled"}</span></div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <SkeletonRows />
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Bulk Set All Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-6">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Pricing Mode</label>
                  <Select
                    value={bulk.pricing_mode_id || "__none__"}
                    onValueChange={(v) => setBulk((p) => ({ ...p, pricing_mode_id: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="keep existing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">keep existing</SelectItem>
                      {modeOptions.map((m) => (
                        <SelectItem key={m.pricing_mode_id} value={m.pricing_mode_id}>
                          {m.pricing_mode_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Profit Rate</label>
                  <Input className="h-8 text-xs" value={bulk.profit_rate} onChange={(e) => setBulk((p) => ({ ...p, profit_rate: e.target.value }))} placeholder="keep existing" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Offered GBP</label>
                  <Input className="h-8 text-xs" value={bulk.offered_unit_gbp} onChange={(e) => setBulk((p) => ({ ...p, offered_unit_gbp: e.target.value }))} placeholder="keep existing" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Offered BDT</label>
                  <Input className="h-8 text-xs" value={bulk.offered_unit_bdt} onChange={(e) => setBulk((p) => ({ ...p, offered_unit_bdt: e.target.value }))} placeholder="keep existing" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Final GBP</label>
                  <Input className="h-8 text-xs" value={bulk.final_unit_gbp} onChange={(e) => setBulk((p) => ({ ...p, final_unit_gbp: e.target.value }))} placeholder="keep existing" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Final BDT</label>
                  <Input className="h-8 text-xs" value={bulk.final_unit_bdt} onChange={(e) => setBulk((p) => ({ ...p, final_unit_bdt: e.target.value }))} placeholder="keep existing" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" disabled={actionBusy} onClick={applyBulkToDraft}>
                      <CopyCheck className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Apply To All (draft only)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" disabled={actionBusy} onClick={applyAndSaveBulk}>
                      <SaveAll className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{actionBusy ? "Saving..." : "Apply & Save All"}</TooltipContent>
                </Tooltip>
              </div>
              <div className="text-xs text-muted-foreground">
                Leave any field empty to keep existing value for that field.
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Order Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground">No order items.</div>
              ) : (
                items.map((it) => {
                  const itemId = String(it.order_item_id || "").trim();
                  const rowDraft = draft[itemId] || {};

                  return (
                    <div key={itemId} className="rounded-lg border p-3">
                      <div className="text-sm font-semibold">{it.name || "Unnamed item"}</div>
                      <div className="text-xs text-muted-foreground">{itemId} • qty {n0(it.ordered_quantity)} • alloc {n0(it.allocated_qty_total)} • shipped {n0(it.shipped_qty_total)} • remaining {n0(it.remaining_qty)} • {it.item_status || "-"}</div>

                      <div className="mt-3 grid gap-2 md:grid-cols-9">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Pricing Mode</label>
                          <Select
                            value={String(rowDraft.pricing_mode_id || it.pricing_mode_id || "")}
                            onValueChange={(v) =>
                              setDraft((p) => ({ ...p, [itemId]: { ...p[itemId], pricing_mode_id: v } }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Mode" />
                            </SelectTrigger>
                            <SelectContent>
                              {modeOptions.map((m) => (
                                <SelectItem key={m.pricing_mode_id} value={m.pricing_mode_id}>
                                  {m.pricing_mode_id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Profit Rate</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(rowDraft.profit_rate ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, [itemId]: { ...p[itemId], profit_rate: e.target.value } }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Offered GBP</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(rowDraft.offered_unit_gbp ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                [itemId]: {
                                  ...p[itemId],
                                  offered_unit_gbp: e.target.value,
                                },
                              }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Offered BDT</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(rowDraft.offered_unit_bdt ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                [itemId]: {
                                  ...p[itemId],
                                  offered_unit_bdt: e.target.value,
                                },
                              }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Customer GBP</label>
                          <div className="h-8 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                            {it.customer_unit_gbp ?? "-"}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Customer BDT</label>
                          <div className="h-8 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                            {it.customer_unit_bdt ?? "-"}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Final GBP</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(rowDraft.final_unit_gbp ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                [itemId]: {
                                  ...p[itemId],
                                  final_unit_gbp: e.target.value,
                                },
                              }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Final BDT</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(rowDraft.final_unit_bdt ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                [itemId]: {
                                  ...p[itemId],
                                  final_unit_bdt: e.target.value,
                                },
                              }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div className="flex items-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" disabled={!!saving[itemId]} onClick={() => saveItem(it)}>
                                <Save className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{saving[itemId] ? "Saving..." : "Save row"}</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      {rowErr[itemId] ? <div className="mt-2 text-xs text-destructive">{rowErr[itemId]}</div> : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Allocations</CardTitle>
            </CardHeader>
            <CardContent>
              {allocations.length === 0 ? (
                <div className="text-sm text-muted-foreground">No allocations yet. Add from shipment details.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2">Allocation</th>
                        <th className="px-3 py-2">Shipment</th>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Weights</th>
                        <th className="px-3 py-2">Cost/Profit BDT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allocations.map((a) => (
                        <tr key={a.allocation_id}>
                          <td className="px-3 py-2">{a.allocation_id}</td>
                          <td className="px-3 py-2">{a.shipment_id}</td>
                          <td className="px-3 py-2">{a.order_item_id}</td>
                          <td className="px-3 py-2">alloc {n0(a.allocated_qty)} / shipped {n0(a.shipped_qty)}</td>
                          <td className="px-3 py-2">{a.unit_total_weight || 0}kg • shipped {a.shipped_weight || 0}kg</td>
                          <td className="px-3 py-2">cost {n0(a.total_cost_bdt)} • profit {n0(a.profit_bdt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!deleting) setDeleteOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete Order</DialogTitle>
            <DialogDescription>
              This action cannot be undone. It will delete the order, its items, and related allocations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Only allowed when status is delivered or cancelled.
            </div>
            <div className="text-xs text-muted-foreground">
              Type this exact order name to confirm:
              <span className="ml-1 font-semibold text-foreground">{deleteMatchText || "-"}</span>
            </div>
            <Input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type exact order name"
              disabled={deleting}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onPermanentDelete}
              disabled={deleting || String(deleteText || "").trim() !== deleteMatchText}
            >
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
