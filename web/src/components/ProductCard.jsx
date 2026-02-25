// ============================
// src/components/ProductCard.jsx  (SHADCN + THEME COLORS)
// ============================

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCart, minCaseSize } from "../cart/CartProvider";

// shadcn/ui
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// icons
import {
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  ImageOff,
} from "lucide-react";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  if (!fileId) return url;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// optional: if you don't already have cn() from shadcn utils
// (shadcn init usually creates src/lib/utils.js)
import { cn } from "@/lib/utils";

function buildProductId(p) {
  const pid = String(p?.product_id || p?.productId || "").trim();
  if (pid) return pid;

  const code = String(p?.product_code || p?.productCode || "").trim();
  const bc = String(p?.barcode || "").trim();
  if (code && bc) return `${code}_${bc}`;

  return "";
}

export default function ProductCard({ product }) {
  const { user } = useAuth();
  const role = String(user?.role || "customer").toLowerCase();
  const canSeePrice = !!user?.can_see_price_gbp;
  const canUseCart = !!user?.can_use_cart && role !== "customer";

  const { add, remove, isInCart, getKey, getItemLoadingOp } = useCart();

  const productWithId = useMemo(() => {
    const product_id = buildProductId(product);
    return product_id ? { ...product, product_id } : product;
  }, [product]);

  const src = toDirectGoogleImageUrl(productWithId.imageUrl);
  const step = minCaseSize(productWithId);

  const key = getKey(productWithId);
  const inCart = isInCart(productWithId);

  const op = getItemLoadingOp?.(key); // "add" | "remove" | "update" | null
  const busy = !!op;

  const [qty, setQty] = useState(step);

  useEffect(() => {
    setQty(step);
  }, [step, key]);

  const decLocal = () => setQty((q) => Math.max(step, q - step));
  const incLocal = () => setQty((q) => q + step);

  const disableAdd = busy || !key;

  return (
    <Card className="group overflow-hidden rounded-2xl border-border bg-card shadow-sm transition hover:shadow-md">
      {/* Image */}
      <div className="flex h-48 items-center justify-center bg-white p-2">
        {src ? (
          <img
            src={src}
            alt={productWithId.name}
            className="h-[88%] w-[88%] object-contain transition duration-300 group-hover:scale-105"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              if (e.currentTarget.dataset.fallbackTried !== "1") {
                e.currentTarget.dataset.fallbackTried = "1";
                e.currentTarget.src = productWithId.imageUrl;
                return;
              }
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageOff className="h-4 w-4" />
            <span>No image</span>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        {/* Brand */}
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {productWithId.brand}
        </div>

        {/* Name */}
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
          {productWithId.name}
        </h3>

        {/* Price + Case */}
        <div className="mt-3 flex items-center justify-between">
          {canSeePrice ? (
            <span className="text-lg font-bold text-foreground">
              £{Number(productWithId.price ?? 0).toFixed(2)}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              Login to see price
            </span>
          )}

          <Badge variant="secondary" className="rounded-full">
            Case {step}
          </Badge>
        </div>

        {/* Actions */}
        {!canUseCart ? (
          <div className="mt-4 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {role === "customer" ? "Ordering is disabled for customer for now." : "Cart is disabled for your account."}
          </div>
        ) : !inCart ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            {/* Quantity stepper */}
            <div className="flex items-center rounded-xl border border-input bg-background">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={decLocal}
                disabled={busy}
                className="h-9 w-9 rounded-l-xl"
                title={`- ${step}`}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </Button>

              <div className="min-w-[56px] px-2 text-center text-sm font-semibold text-foreground">
                {qty}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={incLocal}
                disabled={busy}
                className="h-9 w-9 rounded-r-xl"
                title={`+ ${step}`}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Add */}
            <Button
              type="button"
              onClick={() => add(productWithId, qty)}
              disabled={disableAdd}
              className={cn("rounded-xl", "gap-2")}
              title={key ? "Add to cart" : "Missing product_id"}
            >
              {op === "add" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              {op === "add" ? "Adding..." : "Add"}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="destructive"
              onClick={() => remove(key)}
              disabled={busy}
              className="rounded-xl gap-2"
              title="Remove from cart"
            >
              {op === "remove" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {op === "remove" ? "Removing..." : "Remove"}
            </Button>
          </div>
        )}

        <Separator className="my-3" />

        {/* Meta */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>Product ID: {productWithId.product_id || "—"}</div>
          <div>Barcode: {productWithId.barcode || "—"}</div>
          <div>Origin: {productWithId.country_of_origin || "—"}</div>
        </div>
      </CardContent>
    </Card>
  );
}
