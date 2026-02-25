import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { shipmentService } from "@/services/shipments/shipmentService";
import { getShipmentCapabilities } from "@/domain/status/policy";

import ConfirmDeleteDialog from "../../components/common/ConfirmDeleteDialog";
import ShipmentDialog from "../../components/shipments/ShipmentDialog";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban } from "lucide-react";

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

function tsMs(v) {
  if (!v) return 0;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

function formatTs(v) {
  const ms = tsMs(v);
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
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

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  async function load() {
    if (!user?.email) return;
    setLoading(true);
    setErr("");
    try {
      const data = await shipmentService.listShipments();
      setShipments(Array.isArray(data) ? data : []);
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
    copy.sort((a, b) => tsMs(b.created_at) - tsMs(a.created_at));
    return copy;
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

  function openCancel(s) {
    setCancelTarget(s);
    setCancelError("");
    setCancelOpen(true);
  }

  async function handleSubmit(payload) {
    if (!user?.email) return;

    setSaving(true);
    setDialogError("");
    try {
      const mappedPayload = {
        name: payload.name,
        gbp_avg_rate: payload.gbp_avg_rate,
        gbp_rate_product: payload.gbp_rate_product,
        gbp_rate_cargo: payload.gbp_rate_cargo,
        cargo_cost_per_kg: payload.cargo_cost_per_kg,
      };

      if (dialogMode === "edit") {
        const shipment_id = editing?.shipment_id;
        await shipmentService.updateShipment(shipment_id, mappedPayload);
      } else {
        await shipmentService.createShipment(mappedPayload);
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

  async function handleCancelShipment() {
    if (!user?.email || !cancelTarget?.shipment_id) return;

    setCancelling(true);
    setCancelError("");
    try {
      await shipmentService.removeShipment(cancelTarget.shipment_id, {
        role: user?.role || "admin",
        email: user?.email || "",
      });
      setCancelOpen(false);
      setCancelTarget(null);
      await load();
    } catch (e) {
      setCancelError(e?.message || "Failed to cancel shipment");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
          <p className="text-sm text-muted-foreground">Admin-only shipment setup.</p>
        </div>

        <div className="flex items-center gap-2">
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
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Avg Rate</th>
                    <th className="px-4 py-3 font-medium">Cargo / KG</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {sorted.map((s) => {
                    const cap = getShipmentCapabilities({ role: "admin", status: s.status });
                    return (
                      <tr key={s.shipment_id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{s.name || "-"}</div>
                          <div className="text-xs text-muted-foreground">{s.shipment_id}</div>
                        </td>

                        <td className="px-4 py-3 text-xs">
                          {s.status ? <Badge variant="secondary">{s.status}</Badge> : <span className="text-muted-foreground">-</span>}
                        </td>

                        <td className="px-4 py-3 text-xs text-muted-foreground">{Number(s.gbp_rate_avg_bdt || 0)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{Number(s.cargo_cost_per_kg_gbp || 0)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatTs(s.updated_at)}</td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/shipments/${s.shipment_id}`)}>
                              View
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEdit(s)} disabled={!cap.canEdit}>
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openCancel(s)}
                              title="Cancel shipment"
                              aria-label="Cancel shipment"
                              disabled={!cap.canSoftClose}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
        open={cancelOpen}
        loading={cancelling}
        error={cancelError}
        title="Cancel shipment"
        description={
          cancelTarget
            ? `Cancel "${cancelTarget.name}" (${cancelTarget.shipment_id})? Cancelled shipments are locked.`
            : "Cancel this shipment?"
        }
        confirmText={<Ban className="h-4 w-4" />}
        onClose={() => {
          if (!cancelling) setCancelOpen(false);
        }}
        onConfirm={handleCancelShipment}
      />
    </div>
  );
}
