import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import ProductCard from "../components/ProductCard";

export default function Products() {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("ALL");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/pc_data.json`);
        const json = await res.json();
        setProducts(json.products || []);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
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
      // Brand filter
      if (brand !== "ALL") {
        const pb = String(p?.brand || "").trim();
        if (pb !== brand) return false;
      }

      // Search filter (name / brand / barcode)
      if (!needle) return true;

      const name = String(p?.name || "").toLowerCase();
      const br = String(p?.brand || "").toLowerCase();
      const bc = String(p?.barcode || "").toLowerCase();

      return name.includes(needle) || br.includes(needle) || bc.includes(needle);
    });
  }, [products, brand, q]);

  const totalCount = products.length;
  const showingCount = filtered.length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Products</h1>
            <p className="text-sm text-slate-500">
              Logged in as <span className="font-medium">{user?.email}</span>
            </p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {loading ? (
          <div className="text-slate-600">Loading products...</div>
        ) : (
          <>
            {/* Filters */}
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
                      placeholder="Search name, brand, or barcode..."
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
                    <span className="font-medium text-slate-900">{showingCount}</span>{" "}
                    showing{" "}
                    <span className="text-slate-400">/</span>{" "}
                    <span className="font-medium text-slate-900">{totalCount}</span>{" "}
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

              {/* Optional: quick brand pills (nice UX) */}
              <div className="mt-4 flex flex-wrap gap-2">
                {brands.slice(0, 12).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBrand(b)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      brand === b
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
            </div>

            {/* Grid */}
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((p) => (
                <ProductCard key={p.barcode || p._rowNumber} product={p} />
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