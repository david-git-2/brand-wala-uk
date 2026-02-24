import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  deleteOrderAdmin,
  getAllowedNextOrderStatuses,
  getOrdersForViewer,
  updateOrderStatus,
} from "@/firebase/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function OrdersSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <Skeleton className="h-4 w-72" />
            <Skeleton className="mt-2 h-3 w-52" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function gbp(v) {
  return `£${(Number(v) || 0).toFixed(2)}`;
}

export default function AdminOrders() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]);
  const [statusDraft, setStatusDraft] = useState({});
  const [statusSaving, setStatusSaving] = useState({});
  const [deleteSaving, setDeleteSaving] = useState({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

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

  useEffect(() => {
    setStatusDraft((prev) => {
      const next = { ...prev };
      for (const o of orders) {
        const id = String(o.order_id || "");
        if (!id) continue;
        if (!next[id]) next[id] = String(o.status || "submitted").toLowerCase();
      }
      return next;
    });
  }, [orders]);

  async function saveRowStatus(orderId) {
    const id = String(orderId || "");
    if (!id) return;
    const row = orders.find((o) => String(o.order_id) === id);
    if (!row) return;
    const current = String(row.status || "submitted").toLowerCase();
    const target = String(statusDraft[id] || "").toLowerCase();
    if (!target || target === current) return;
    setStatusSaving((p) => ({ ...p, [id]: true }));
    setErr("");
    try {
      await updateOrderStatus({ order_id: id, status: target });
      setOrders((prev) =>
        prev.map((o) => (String(o.order_id) === id ? { ...o, status: target } : o)),
      );
    } catch (e) {
      setErr(e?.message || "Failed to update status");
    } finally {
      setStatusSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  async function deleteCancelledOrder(order) {
    const id = String(order?.order_id || "");
    if (!id) return;
    const status = String(order?.status || "").toLowerCase();
    if (status !== "cancelled") return;

    setDeleteSaving((p) => ({ ...p, [id]: true }));
    setErr("");
    try {
      await deleteOrderAdmin({ order_id: id });
      setOrders((prev) => prev.filter((o) => String(o.order_id) !== id));
      setStatusDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e) {
      setErr(e?.message || "Failed to delete order");
    } finally {
      setDeleteSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  function openDelete(order) {
    setDeleteTarget(order || null);
    setDeleteConfirmName("");
    setDeleteOpen(true);
  }

  const sorted = useMemo(
    () => [...orders].sort((a, b) => String(b.order_id).localeCompare(String(a.order_id))),
    [orders],
  );

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">Admin order list with purchase totals.</p>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>
      ) : null}

      {loading ? (
        <OrdersSkeleton />
      ) : sorted.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No orders found.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sorted.map((o, idx) => (
              <div key={o.order_id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">#{idx + 1} {o.order_name || "Untitled"}</div>
                    <Badge variant="secondary">{o.status || "submitted"}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{o.order_id} • {o.creator_email}</div>
                  <div className="mt-1 text-xs">
                    Qty {Math.round(Number(o.total_order_qty || 0))} • Purchase Value {gbp(o.total_purchase_value_gbp)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(statusDraft[o.order_id] || o.status || "submitted").toLowerCase()}
                    onValueChange={(v) =>
                      setStatusDraft((p) => ({ ...p, [o.order_id]: String(v || "").toLowerCase() }))
                    }
                  >
                    <SelectTrigger className="h-8 w-[170px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAllowedNextOrderStatuses(String(o.status || "").toLowerCase(), {
                        role: "admin",
                        includeCurrent: true,
                      }).map((s) => (
                        <SelectItem key={`${o.order_id}-${s}`} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveRowStatus(o.order_id)}
                    disabled={
                      !!statusSaving[o.order_id] ||
                      String(statusDraft[o.order_id] || o.status || "").toLowerCase() ===
                        String(o.status || "").toLowerCase()
                    }
                  >
                    {statusSaving[o.order_id] ? "Saving..." : "Update"}
                  </Button>
                  {String(o.status || "").toLowerCase() === "cancelled" ? (
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => openDelete(o)}
                      disabled={!!deleteSaving[o.order_id]}
                      title="Delete cancelled order"
                      aria-label="Delete cancelled order"
                    >
                      {deleteSaving[o.order_id] ? "..." : <Trash2 className="h-4 w-4" />}
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => nav(`/admin/orders/${o.order_id}`)}>View</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next && !deleteSaving[String(deleteTarget?.order_id || "")]) {
            setDeleteOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete cancelled order?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Type "${deleteTarget.order_name || "Untitled"}" to permanently delete this order.`
                : "Type the order name to confirm deletion."}
            </DialogDescription>
          </DialogHeader>

          <Input
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={String(deleteTarget?.order_name || "")}
            disabled={!!deleteSaving[String(deleteTarget?.order_id || "")]}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={!!deleteSaving[String(deleteTarget?.order_id || "")]}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !!deleteSaving[String(deleteTarget?.order_id || "")] ||
                String(deleteConfirmName || "").trim() !== String(deleteTarget?.order_name || "").trim()
              }
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteCancelledOrder(deleteTarget);
                setDeleteOpen(false);
                setDeleteTarget(null);
                setDeleteConfirmName("");
              }}
            >
              {deleteSaving[String(deleteTarget?.order_id || "")] ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
