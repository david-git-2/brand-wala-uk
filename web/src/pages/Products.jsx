// ============================
// src/pages/Products.jsx  (UPDATED)
// - Removed header user + logout (now in NavBar)
// - Added skeleton loading state
// ============================

import { useEffect, useMemo, useState } from "react";
import ProductCard from "../components/ProductCard";

function buildProductId(p) {
  const pid = String(p?.product_id || p?.productId || "").trim();
  if (pid) return pid;

  const code = String(p?.product_code || p?.productCode || "").trim();
  const bc = String(p?.barcode || "").trim();
  if (code && bc) return `${code}_${bc}`;

  return String(p?._rowNumber || "").trim();
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-40 bg-slate-100 animate-pulse" />
      <div className="p-4">
        <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-slate-100 animate-pulse" />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="h-6 w-16 rounded bg-slate-100 animate-pulse" />
          <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="h-8 w-28 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-8 w-24 rounded-xl bg-slate-100 animate-pulse" />
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-3 w-40 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-28 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("ALL");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/pc_data.json`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive) return;
        setProducts(json.products || []);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // Build brand list from data
  const brands = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const b = String(p?.brand || "").trim();
      if (b) set.add(b);
    }
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  // Apply filters
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return products.filter((p) => {
      if (brand !== "ALL") {
        const pb = String(p?.brand || "").trim();
        if (pb !== brand) return false;
      }

      if (!needle) return true;

      const name = String(p?.name || "").toLowerCase();
      const br = String(p?.brand || "").toLowerCase();
      const bc = String(p?.barcode || "").toLowerCase();
      const code = String(p?.product_code || "").toLowerCase();
      const pid = String(p?.product_id || "").toLowerCase();

      return (
        name.includes(needle) ||
        br.includes(needle) ||
        bc.includes(needle) ||
        code.includes(needle) ||
        pid.includes(needle)
      );
    });
  }, [products, brand, q]);

  const totalCount = products.length;
  const showingCount = filtered.length;

  const skeletonCount = 20;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Filters (keep visible even while loading) */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            {/* Left side */}
            <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
              {/* Search */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Search
                </label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, brand, barcode, code, or product id..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Brand
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  {brands.map((b) => (
                    <option key={b} value={b}>
                      {b === "ALL" ? "All brands" : b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right side: counts + clear */}
            <div className="flex items-center justify-between gap-3 md:justify-end">
              <div className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">
                  {loading ? "—" : showingCount}
                </span>{" "}
                showing{" "}
                <span className="text-slate-400">/</span>{" "}
                <span className="font-medium text-slate-900">
                  {loading ? "—" : totalCount}
                </span>{" "}
                total
              </div>

              <button
                onClick={() => {
                  setQ("");
                  setBrand("ALL");
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Quick brand pills */}
          {!loading && (
            <div className="mt-4 flex flex-wrap gap-2">
              {brands.slice(0, 12).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    brand === b
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {b === "ALL" ? "All" : b}
                </button>
              ))}
              {brands.length > 12 && (
                <span className="self-center text-xs text-slate-400">
                  +{brands.length - 12} more in dropdown
                </span>
              )}
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((p) => (
                <ProductCard key={buildProductId(p)} product={p} />
              ))}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
                No products match your filters.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}