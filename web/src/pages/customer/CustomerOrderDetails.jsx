import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Pencil, Save } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  getOrderItemsForViewer,
  saveCustomerOfferItem,
  submitCustomerPricingDecision,
} from "@/firebase/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function imgUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : url;
}

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <Skeleton className="h-14 w-full" />
        </div>
      ))}
    </div>
  );
}

function gbp(v) {
  return `£${(Number(v) || 0).toFixed(2)}`;
}

function bdt(v) {
  return `৳${Math.round(Number(v) || 0)}`;
}

export default function CustomerOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState({});
  const [savingDecision, setSavingDecision] = useState(false);
  const [rowSaving, setRowSaving] = useState({});
  const [rowEditMode, setRowEditMode] = useState({});
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");
      try {
        const data = await getOrderItemsForViewer({
          email: user.email,
          role: user.role,
          order_id: orderId,
        });
        if (!alive) return;
        if (!data.order) {
          setErr("Order not found");
          setOrder(null);
          setItems([]);
          return;
        }
        setOrder(data.order);
        setItems(data.items || []);
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load order");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email, user?.role, orderId]);

  useEffect(() => {
    const next = {};
    const showGbp = !!user?.can_see_price_gbp;
    (items || []).forEach((it) => {
      const cs = it?.calculated_selling_price || {};
      const saved = showGbp ? Number(it?.customer_unit_gbp) : Number(it?.customer_unit_bdt);
      const offered = showGbp
        ? Number(cs?.selling_unit_gbp ?? cs?.offered_product_unit_gbp ?? 0)
        : Number(cs?.selling_unit_bdt ?? cs?.offered_product_unit_bdt ?? 0);
      const v = Number.isFinite(saved) && saved > 0 ? saved : offered;
      next[String(it.order_item_id || "")] = v > 0 ? String(v) : "";
      next[`qty__${String(it.order_item_id || "")}`] = String(
        Math.max(0, Math.round(Number(it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0))),
      );
    });
    setDraft(next);
  }, [items, user?.can_see_price_gbp]);

  const status = String(order?.status || "").toLowerCase();
  const canShowPriceStatuses = new Set([
    "priced",
    "under_review",
    "finalized",
    "processing",
    "partially_delivered",
    "delivered",
  ]);
  const canShowPrice = canShowPriceStatuses.has(status);
  const showFinalizedView = new Set([
    "finalized",
    "processing",
    "partially_delivered",
    "delivered",
  ]).has(status);
  const editLocked = status !== "priced";
  const showGbp = !!user?.can_see_price_gbp;
  const offeredOrderTotal = (items || []).reduce((acc, it) => {
    const cs = it?.calculated_selling_price || {};
    const id = String(it?.order_item_id || "");
    const qty = Math.max(
      0,
      Math.round(Number(draft[`qty__${id}`] ?? it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0)),
    );
    const unit = showFinalizedView
      ? (showGbp
          ? Number(it?.final_unit_gbp ?? it?.customer_unit_gbp ?? cs?.selling_unit_gbp ?? cs?.offered_product_unit_gbp ?? 0)
          : Number(it?.final_unit_bdt ?? it?.customer_unit_bdt ?? cs?.selling_unit_bdt ?? cs?.offered_product_unit_bdt ?? 0))
      : (showGbp
          ? Number(cs?.selling_unit_gbp ?? cs?.offered_product_unit_gbp ?? 0)
          : Number(cs?.selling_unit_bdt ?? cs?.offered_product_unit_bdt ?? 0));
    return acc + (Number.isFinite(unit) ? unit * qty : 0);
  }, 0);
  const customerOrderTotal = (items || []).reduce((acc, it) => {
    const id = String(it?.order_item_id || "");
    const saved = showFinalizedView
      ? (showGbp ? Number(it?.final_unit_gbp) : Number(it?.final_unit_bdt))
      : (showGbp ? Number(it?.customer_unit_gbp) : Number(it?.customer_unit_bdt));
    const fromDraft = Number(draft[id] || 0);
    const unit = Number.isFinite(saved) && saved > 0 ? saved : fromDraft;
    const qty = Math.max(
      0,
      Math.round(Number(
        showFinalizedView
          ? (it?.final_quantity ?? it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0)
          : (draft[`qty__${id}`] ?? it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0),
      )),
    );
    return acc + (Number.isFinite(unit) ? unit * qty : 0);
  }, 0);
  const allItemsSaved = items.length > 0 && items.every((it) => {
    const saved = showGbp ? Number(it?.customer_unit_gbp) : Number(it?.customer_unit_bdt);
    return Number.isFinite(saved) && saved > 0;
  });

  async function submitDecision() {
    if (!orderId || !user?.email || !items.length) return;
    setSavingDecision(true);
    setActionMsg("");
    try {
      if (!allItemsSaved) throw new Error("Save each item price first.");
      const offers = items.map((it) => {
        const id = String(it.order_item_id || "");
        const unit = showGbp ? Number(it?.customer_unit_gbp || 0) : Number(it?.customer_unit_bdt || 0);
        return { order_item_id: id, unit_price: unit };
      });
      const res = await submitCustomerPricingDecision({
        email: user.email,
        order_id: orderId,
        decision: "negotiate",
        currency: showGbp ? "gbp" : "bdt",
        offers,
      });
      const nextStatus = String(res?.status || "").toLowerCase();
      setOrder((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setActionMsg("Customer review submitted. Order moved to under_review.");
    } catch (e) {
      setActionMsg(e?.message || "Failed to submit decision");
    } finally {
      setSavingDecision(false);
    }
  }

  async function saveItemDecision(it) {
    const id = String(it?.order_item_id || "");
    if (!id || !orderId || !user?.email) return;
    setRowSaving((p) => ({ ...p, [id]: true }));
    setActionMsg("");
    try {
      const cs = it?.calculated_selling_price || {};
      const unit = Number(draft[id] || 0);
      const changedQty = Math.max(
        0,
        Math.round(Number(draft[`qty__${id}`] ?? it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0)),
      );
      if (editLocked) throw new Error("Editing is locked for this status.");
      if (!(unit > 0)) throw new Error("Enter valid price");
      if (!(changedQty > 0)) throw new Error("Enter valid quantity");
      await saveCustomerOfferItem({
        email: user.email,
        order_id: orderId,
        order_item_id: id,
        currency: showGbp ? "gbp" : "bdt",
        unit_price: unit,
        customer_changed_quantity: changedQty,
        decision: "negotiate",
      });
      const refreshed = await getOrderItemsForViewer({
        email: user.email,
        role: user.role,
        order_id: orderId,
      });
      if (refreshed?.order) setOrder(refreshed.order);
      if (Array.isArray(refreshed?.items)) setItems(refreshed.items);
      setRowEditMode((p) => ({ ...p, [id]: false }));
      setActionMsg(`Saved ${it?.name || "item"} offer.`);
    } catch (e) {
      setActionMsg(e?.message || "Failed to save item offer");
    } finally {
      setRowSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Items</h1>
          <div className="text-sm text-muted-foreground">{order?.order_name || orderId}</div>
          {order?.status ? <Badge className="mt-2" variant="secondary">{String(order.status || "").toLowerCase()}</Badge> : null}
        </div>
        <Button variant="outline" onClick={() => nav("/customer/orders")}>Back</Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>
      ) : null}
      {actionMsg ? (
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm">{actionMsg}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <RowsSkeleton />
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items.</div>
          ) : (
            <>
              {canShowPrice ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="text-xs text-muted-foreground">Save each item. Then change order status.</div>
                    <div className="ml-auto">
                      <Button size="sm" onClick={submitDecision} disabled={savingDecision || !allItemsSaved || editLocked}>
                        {savingDecision ? "Updating..." : "Change Order Status"}
                      </Button>
                    </div>
                  </div>
                  <div className="mb-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Offered Order Value</div>
                      <div className="font-semibold">
                        {showGbp ? gbp(offeredOrderTotal) : bdt(offeredOrderTotal)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Customer Total</div>
                      <div className="font-semibold">
                        {showGbp ? gbp(customerOrderTotal) : bdt(customerOrderTotal)}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Price is hidden. Ask admin to move order status to <span className="font-medium">priced</span> or later.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2">Product</th>
                      {canShowPrice ? (
                        <th className="px-3 py-2">{showFinalizedView ? "Final Qty" : "Changed Qty"}</th>
                      ) : null}
                      {canShowPrice && showGbp ? <th className="px-3 py-2">Unit Purchase</th> : null}
                      {canShowPrice && showGbp ? <th className="px-3 py-2">Cargo / Unit</th> : null}
                      {canShowPrice ? <th className="px-3 py-2">{showFinalizedView ? "Final Price / Unit" : "Offered / Unit"}</th> : null}
                      {canShowPrice && !showFinalizedView ? <th className="px-3 py-2">Counter Offer</th> : null}
                      {canShowPrice && !showFinalizedView ? <th className="px-3 py-2">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((it) => {
                      const cs = it?.calculated_selling_price || {};
                      const id = String(it.order_item_id || "");
                      const offered = showFinalizedView
                        ? (showGbp
                            ? Number(it?.final_unit_gbp ?? it?.customer_unit_gbp ?? cs?.selling_unit_gbp ?? cs?.offered_product_unit_gbp ?? 0)
                            : Number(it?.final_unit_bdt ?? it?.customer_unit_bdt ?? cs?.selling_unit_bdt ?? cs?.offered_product_unit_bdt ?? 0))
                        : (showGbp
                        ? Number(cs?.selling_unit_gbp ?? cs?.offered_product_unit_gbp ?? 0)
                        : Number(cs?.selling_unit_bdt ?? cs?.offered_product_unit_bdt ?? 0));
                      const cargo = showGbp ? Number(cs?.cargo_unit_gbp || 0) : Number(cs?.cargo_unit_bdt || 0);
                      const purchase = showGbp
                        ? Number(it?.buy_price_gbp || 0)
                        : Number(cs?.profit_rate_pct || 0) >= 0
                          ? offered / (1 + Number(cs?.profit_rate_pct || 0) / 100)
                          : 0;
                      const hasSaved = showGbp
                        ? Number(it?.customer_unit_gbp || 0) > 0
                        : Number(it?.customer_unit_bdt || 0) > 0;
                      const isEditable = rowEditMode[id] ?? !hasSaved;
                      return (
                        <tr key={id}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-9 w-9 overflow-hidden rounded border bg-muted">
                                {it.image_url ? <img src={imgUrl(it.image_url)} alt={it.name} className="h-full w-full object-cover" /> : null}
                              </div>
                              <div className="font-medium">{it.name || "Item"}</div>
                            </div>
                          </td>
                          {canShowPrice ? (
                            <td className="px-3 py-2">
                              {showFinalizedView ? (
                                Math.max(
                                  0,
                                  Math.round(
                                    Number(it?.final_quantity ?? it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0),
                                  ),
                                )
                              ) : (
                                <input
                                  className="h-8 w-20 rounded-md border bg-background px-2"
                                  value={String(
                                    draft[`qty__${id}`] ??
                                      Math.max(
                                        0,
                                        Math.round(
                                          Number(it?.customer_changed_quantity ?? it?.ordered_quantity ?? 0),
                                        ),
                                      ),
                                  )}
                                  onChange={(e) =>
                                    setDraft((p) => ({
                                      ...p,
                                      [`qty__${id}`]: e.target.value,
                                    }))
                                  }
                                  inputMode="numeric"
                                  disabled={editLocked || !isEditable}
                                />
                              )}
                            </td>
                          ) : null}
                          {canShowPrice && showGbp ? <td className="px-3 py-2">{gbp(purchase)}</td> : null}
                          {canShowPrice && showGbp ? <td className="px-3 py-2">{gbp(cargo)}</td> : null}
                          {canShowPrice ? <td className="px-3 py-2">{showGbp ? gbp(offered) : bdt(offered)}</td> : null}
                          {canShowPrice && !showFinalizedView ? (
                            <td className="px-3 py-2">
                              <input
                                className="h-8 w-28 rounded-md border bg-background px-2"
                                value={String(draft[id] ?? "")}
                                onChange={(e) => setDraft((p) => ({ ...p, [id]: e.target.value }))}
                                inputMode="decimal"
                                disabled={editLocked || !isEditable}
                              />
                            </td>
                          ) : null}
                          {canShowPrice && !showFinalizedView ? (
                            <td className="px-3 py-2">
                              {hasSaved && !isEditable ? (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => setRowEditMode((p) => ({ ...p, [id]: true }))}
                                  aria-label="Edit item"
                                  title="Edit"
                                  disabled={editLocked}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => saveItemDecision(it)}
                                  disabled={!!rowSaving[id] || editLocked}
                                  aria-label="Save item"
                                  title="Save"
                                >
                                  {rowSaving[id] ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
