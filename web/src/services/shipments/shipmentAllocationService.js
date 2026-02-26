import { shipmentAllocationRepo as defaultRepo } from "@/infra/firebase/repos/shipmentAllocationRepo";

function s(v) {
  return String(v || "").trim();
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function normalizeCreateInput(input = {}) {
  return {
    allocation_id: s(input.allocation_id),
    shipment_id: s(input.shipment_id),
    product_id: s(input.product_id),
    order_id: s(input.order_id),
    order_item_id: s(input.order_item_id),
    planned_qty: n(input.planned_qty, 0),
    arrived_qty_share: n(input.arrived_qty_share, 0),
    damaged_qty_share: n(input.damaged_qty_share, 0),
    expired_qty_share: n(input.expired_qty_share, 0),
    stolen_qty_share: n(input.stolen_qty_share, 0),
    other_qty_share: n(input.other_qty_share, 0),
    customer_delivered_qty: n(input.customer_delivered_qty, 0),
    unit_product_weight_g: Math.round(n(input.unit_product_weight_g, 0)),
    unit_package_weight_g: Math.round(n(input.unit_package_weight_g, 0)),
    unit_total_weight_g: Math.round(n(input.unit_total_weight_g, 0)),
    purchase_unit_gbp_snapshot: n(input.purchase_unit_gbp_snapshot, 0),
    line_purchase_gbp: n(input.line_purchase_gbp, 0),
  };
}

function normalizePatch(patch = {}) {
  const out = {};
  const fields = [
    "shipment_id",
    "product_id",
    "order_id",
    "order_item_id",
    "planned_qty",
    "arrived_qty_share",
    "damaged_qty_share",
    "expired_qty_share",
    "stolen_qty_share",
    "other_qty_share",
    "customer_delivered_qty",
    "unit_product_weight_g",
    "unit_package_weight_g",
    "unit_total_weight_g",
    "purchase_unit_gbp_snapshot",
    "line_purchase_gbp",
  ];
  fields.forEach((f) => {
    if (!(f in patch)) return;
    if (f.endsWith("_id")) out[f] = s(patch[f]);
    else out[f] = n(patch[f], 0);
  });
  return out;
}

export function createShipmentAllocationService(repo = defaultRepo) {
  return {
    async getById(allocationId) {
      return repo.getById(s(allocationId));
    },
    async listByShipmentId(shipmentId) {
      return repo.listByShipmentId(s(shipmentId));
    },
    async listByOrderItemId(orderItemId) {
      return repo.listByOrderItemId(s(orderItemId));
    },
    async createAllocation(input) {
      return repo.create(normalizeCreateInput(input));
    },
    async updateAllocation(allocationId, patch) {
      const id = s(allocationId);
      if (!id) throw new Error("allocation_id is required");
      return repo.update(id, normalizePatch(patch));
    },
    async removeAllocation(allocationId) {
      const id = s(allocationId);
      if (!id) throw new Error("allocation_id is required");
      return repo.remove(id);
    },
  };
}

export const shipmentAllocationService = createShipmentAllocationService();
