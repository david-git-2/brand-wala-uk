import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function ItemsSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="mt-2 h-3 w-40" />
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
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

export default function CustomerOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);

  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState({});
  const [rowErr, setRowErr] = useState({});

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [topMsg, setTopMsg] = useState("");
  const [sendingCounter, setSendingCounter] = useState(false);
  const [accepting, setAccepting] = useState(false);

  async function loadAll() {
    if (!user?.email || !orderId) return;

    const [ordersRes, itemsRes] = await Promise.all([
      UK_API.getOrders(user.email),
      UK_API.getOrderItems(user.email, orderId),
    ]);

    const allOrders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];
    const currentOrder = allOrders.find((o) => String(o.order_id) === String(orderId)) || null;
    const nextItems = Array.isArray(itemsRes.items) ? itemsRes.items : [];

    setOrder(currentOrder);
    setItems(nextItems);

    setDraft((prev) => {
      const next = { ...prev };
      for (const it of nextItems) {
        const id = String(it.order_item_id || "").trim();
        if (!id) continue;
        if (next[id] == null) {
          const v = isGBPMode(it.pricing_mode_id) ? it.customer_unit_gbp : it.customer_unit_bdt;
          next[id] = v == null || v === "" ? "" : String(v);
        }
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
  const canCounter = (status === "priced" || status === "under_review") && counterEnabled;
  const canAccept = status === "priced";

  async function saveCounterUnit(item) {
    const itemId = String(item.order_item_id || "").trim();
    if (!itemId || !canCounter) return;

    const raw = String(draft[itemId] ?? "").trim();
    const parsed = raw === "" ? "" : Number(raw);
    if (raw !== "" && !Number.isFinite(parsed)) {
      setRowErr((p) => ({ ...p, [itemId]: "Invalid number" }));
      return;
    }

    const patch = { order_item_id: itemId };
    if (isGBPMode(item.pricing_mode_id)) patch.customer_unit_gbp = parsed;
    else patch.customer_unit_bdt = parsed;

    setSaving((p) => ({ ...p, [itemId]: true }));
    setRowErr((p) => ({ ...p, [itemId]: "" }));
    try {
      await UK_API.updateOrderItems(user.email, orderId, [patch]);
      await loadAll();
    } catch (e) {
      setRowErr((p) => ({ ...p, [itemId]: e?.message || "Failed to save" }));
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[itemId];
        return next;
      });
    }
  }

  async function sendCounter() {
    if (!canCounter) return;

    const payload = [];
    for (const it of items) {
      const itemId = String(it.order_item_id || "").trim();
      if (!itemId) continue;

      const raw = String(draft[itemId] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;

      const row = { order_item_id: itemId };
      if (isGBPMode(it.pricing_mode_id)) row.customer_unit_gbp = n;
      else row.customer_unit_bdt = n;
      payload.push(row);
    }

    if (!payload.length) {
      setTopMsg("Enter at least one counter price before sending.");
      return;
    }

    setSendingCounter(true);
    setTopMsg("");
    try {
      await UK_API.orderCustomerCounter(user.email, orderId, payload);
      await loadAll();
      setTopMsg("Counter sent to admin.");
    } catch (e) {
      setTopMsg(e?.message || "Failed to send counter");
    } finally {
      setSendingCounter(false);
    }
  }

  async function acceptOffer() {
    if (!canAccept) return;
    setAccepting(true);
    setTopMsg("");
    try {
      await UK_API.orderAcceptOffer(user.email, orderId);
      await loadAll();
      setTopMsg("Offer accepted. Order finalized.");
    } catch (e) {
      setTopMsg(e?.message || "Failed to accept offer");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Details</h1>
          <div className="text-sm text-muted-foreground">{orderId}</div>
          {status ? <Badge className="mt-2" variant="secondary">{status}</Badge> : null}
        </div>
        <Button variant="outline" onClick={() => navigate("/customer/orders")}>Back</Button>
      </div>

      {err ? (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>
      ) : null}

      {topMsg ? (
        <div className="mb-3 rounded-lg border px-4 py-3 text-sm">{topMsg}</div>
      ) : null}

      {!loading && order ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Qty {n0(order.total_order_qty)} • Shipped {n0(order.total_shipped_qty)} • Remaining {n0(order.total_remaining_qty)} • Total Cost (BDT) {n0(order.total_total_cost_bdt)}
            <div className="mt-1">Counter offer: <span className="font-medium text-foreground">{counterEnabled ? "Enabled" : "Disabled by admin"}</span></div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <ItemsSkeleton />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Items</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={!canAccept || accepting} onClick={acceptOffer}>
                {accepting ? "Accepting..." : "Accept Offer"}
              </Button>
              <Button disabled={!canCounter || sendingCounter} onClick={sendCounter}>
                {sendingCounter ? "Sending..." : "Send Counter"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!counterEnabled ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Counter offer is currently turned off by admin. You can still accept the offer when available.
              </div>
            ) : null}
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No items.</div>
            ) : (
              items.map((it) => {
                const itemId = String(it.order_item_id || "").trim();
                const modeGBP = isGBPMode(it.pricing_mode_id);
                const offered = modeGBP ? it.offered_unit_gbp : it.offered_unit_bdt;
                const customer = modeGBP ? it.customer_unit_gbp : it.customer_unit_bdt;
                const finalUnit = modeGBP ? it.final_unit_gbp : it.final_unit_bdt;
                const showFinalPrice =
                  status === "finalized" ||
                  status === "processing" ||
                  status === "partially_delivered" ||
                  status === "delivered";
                const shownUnit = showFinalPrice ? finalUnit : offered;
                const shownLabel = showFinalPrice ? "Final unit (mode)" : "Offered unit (mode)";

                return (
                  <div key={itemId} className="rounded-lg border p-3">
                    <div className="text-sm font-semibold">{it.name || "Unnamed item"}</div>
                    <div className="text-xs text-muted-foreground">{itemId} • mode {it.pricing_mode_id || "-"} • qty {n0(it.ordered_quantity)}</div>

                    <div className="mt-3 grid gap-2 md:grid-cols-5">
                      <div className="rounded-lg border p-2 text-xs">
                        <div className="text-muted-foreground">Offered GBP</div>
                        <div className="font-semibold">{it.offered_unit_gbp ?? "-"}</div>
                      </div>

                      <div className="rounded-lg border p-2 text-xs">
                        <div className="text-muted-foreground">Offered BDT</div>
                        <div className="font-semibold">{it.offered_unit_bdt ?? "-"}</div>
                      </div>

                      <div className="rounded-lg border p-2 text-xs">
                        <div className="text-muted-foreground">{shownLabel}</div>
                        <div className="font-semibold">{shownUnit ?? "-"}</div>
                      </div>

                      <div className="rounded-lg border p-2 text-xs">
                        <div className="text-muted-foreground">Customer unit</div>
                        <Input
                          value={draft[itemId] ?? (customer ?? "")}
                          onChange={(e) => setDraft((p) => ({ ...p, [itemId]: e.target.value }))}
                          onBlur={() => saveCounterUnit(it)}
                          disabled={!canCounter || !!saving[itemId]}
                          inputMode="decimal"
                          className="mt-1 h-8"
                        />
                      </div>

                      <div className="rounded-lg border p-2 text-xs">
                        <div className="text-muted-foreground">Final unit</div>
                        <div className="font-semibold">{finalUnit ?? "-"}</div>
                      </div>

                      <div className="rounded-lg border p-2 text-xs">
                        <div className="text-muted-foreground">Delivery</div>
                        <div className="font-semibold">shipped {n0(it.shipped_qty_total)} / remaining {n0(it.remaining_qty)}</div>
                      </div>
                    </div>

                    {rowErr[itemId] ? <div className="mt-2 text-xs text-destructive">{rowErr[itemId]}</div> : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
