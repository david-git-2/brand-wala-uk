import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { UK_API } from "../../api/ukApi";
import { useAuth } from "../../auth/AuthProvider";
import ConfirmDeleteDialog from "../../components/common/ConfirmDeleteDialog";

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="h-5 w-56 rounded bg-slate-100 animate-pulse" />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
        <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
        <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
        <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
      </div>
    </div>
  );
}

function Spinner({ className = "" }) {
  return (
    <span
      className={[
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

export default function AdminShipmentDetails() {
  const { shipmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const email = user?.email || "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [shipment, setShipment] = useState(null);

  const [orderIds, setOrderIds] = useState([]); // linked order ids from mapping table
  const [ordersAll, setOrdersAll] = useState([]); // admin orders list (for details + select options)

  // add orders UI
  const [selectedToAdd, setSelectedToAdd] = useState([]); // order_ids
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  // remove confirm
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null); // { order_id }
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");

  async function loadAll() {
    if (!email || !shipmentId) return;

    setLoading(true);
    setErr("");
    try {
      const [s, links, o] = await Promise.all([
        UK_API.shipmentGetOne(email, shipmentId),
        UK_API.shipmentGetOrders(email, shipmentId),
        UK_API.getOrders(email), // admin gets all columns
      ]);

      setShipment(s?.shipment || null);
      setOrderIds(Array.isArray(links?.order_ids) ? links.order_ids : []);
      setOrdersAll(Array.isArray(o?.orders) ? o.orders : []);
    } catch (e) {
      setErr(e?.message || "Failed to load shipment details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, shipmentId]);

  const orderIdsSet = useMemo(() => new Set(orderIds.map((x) => String(x || "").trim())), [orderIds]);

  const linkedOrders = useMemo(() => {
    // map order_ids to order objects if we have them; else fallback
    const map = new Map();
    for (const o of ordersAll) map.set(String(o.order_id || "").trim(), o);

    const out = [];
    for (const id of orderIds) {
      const oid = String(id || "").trim();
      if (!oid) continue;
      out.push(map.get(oid) || { order_id: oid });
    }

    // sort by created_at desc if available
    out.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return out;
  }, [orderIds, ordersAll]);

  const availableToAdd = useMemo(() => {
    // allow adding orders that are not already linked
    return ordersAll
      .filter((o) => {
        const oid = String(o.order_id || "").trim();
        if (!oid) return false;
        return !orderIdsSet.has(oid);
      })
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [ordersAll, orderIdsSet]);

  async function onAddOrders() {
    const ids = selectedToAdd.map((x) => String(x || "").trim()).filter(Boolean);
    if (!ids.length) return;

    setAdding(true);
    setAddErr("");
    try {
      await UK_API.shipmentAddOrders(email, shipmentId, ids);
      setSelectedToAdd([]);
      await loadAll();
    } catch (e) {
      setAddErr(e?.message || "Failed to add orders");
    } finally {
      setAdding(false);
    }
  }

  function openRemove(order_id) {
    setRemoveTarget({ order_id });
    setRemoveErr("");
    setRemoveOpen(true);
  }

  async function onConfirmRemove() {
    const oid = String(removeTarget?.order_id || "").trim();
    if (!oid) return;

    setRemoving(true);
    setRemoveErr("");
    try {
      await UK_API.shipmentRemoveOrders(email, shipmentId, [oid]);
      setRemoveOpen(false);
      setRemoveTarget(null);
      await loadAll();
    } catch (e) {
      setRemoveErr(e?.message || "Failed to remove order");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate("/admin/shipments")}
            className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            ← Back to shipments
          </button>

          <h1 className="text-2xl font-bold text-slate-900">Shipment details</h1>
          <p className="text-sm text-slate-500">{shipmentId}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/admin/orders")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Orders
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <SkeletonCard />
      ) : shipment ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-lg font-semibold text-slate-900">{shipment.name}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-500">GBP avg rate</div>
              <div className="mt-1 font-semibold">{Number(shipment.gbp_avg_rate || 0)}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-500">Cargo cost / kg</div>
              <div className="mt-1 font-semibold">{Number(shipment.cargo_cost_per_kg || 0)}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-500">GBP rate (product)</div>
              <div className="mt-1 font-semibold">{Number(shipment.gbp_rate_product || 0)}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-500">GBP rate (cargo)</div>
              <div className="mt-1 font-semibold">{Number(shipment.gbp_rate_cargo || 0)}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Created: {shipment.created_at || "—"} • Updated: {shipment.updated_at || "—"}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          Shipment not found.
        </div>
      )}

      {/* Add orders to shipment */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Orders in this shipment</div>
            <div className="text-sm text-slate-500">{linkedOrders.length} order(s)</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Add orders (multi-select)
            </label>

            <select
              multiple
              value={selectedToAdd}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                setSelectedToAdd(opts);
              }}
              className="mt-2 h-44 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              disabled={adding || !availableToAdd.length}
            >
              {availableToAdd.length === 0 ? (
                <option value="" disabled>
                  All orders are already linked (or no orders exist)
                </option>
              ) : (
                availableToAdd.map((o) => (
                  <option key={o.order_id} value={o.order_id}>
                    {o.order_name || "Untitled"} • {o.order_id} • {o.status || "—"}
                  </option>
                ))
              )}
            </select>

            {addErr ? (
              <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {addErr}
              </div>
            ) : null}
          </div>

          <button
            onClick={onAddOrders}
            disabled={adding || selectedToAdd.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {adding ? (
              <>
                <Spinner className="h-4 w-4" />
                Adding…
              </>
            ) : (
              "Add selected"
            )}
          </button>
        </div>
      </div>

      {/* Linked orders list */}
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? null : linkedOrders.length === 0 ? (
          <div className="p-6 text-slate-600">No orders linked to this shipment yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Creator</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Qty</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {linkedOrders.map((o) => {
                  const oid = String(o.order_id || "").trim();
                  return (
                    <tr key={oid} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{o.order_name || "Untitled"}</div>
                        <div className="text-xs text-slate-500">{oid}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-900">{o.creator_name || "—"}</div>
                        <div className="text-xs text-slate-500">{o.creator_email || "—"}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {o.status || "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3">{Number(o.total_order_quantity || 0) || 0}</td>

                      <td className="px-4 py-3 text-slate-600">{o.created_at || "—"}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/admin/orders/${oid}`}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                          >
                            View
                          </Link>

                          <button
                            onClick={() => openRemove(oid)}
                            className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Remove confirm */}
      <ConfirmDeleteDialog
        open={removeOpen}
        loading={removing}
        error={removeErr}
        title="Remove order from shipment"
        description={
          removeTarget?.order_id
            ? `Remove order ${removeTarget.order_id} from shipment ${shipmentId}?`
            : "Remove this order?"
        }
        confirmText="Remove"
        onClose={() => {
          if (!removing) setRemoveOpen(false);
        }}
        onConfirm={onConfirmRemove}
      />
    </div>
  );
}