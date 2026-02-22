import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";

import ShipmentDialog from "../../components/shipments/ShipmentDialog";
import ConfirmDeleteDialog from "../../components/common/ConfirmDeleteDialog";

function ShipmentsSkeleton({ rows = 8 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-64 bg-slate-100 animate-pulse rounded" />
              <div className="h-3 w-52 bg-slate-100 animate-pulse rounded" />
            </div>
            <div className="h-8 w-28 bg-slate-100 animate-pulse rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminShipments() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create"); // create | edit
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
          <h1 className="text-2xl font-bold text-slate-900">Shipments</h1>
          <p className="text-sm text-slate-500">Admin-only shipment setup (rates and cargo).</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/admin/orders")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Orders
          </button>

          <button
            onClick={openCreate}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + Add shipment
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <ShipmentsSkeleton />
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          No shipments yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Shipment</th>
                  <th className="px-4 py-3 font-semibold">Rates</th>
                  <th className="px-4 py-3 font-semibold">Cargo</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {sorted.map((s) => (
                  <tr key={s.shipment_id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{s.name || "—"}</div>
                      <div className="text-xs text-slate-500">{s.shipment_id}</div>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div>avg: {Number(s.gbp_avg_rate || 0)}</div>
                      <div>product: {Number(s.gbp_rate_product || 0)}</div>
                      <div>cargo: {Number(s.gbp_rate_cargo || 0)}</div>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div>cost/kg: {Number(s.cargo_cost_per_kg || 0)}</div>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      {s.updated_at || "—"}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => openDelete(s)}
                          className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit dialog */}
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

      {/* Confirm delete */}
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