import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { getOrdersForViewer } from "@/firebase/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function OrdersSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-2 h-3 w-44" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function CustomerOrders() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.email) return;
      setLoading(true);
      setErr("");
      try {
        const list = await getOrdersForViewer({ email: user.email, role: user.role });
        if (alive) setOrders(list);
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load orders");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email, user?.role]);

  const sorted = useMemo(
    () => [...orders].sort((a, b) => String(b.order_id).localeCompare(String(a.order_id))),
    [orders],
  );

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">My Orders</h1>
        <p className="text-sm text-muted-foreground">Your submitted orders.</p>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>
      ) : null}

      {loading ? (
        <OrdersSkeleton />
      ) : sorted.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No orders yet.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sorted.map((o, idx) => (
              <div key={o.order_id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-semibold">#{idx + 1} {o.order_name || "Untitled"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{o.order_id}</div>
                  <div className="mt-1">
                    <Badge variant="secondary">{String(o.status || "submitted").toLowerCase()}</Badge>
                  </div>
                </div>
                <Button size="sm" onClick={() => nav(`/customer/orders/${o.order_id}`)}>View</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
