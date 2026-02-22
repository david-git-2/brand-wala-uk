import { useCart } from "./CartProvider";

function CartIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6h15l-2 8H8L6 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6 6 5 3H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" />
      <path d="M8 14h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function CartFab() {
  const { toggleCart, distinctCount } = useCart();

  return (
    <button
      onClick={toggleCart}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-white shadow-lg transition hover:bg-slate-800"
      aria-label="Open cart"
    >
      <div className="relative">
        <CartIcon className="h-5 w-5" />
        {distinctCount > 0 && (
          <span className="absolute -right-2 -top-2 grid h-5 min-w-[20px] place-items-center rounded-full bg-white px-1 text-xs font-bold text-slate-900">
            {distinctCount}
          </span>
        )}
      </div>
      <span className="text-sm font-medium">Cart</span>
    </button>
  );
}