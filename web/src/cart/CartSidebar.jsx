// ============================
// src/cart/CartSidebar.jsx
// SHADCN + THEME COLORS + LUCIDE ICONS
// ============================

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { minCaseSize, useCart } from "./CartProvider";

// shadcn/ui
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

// icons
import {
  Loader2,
  Minus,
  Plus,
  Trash2,
  X,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  if (!fileId) return url;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

export default function CartSidebar() {
  const nav = useNavigate();

  const { user } = useAuth();
  const canSeePrice = !!user?.can_see_price_gbp;

  const {
    open,
    closeCart,
    items,
    inc,
    dec,
    remove,
    clear,
    isItemLoading,
    loading,
  } = useCart();

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalPrice = 0;

    for (const it of items) {
      totalQty += it.qty;
      totalPrice += Number(it.product?.price ?? 0) * it.qty;
    }

    return { totalQty, totalPrice };
  }, [items]);

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? closeCart() : null)}>
      <SheetContent
        side="right"
        className="w-full max-w-md p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <SheetHeader className="border-b border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <ShoppingCart className="h-5 w-5" />
                  <span>Your Cart</span>
                </SheetTitle>
                <div className="mt-1 text-sm text-muted-foreground">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clear}
                    disabled={loading}
                    className="rounded-xl"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Clearing…
                      </>
                    ) : (
                      "Clear"
                    )}
                  </Button>
                )}

                <Button
                  variant="default"
                  size="icon"
                  onClick={closeCart}
                  className="rounded-xl"
                  aria-label="Close cart"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Body */}
          <div className="flex-1 min-h-0">
            {items.length === 0 ? (
              <div className="p-4">
                <Card className="rounded-2xl border border-border bg-muted p-6 text-center text-muted-foreground">
                  Your cart is empty.
                </Card>
              </div>
            ) : (
              <ScrollArea className="h-full min-w-0">
                <div className="w-full min-w-0 space-y-2 p-3">
                  {items.map((it) => {
                    const p = it.product;
                    const step = minCaseSize(p);
                    const src = toDirectGoogleImageUrl(p.imageUrl);
                    const busy = !!isItemLoading?.(it.key);

                    return (
                      <Card
                        key={it.key}
                        className={[
                          "w-full max-w-full overflow-hidden rounded-xl border border-border bg-card mx-0 px-3 py-2 shadow-sm",
                          busy ? "opacity-70" : "",
                        ].join(" ")}
                      >
                        <div className="flex w-full min-w-0 gap-2">
                          {/* Image */}
                          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
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
                                <div className="text-sm font-semibold leading-5 text-foreground break-words">
                                  {p.name}
                                </div>
                              </div>

                              {canSeePrice ? (
                                <div className="shrink-0 text-sm font-semibold text-foreground">
                                  £{Number(p.price ?? 0).toFixed(2)}
                                </div>
                              ) : (
                                <div className="shrink-0 text-[11px] font-medium text-muted-foreground">
                                  Login
                                </div>
                              )}
                            </div>

                            {/* Meta row */}
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <div className="text-[11px] text-muted-foreground">
                                Case{" "}
                                <span className="font-medium text-foreground">
                                  {step}
                                </span>
                              </div>

                              {canSeePrice && (
                                <div className="text-[11px] text-muted-foreground">
                                  Line{" "}
                                  <span className="font-medium text-foreground">
                                    £
                                    {(Number(p.price ?? 0) * it.qty).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Controls */}
                            <div className="mt-2 flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => dec(it.key)}
                                disabled={busy || loading}
                                aria-label={`Decrease by ${step}`}
                                title={`- ${step}`}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>

                              <div className="min-w-[64px] text-center">
                                <div className="text-sm font-semibold leading-5 text-foreground">
                                  {it.qty}
                                </div>
                                <div className="text-[10px] leading-4 text-muted-foreground">
                                  qty
                                </div>
                              </div>

                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => inc(it.key)}
                                disabled={busy || loading}
                                aria-label={`Increase by ${step}`}
                                title={`+ ${step}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>

                              <Badge
                                variant="secondary"
                                className="ml-1 rounded-full px-2 py-0 text-[10px]"
                              >
                                Case {step}
                              </Badge>

                              <Button
                                variant="destructive"
                                size="icon"
                                className="ml-auto h-8 w-8 rounded-lg"
                                onClick={() => remove(it.key)}
                                disabled={busy || loading}
                                aria-label="Remove item"
                                title="Remove"
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-4">
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
              className="mt-4 w-full rounded-2xl gap-2"
              disabled={items.length === 0 || loading}
              onClick={() => nav("/cart")}
            >
              Checkout
              <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="mt-2 text-center text-xs text-muted-foreground">
              Quantity changes by case size (min 6).
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
