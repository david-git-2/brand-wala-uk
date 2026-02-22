import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { minCaseSize, useCart } from "../cart/CartProvider";
import PlaceOrderDialog from "../components/PlaceOrderDialog";
import CartSkeleton from "../components/CartSkeleton";

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

export default function Cart() {
  const { user } = useAuth();
  const canSeePrice = !!user?.can_see_price_gbp;

  const {
    items,
    remove,
    clear,
    loading,
    getItemLoadingOp,
    updateQty,     // ✅ must exist in provider now
    createOrder,   // ✅ must exist in provider now
  } = useCart();

  const [draftQtyByKey, setDraftQtyByKey] = useState({});
  const [savingKey, setSavingKey] = useState(null);

  const [placeOpen, setPlaceOpen] = useState(false);
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

      // ✅ provider will call UK_API.cartUpdateItem(email, product_id, qty)
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

      // ✅ server reads cart; status will be submitted automatically
      const res = await createOrder(orderName);

      setPlaceOpen(false);

      // Optional: clear cart UI (server might also clear)
      await clear();

      alert(`Order created: ${res?.order_id || "success"}`);
    } catch (e) {
      setOrderError(e?.message ? e.message : "Failed to create order.");
    } finally {
      setCreatingOrder(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cart</h1>
          <p className="text-sm text-slate-500">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={clear}
              disabled={loading || creatingOrder}
              className={[
                "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50",
                loading || creatingOrder ? "cursor-not-allowed opacity-60 hover:bg-white" : "",
              ].join(" ")}
            >
              {loading ? (
                <>
                  <Spinner className="h-3 w-3" />
                  Clearing…
                </>
              ) : (
                "Clear cart"
              )}
            </button>
          )}
        </div>
      </div>

      {/* ✅ Skeleton while loading */}
      {loading && items.length === 0 ? (
        <CartSkeleton rows={3} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          Your cart is empty.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const p = it.product;
            const step = minCaseSize(p);
            const src = toDirectGoogleImageUrl(p.imageUrl);

            const op = getItemLoadingOp?.(it.key);
            const busy = !!op || savingKey === it.key;

            const draftQty = getDraftQty(it);
            const dirty = isDirty(it);

            return (
              <div
                key={it.key}
                className={[
                  "flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm",
                  busy ? "opacity-70" : "",
                ].join(" ")}
              >
                <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-slate-50">
                  {src ? (
                    <img
                      src={src}
                      alt={p.name}
                      className="h-20 w-20 rounded-xl object-contain"
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
                  <div className="truncate text-base font-semibold text-slate-900">
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

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => bumpQty(it, -1)}
                        disabled={busy || loading || creatingOrder}
                        className={[
                          "h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                          busy || loading || creatingOrder
                            ? "cursor-not-allowed opacity-50 hover:bg-white"
                            : "",
                        ].join(" ")}
                        title={`- ${step}`}
                      >
                        −
                      </button>

                      <div className="min-w-[110px] text-center">
                        <div className="text-sm font-semibold text-slate-900">{draftQty}</div>
                        <div className="text-[11px] text-slate-500">
                          {savingKey === it.key ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <Spinner className="h-3 w-3" />
                              Saving…
                            </span>
                          ) : dirty ? (
                            "unsaved"
                          ) : (
                            "quantity"
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => bumpQty(it, +1)}
                        disabled={busy || loading || creatingOrder}
                        className={[
                          "h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                          busy || loading || creatingOrder
                            ? "cursor-not-allowed opacity-50 hover:bg-white"
                            : "",
                        ].join(" ")}
                        title={`+ ${step}`}
                      >
                        +
                      </button>

                      {dirty && (
                        <button
                          onClick={() => onSaveQty(it)}
                          disabled={busy || loading || creatingOrder}
                          className={[
                            "ml-2 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700",
                            busy || loading || creatingOrder
                              ? "cursor-not-allowed opacity-60 hover:bg-emerald-600"
                              : "",
                          ].join(" ")}
                        >
                          {savingKey === it.key ? (
                            <>
                              <Spinner className="h-3 w-3" />
                              Save
                            </>
                          ) : (
                            "Save"
                          )}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => remove(it.key)}
                      disabled={busy || loading || creatingOrder}
                      className={[
                        "inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100",
                        busy || loading || creatingOrder
                          ? "cursor-not-allowed opacity-60 hover:bg-rose-50"
                          : "",
                      ].join(" ")}
                    >
                      {op === "remove" ? (
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
                        £{(Number(p.price ?? 0) * draftQty).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Totals */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
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
          disabled={items.length === 0 || loading || creatingOrder || anyDirty}
          onClick={() => setPlaceOpen(true)}
          title={anyDirty ? "Save quantity changes before placing order" : "Place order"}
        >
          {creatingOrder ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner className="h-4 w-4" />
              Creating order…
            </span>
          ) : (
            "Place order"
          )}
        </button>

        {anyDirty && (
          <p className="mt-2 text-center text-xs text-amber-600">
            Please save your quantity changes before placing the order.
          </p>
        )}

        <p className="mt-2 text-center text-xs text-slate-400">
          Quantity changes by case size (min 6).
        </p>
      </div>

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
    </div>
  );
}