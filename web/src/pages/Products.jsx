// ============================
// src/pages/Products.jsx  (SHADCN + THEME COLORS)
// ============================

import { useEffect, useMemo, useState } from "react";
import ProductCard from "../components/ProductCard";

// shadcn/ui
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

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
    <Card className="overflow-hidden rounded-2xl">
      <div className="h-40 bg-muted">
        <Skeleton className="h-full w-full" />
      </div>
      <CardContent className="p-4">
        <Skeleton className="h-3 w-20" />

        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>

        <div className="mt-4 space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </CardContent>
    </Card>
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
        const res = await fetch(
          `${import.meta.env.BASE_URL}data/pc_data.json`,
          {
            cache: "no-store",
          },
        );
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Filters */}
        <Card className="mb-6 rounded-2xl">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              {/* Left side */}
              <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                {/* Search */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Search
                  </label>
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, brand, barcode, code, or product id..."
                    className="rounded-xl"
                  />
                </div>

                {/* Brand */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Brand
                  </label>

                  <Select value={brand} onValueChange={setBrand}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b === "ALL" ? "All brands" : b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right side: counts + clear */}
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {loading ? "—" : showingCount}
                  </span>{" "}
                  showing <span className="opacity-60">/</span>{" "}
                  <span className="font-medium text-foreground">
                    {loading ? "—" : totalCount}
                  </span>{" "}
                  total
                </div>

                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setQ("");
                    setBrand("ALL");
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Quick brand pills */}
            {!loading && (
              <>
                <Separator className="my-4" />
                <div className="flex flex-wrap gap-2">
                  {brands.slice(0, 12).map((b) => (
                    <Button
                      key={b}
                      type="button"
                      variant={brand === b ? "default" : "secondary"}
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => setBrand(b)}
                    >
                      {b === "ALL" ? "All" : b}
                    </Button>
                  ))}

                  {brands.length > 12 && (
                    <Badge variant="secondary" className="self-center">
                      +{brands.length - 12} more in dropdown
                    </Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Grid */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
              {filtered.map((p) => (
                <ProductCard key={buildProductId(p)} product={p} />
              ))}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <Card className="mt-10 rounded-2xl">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No products match your filters.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
