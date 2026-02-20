import { useAuth } from "../auth/AuthProvider";

function toDirectGoogleImageUrl(url) {
  if (!url) return "";

  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];

  if (!fileId) return url;

  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

export default function ProductCard({ product }) {
  const { user } = useAuth(); // 👈 access auth

  const src = toDirectGoogleImageUrl(product.imageUrl);
  const displayCaseSize = Math.max(6, Number(product.case_size || 0));

  const canSeePrice = !!user?.can_see_price_gbp;

  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      
      {/* Image */}
      <div className="h-40 bg-slate-50 flex items-center justify-center">
        {src ? (
          <img
            src={src}
            alt={product.name}
            className="max-h-32 object-contain transition duration-300 group-hover:scale-105"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              if (e.currentTarget.dataset.fallbackTried !== "1") {
                e.currentTarget.dataset.fallbackTried = "1";
                e.currentTarget.src = product.imageUrl;
                return;
              }
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="text-sm text-slate-400">No image</div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {product.brand}
        </div>

        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
          {product.name}
        </h3>

        <div className="mt-3 flex items-center justify-between">
          
          {/* 👇 Conditional Price */}
          {canSeePrice ? (
            <span className="text-lg font-bold text-slate-900">
              £{Number(product.price ?? 0).toFixed(2)}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-400">
              Login to see price
            </span>
          )}

          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
            Case {displayCaseSize}
          </span>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          <div>Barcode: {product.barcode}</div>
          <div>Origin: {product.country_of_origin}</div>
        </div>
      </div>
    </div>
  );
}