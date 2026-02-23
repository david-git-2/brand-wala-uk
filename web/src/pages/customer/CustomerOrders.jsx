import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function OrdersSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "delivered") return "default";
  if (s === "cancelled") return "destructive";
  return "secondary";
}

function intish(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export default function CustomerOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email) return;
      setLoading(true);
      setErr("");
      try {
        const data = await UK_API.getOrders(user.email);
        if (!alive) return;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load orders");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const sorted = useMemo(() => {
    const next = [...orders];
    next.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return next;
  }, [orders]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">My Orders</h1>
        <p className="text-sm text-muted-foreground">Submitted, priced, and delivery progress.</p>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      ) : null}

      {loading ? (
        <OrdersSkeleton />
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No orders yet.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sorted.map((o) => (
              <div key={o.order_id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">#{o.order_sl || "-"} • {o.order_name || "Untitled"}</div>
                    <Badge variant={statusTone(o.status)}>{o.status || "-"}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {o.order_id} • Qty {intish(o.total_order_qty)} • Shipped {intish(o.total_shipped_qty)} • Remaining {intish(o.total_remaining_qty)} • Total Cost (BDT) {intish(o.total_total_cost_bdt)}
                  </div>
                </div>

                <Button size="sm" onClick={() => navigate(`/customer/orders/${o.order_id}`)}>
                  View
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
