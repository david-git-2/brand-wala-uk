import { useMemo } from "react";
import { useAuth } from "../auth/AuthProvider";
import { minCaseSize, useCart } from "./CartProvider";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  if (!fileId) return url;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function Spinner({ className = "" }) {
  return (
    <span
      className={[
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

export default function CartSidebar() {
  const { user } = useAuth();
  const canSeePrice = !!user?.can_see_price_gbp;

  // ✅ pull loading helpers from cart
  const { open, closeCart, items, inc, dec, remove, clear, isItemLoading, loading } = useCart();

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
    <>
      {/* Backdrop */}
      <div
        onClick={closeCart}
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      {/* Panel */}
      <aside
        className={[
          "fixed right-0 top-0 z-50 h-full w-full max-w-md transform bg-white shadow-2xl transition",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">Your Cart</div>
              <div className="text-sm text-slate-500">
                {items.length} item{items.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={clear}
                  disabled={loading}
                  className={[
                    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50",
                    loading ? "cursor-not-allowed opacity-60 hover:bg-white" : "",
                  ].join(" ")}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="h-3 w-3" />
                      Clearing…
                    </span>
                  ) : (
                    "Clear"
                  )}
                </button>
              )}
              <button
                onClick={closeCart}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-4">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
                Your cart is empty.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => {
                  const p = it.product;
                  const step = minCaseSize(p);
                  const src = toDirectGoogleImageUrl(p.imageUrl);

                  const busy = !!isItemLoading?.(it.key);

                  return (
                    <div
                      key={it.key}
                      className={[
                        "flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm",
                        busy ? "opacity-70" : "",
                      ].join(" ")}
                    >
                      <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-slate-50">
                        {src ? (
                          <img
                            src={src}
                            alt={p.name}
                            className="h-16 w-16 rounded-xl object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.src = p.imageUrl;
                            }}
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {p.brand}
                        </div>
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {p.name}
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">
                            Step: <span className="font-medium">{step}</span>
                          </div>

                          {canSeePrice ? (
                            <div className="text-sm font-semibold text-slate-900">
                              £{Number(p.price ?? 0).toFixed(2)}
                            </div>
                          ) : (
                            <div className="text-xs font-medium text-slate-400">
                              Login to see price
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => dec(it.key)}
                              disabled={busy || loading}
                              className={[
                                "h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                                busy || loading ? "cursor-not-allowed opacity-50 hover:bg-white" : "",
                              ].join(" ")}
                              title={`- ${step}`}
                            >
                              −
                            </button>

                            <div className="min-w-[80px] text-center">
                              <div className="text-sm font-semibold text-slate-900">
                                {it.qty}
                              </div>
                              <div className="text-[11px] text-slate-500">quantity</div>
                            </div>

                            <button
                              onClick={() => inc(it.key)}
                              disabled={busy || loading}
                              className={[
                                "h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                                busy || loading ? "cursor-not-allowed opacity-50 hover:bg-white" : "",
                              ].join(" ")}
                              title={`+ ${step}`}
                            >
                              +
                            </button>
                          </div>

                          <button
                            onClick={() => remove(it.key)}
                            disabled={busy || loading}
                            className={[
                              "inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100",
                              busy || loading
                                ? "cursor-not-allowed opacity-60 hover:bg-rose-50"
                                : "",
                            ].join(" ")}
                          >
                            {busy ? (
                              <>
                                <Spinner className="h-3 w-3" />
                                Removing…
                              </>
                            ) : (
                              "Remove"
                            )}
                          </button>
                        </div>

                        {canSeePrice && (
                          <div className="mt-2 text-xs text-slate-500">
                            Line total:{" "}
                            <span className="font-medium text-slate-900">
                              £{(Number(p.price ?? 0) * it.qty).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Total quantity</span>
              <span className="font-semibold text-slate-900">{totals.totalQty}</span>
            </div>

            {canSeePrice && (
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <span>Estimated total</span>
                <span className="text-base font-bold text-slate-900">
                  £{totals.totalPrice.toFixed(2)}
                </span>
              </div>
            )}

            <button
              className="mt-4 w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              disabled={items.length === 0 || loading}
              onClick={() => alert("Hook this up to your checkout / order flow")}
            >
              Checkout
            </button>

            <p className="mt-2 text-center text-xs text-slate-400">
              Quantity changes by case size (min 6).
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}