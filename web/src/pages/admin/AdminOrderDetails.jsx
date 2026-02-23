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

function isGBPMode(id) {
  return String(id || "").toUpperCase().includes("GBP");
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
          pricing_mode_id: prev[id]?.pricing_mode_id ?? String(it.pricing_mode_id || ""),
          profit_rate: prev[id]?.profit_rate ?? String(it.profit_rate ?? ""),
          offered_unit_gbp: prev[id]?.offered_unit_gbp ?? String(it.offered_unit_gbp ?? ""),
          offered_unit_bdt: prev[id]?.offered_unit_bdt ?? String(it.offered_unit_bdt ?? ""),
          final_unit_gbp: prev[id]?.final_unit_gbp ?? String(it.final_unit_gbp ?? ""),
          final_unit_bdt: prev[id]?.final_unit_bdt ?? String(it.final_unit_bdt ?? ""),
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

  const modeOptions = useMemo(
    () => pricingModes.filter((m) => Number(m.active) === 1 || String(m.active).toLowerCase() === "true"),
    [pricingModes],
  );

  const defaultModeId = useMemo(() => {
    const pm = modeOptions.find((m) => String(m.pricing_mode_id).toUpperCase() === "PM_GBP_PROD_V1");
    return pm?.pricing_mode_id || modeOptions[0]?.pricing_mode_id || "";
  }, [modeOptions]);

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

  return (
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
                onClick={() => runAction(() => UK_API.orderPrice(user.email, orderId, defaultModeId, 0.1), "Order priced")}
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
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Qty {n0(order.total_order_qty)} • Alloc {n0(order.total_allocated_qty)} • Shipped {n0(order.total_shipped_qty)} • Remaining {n0(order.total_remaining_qty)} • Revenue {n0(order.total_revenue_bdt)} • Cost {n0(order.total_total_cost_bdt)} • Profit {n0(order.total_profit_bdt)}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <SkeletonRows />
      ) : (
        <>
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
                  const modeGBP = isGBPMode(rowDraft.pricing_mode_id || it.pricing_mode_id);

                  return (
                    <div key={itemId} className="rounded-lg border p-3">
                      <div className="text-sm font-semibold">{it.name || "Unnamed item"}</div>
                      <div className="text-xs text-muted-foreground">{itemId} • qty {n0(it.ordered_quantity)} • alloc {n0(it.allocated_qty_total)} • shipped {n0(it.shipped_qty_total)} • remaining {n0(it.remaining_qty)} • {it.item_status || "-"}</div>

                      <div className="mt-3 grid gap-2 md:grid-cols-6">
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
                          <label className="mb-1 block text-xs text-muted-foreground">Offered Unit</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(modeGBP ? rowDraft.offered_unit_gbp ?? "" : rowDraft.offered_unit_bdt ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                [itemId]: {
                                  ...p[itemId],
                                  [modeGBP ? "offered_unit_gbp" : "offered_unit_bdt"]: e.target.value,
                                },
                              }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Customer Unit</label>
                          <div className="h-8 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                            {modeGBP ? it.customer_unit_gbp ?? "-" : it.customer_unit_bdt ?? "-"}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Final Unit</label>
                          <Input
                            className="h-8 text-xs"
                            value={String(modeGBP ? rowDraft.final_unit_gbp ?? "" : rowDraft.final_unit_bdt ?? "")}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                [itemId]: {
                                  ...p[itemId],
                                  [modeGBP ? "final_unit_gbp" : "final_unit_bdt"]: e.target.value,
                                },
                              }))
                            }
                            inputMode="decimal"
                          />
                        </div>

                        <div className="flex items-end">
                          <Button size="sm" disabled={!!saving[itemId]} onClick={() => saveItem(it)}>
                            {saving[itemId] ? "Saving..." : "Save"}
                          </Button>
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
    </div>
  );
}
