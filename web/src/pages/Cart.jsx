// ============================
// src/pages/Cart.jsx
// SHADCN + THEME COLORS + INLINE SKELETON
// ============================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { minCaseSize, useCart } from "../cart/CartProvider";
import PlaceOrderDialog from "../components/PlaceOrderDialog";
import ConfirmDeleteDialog from "../components/common/ConfirmDeleteDialog";

// shadcn/ui
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// icons
import { Loader2, Minus, Plus, Save, Trash2 } from "lucide-react";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  if (!fileId) return url;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// ----------------------------
// Inline skeleton (no separate file)
// ----------------------------
function CartSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="rounded-xl border border-border bg-card">
          <CardContent className="p-2.5">
            <div className="flex gap-2.5">
              <Skeleton className="h-14 w-14 rounded-lg" />

              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-20" />
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>

                <div className="mt-2">
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Cart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canSeePrice = !!user?.can_see_price_gbp;

  const {
    items,
    remove,
    clear,
    loading,
    getItemLoadingOp,
    updateQty, // must exist in provider
    createOrder, // must exist in provider
  } = useCart();

  const [draftQtyByKey, setDraftQtyByKey] = useState({});
  const [savingKey, setSavingKey] = useState(null);

  const [placeOpen, setPlaceOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");

  function getDraftQty(it) {
    const v = draftQtyByKey[it.key];
    return typeof v === "number" ? v : it.qty;
  }
  function setDraftQty(key, next) {
    setDraftQtyByKey((prev) => ({ ...prev, [key]: next }));
  }
  function bumpQty(it, dir) {
    const step = minCaseSize(it.product);
    const current = getDraftQty(it);
    const next = Math.max(step, current + dir * step);
    setDraftQty(it.key, next);
  }
  function isDirty(it) {
    return getDraftQty(it) !== it.qty;
  }

  async function onSaveQty(it) {
    setSavingKey(it.key);
    try {
      const step = minCaseSize(it.product);
      const safeQty = Math.max(step, Number(getDraftQty(it) || 0) || 0);
      await updateQty(it.key, safeQty);

      setDraftQtyByKey((prev) => {
        const copy = { ...prev };
        delete copy[it.key];
        return copy;
      });
    } finally {
      setSavingKey(null);
    }
  }

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalPrice = 0;

    for (const it of items) {
      const qty = getDraftQty(it);
      totalQty += qty;
      totalPrice += Number(it.product?.price ?? 0) * qty;
    }
    return { totalQty, totalPrice };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, draftQtyByKey]);

  const anyDirty = items.some(isDirty);

  async function onCreateOrder(name) {
    setOrderError("");
    const orderName = String(name || "").trim();
    if (!orderName) {
      setOrderError("Please enter an order name.");
      return;
    }

    try {
      setCreatingOrder(true);

      await createOrder(orderName);

      setPlaceOpen(false);

      // optional: clear (server may also clear)
      await clear();
      navigate("/orders");
    } catch (e) {
      setOrderError(e?.message ? e.message : "Failed to create order.");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function onConfirmClear() {
    await clear();
    setClearOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-3 md:p-5">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Cart</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>

        {items.length > 0 && (
          <Button
            variant="outline"
            className="w-full rounded-xl sm:w-auto"
            onClick={() => setClearOpen(true)}
            disabled={loading || creatingOrder}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Clearing…
              </>
            ) : (
              "Clear cart"
            )}
          </Button>
        )}
      </div>

      {/* Body */}
      {loading && items.length === 0 ? (
        <CartSkeleton rows={3} />
      ) : items.length === 0 ? (
        <Card className="rounded-2xl border border-border bg-muted">
          <CardContent className="p-8 text-center text-muted-foreground">
            Your cart is empty.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const p = it.product;
            const step = minCaseSize(p);
            const src = toDirectGoogleImageUrl(p.imageUrl);

            const op = getItemLoadingOp?.(it.key);
            const busy = !!op || savingKey === it.key;

            const draftQty = getDraftQty(it);
            const dirty = isDirty(it);

            return (
              <Card
                key={it.key}
                className={[
                  "rounded-xl border border-border bg-card shadow-sm",
                  busy ? "opacity-70" : "",
                ].join(" ")}
              >
                <CardContent className="p-2.5">
                  <div className="flex gap-2.5">
                    {/* Image */}
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-white">
                      {src ? (
                        <img
                          src={src}
                          alt={p.name}
                          className="h-14 w-14 object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = p.imageUrl;
                          }}
                        />
                      ) : null}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {p.brand}
                          </div>
                          <div className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                            {p.name}
                          </div>
                        </div>

                        {canSeePrice ? (
                          <div className="shrink-0 text-xs font-semibold text-foreground">
                            £{Number(p.price ?? 0).toFixed(2)}
                          </div>
                        ) : (
                          <div className="shrink-0 text-xs font-medium text-muted-foreground">
                            Login to see price
                          </div>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          Step:{" "}
                          <span className="font-medium text-foreground">
                            {step}
                          </span>
                        </div>

                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          Case {step}
                        </Badge>
                      </div>

                      <Separator className="my-2" />

                      {/* Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => bumpQty(it, -1)}
                            disabled={busy || loading || creatingOrder}
                            title={`- ${step}`}
                            aria-label={`Decrease by ${step}`}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>

                          <div className="min-w-[84px] text-center">
                            <div className="text-xs font-semibold text-foreground">
                              {draftQty}
                            </div>

                            <div className="text-[10px] text-muted-foreground">
                              {savingKey === it.key ? (
                                <span className="inline-flex items-center justify-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Saving…
                                </span>
                              ) : dirty ? (
                                "unsaved"
                              ) : (
                                "quantity"
                              )}
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => bumpQty(it, +1)}
                            disabled={busy || loading || creatingOrder}
                            title={`+ ${step}`}
                            aria-label={`Increase by ${step}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>

                          {dirty && (
                            <Button
                              size="icon"
                              onClick={() => onSaveQty(it)}
                              disabled={busy || loading || creatingOrder}
                              className="ml-1 h-8 w-8 rounded-lg"
                              title="Save quantity"
                              aria-label="Save quantity"
                            >
                              {savingKey === it.key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>

                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => remove(it.key)}
                          disabled={busy || loading || creatingOrder}
                          title="Delete item"
                          aria-label="Delete item"
                        >
                          {op === "remove" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {canSeePrice && (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          Line total:{" "}
                          <span className="font-medium text-foreground">
                            £{(Number(p.price ?? 0) * draftQty).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Totals */}
      <Card className="mt-6 rounded-2xl border border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total quantity</span>
            <span className="font-semibold text-foreground">
              {totals.totalQty}
            </span>
          </div>

          {canSeePrice && (
            <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
              <span>Estimated total</span>
              <span className="text-base font-bold text-foreground">
                £{totals.totalPrice.toFixed(2)}
              </span>
            </div>
          )}

          <Button
            className="mt-4 w-full rounded-2xl"
            disabled={
              items.length === 0 || loading || creatingOrder || anyDirty
            }
            onClick={() => setPlaceOpen(true)}
            title={
              anyDirty
                ? "Save quantity changes before placing order"
                : "Place order"
            }
          >
            {creatingOrder ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating order…
              </>
            ) : (
              "Place order"
            )}
          </Button>

          {anyDirty && (
            <p className="mt-2 text-center text-xs text-amber-600">
              Please save your quantity changes before placing the order.
            </p>
          )}

          <p className="mt-2 text-center text-xs text-muted-foreground">
            Quantity changes by case size (min 6).
          </p>
        </CardContent>
      </Card>

      <PlaceOrderDialog
        open={placeOpen}
        onClose={() => {
          if (!creatingOrder) {
            setPlaceOpen(false);
            setOrderError("");
          }
        }}
        onCreate={onCreateOrder}
        loading={creatingOrder}
        error={orderError}
        userEmail={user?.email}
      />

      <ConfirmDeleteDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={onConfirmClear}
        title="Clear cart?"
        description="This will remove all items from your cart."
        confirmText="Clear"
        loading={loading}
      />
    </div>
  );
}
