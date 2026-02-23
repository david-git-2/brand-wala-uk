import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";

import ConfirmDeleteDialog from "../../components/common/ConfirmDeleteDialog";
import ShipmentDialog from "../../components/shipments/ShipmentDialog";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ShipmentsSkeleton({ rows = 8 }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminShipments() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [editing, setEditing] = useState(null);

  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    if (!user?.email) return;
    setLoading(true);
    setErr("");
    try {
      const data = await UK_API.shipmentGetAll(user.email);
      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch (e) {
      setErr(e?.message || "Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const sorted = useMemo(() => {
    const copy = [...shipments];
    const hasCreated = copy.some((s) => s.created_at);
    if (hasCreated) {
      copy.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      return copy;
    }
    return copy.reverse();
  }, [shipments]);

  function openCreate() {
    setDialogMode("create");
    setEditing(null);
    setDialogError("");
    setDialogOpen(true);
  }

  function openEdit(s) {
    setDialogMode("edit");
    setEditing(s);
    setDialogError("");
    setDialogOpen(true);
  }

  function openDelete(s) {
    setDeleteTarget(s);
    setDeleteError("");
    setDeleteOpen(true);
  }

  async function handleSubmit(payload) {
    if (!user?.email) return;

    setSaving(true);
    setDialogError("");
    try {
      if (dialogMode === "edit") {
        const shipment_id = editing?.shipment_id;
        await UK_API.shipmentUpdate(user.email, shipment_id, payload);
      } else {
        await UK_API.shipmentCreate(user.email, payload);
      }

      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setDialogError(e?.message || "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user?.email || !deleteTarget?.shipment_id) return;

    setDeleting(true);
    setDeleteError("");
    try {
      await UK_API.shipmentDelete(user.email, deleteTarget.shipment_id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setDeleteError(e?.message || "Failed to delete shipment");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
          <p className="text-sm text-muted-foreground">Admin-only shipment setup (rates and cargo).</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/orders")}>
            Orders
          </Button>
          <Button onClick={openCreate}>Add Shipment</Button>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      ) : null}

      {loading ? (
        <ShipmentsSkeleton />
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No shipments yet.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All Shipments</CardTitle>
          </CardHeader>

          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Shipment</th>
                    <th className="px-4 py-3 font-medium">Rates</th>
                    <th className="px-4 py-3 font-medium">Cargo</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {sorted.map((s) => (
                    <tr key={s.shipment_id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{s.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{s.shipment_id}</div>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>avg: {Number(s.gbp_avg_rate || 0)}</div>
                        <div>product: {Number(s.gbp_rate_product || 0)}</div>
                        <div>cargo: {Number(s.gbp_rate_cargo || 0)}</div>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>cost/kg: {Number(s.cargo_cost_per_kg || 0)}</div>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.updated_at || "-"}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {s.status ? <Badge variant="secondary">{s.status}</Badge> : null}
                          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/shipments/${s.shipment_id}`)}>
                            View
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/shipments/${s.shipment_id}/weights`)}>
                            Weights
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                            Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => openDelete(s)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ShipmentDialog
        open={dialogOpen}
        mode={dialogMode}
        initial={editing}
        loading={saving}
        error={dialogError}
        onClose={() => {
          if (!saving) setDialogOpen(false);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        loading={deleting}
        error={deleteError}
        title="Delete shipment"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}" (${deleteTarget.shipment_id})?`
            : "Delete this shipment?"
        }
        confirmText="Delete"
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
