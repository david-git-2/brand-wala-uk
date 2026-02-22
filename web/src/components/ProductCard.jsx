// ============================
// src/components/ProductCard.jsx  (UPDATED - correct Adding/Removing loading)
// ============================

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCart, minCaseSize } from "../cart/CartProvider";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";

  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];

  if (!fileId) return url;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function CartPlusIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6h15l-2 8H8L6 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6 6 5 3H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  const canSeePrice = !!user?.can_see_price_gbp;

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
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex h-40 items-center justify-center bg-slate-50">
        {src ? (
          <img
            src={src}
            alt={productWithId.name}
            className="max-h-32 object-contain transition duration-300 group-hover:scale-105"
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
          <div className="text-sm text-slate-400">No image</div>
        )}
      </div>

      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {productWithId.brand}
        </div>

        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
          {productWithId.name}
        </h3>

        <div className="mt-3 flex items-center justify-between">
          {canSeePrice ? (
            <span className="text-lg font-bold text-slate-900">
              £{Number(productWithId.price ?? 0).toFixed(2)}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-400">Login to see price</span>
          )}

          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
            Case {step}
          </span>
        </div>

        {!inCart ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-white">
              <button
                onClick={decLocal}
                disabled={busy}
                className="h-8 w-8 rounded-l-xl text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                title={`- ${step}`}
                aria-label="Decrease quantity"
              >
                −
              </button>

              <div className="min-w-[54px] px-2 text-center text-sm font-semibold text-slate-900">
                {qty}
              </div>

              <button
                onClick={incLocal}
                disabled={busy}
                className="h-8 w-8 rounded-r-xl text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                title={`+ ${step}`}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              onClick={() => add(productWithId, qty)}
              disabled={disableAdd}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              title={key ? "Add to cart" : "Missing product_id"}
            >
              {op === "add" ? <Spinner /> : <CartPlusIcon className="h-4 w-4" />}
              {op === "add" ? "Adding..." : "Add"}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => remove(key)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100 disabled:opacity-60"
              title="Remove from cart"
            >
              {op === "remove" ? <Spinner /> : null}
              {op === "remove" ? "Removing..." : "Remove"}
            </button>
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          <div>Product ID: {productWithId.product_id || "—"}</div>
          <div>Barcode: {productWithId.barcode}</div>
          <div>Origin: {productWithId.country_of_origin}</div>
        </div>
      </div>
    </div>
  );
}