import { shipmentRepo as defaultShipmentRepo } from "@/infra/firebase/repos/shipmentRepo";
import { shipmentItemRepo as defaultShipmentItemRepo } from "@/infra/firebase/repos/shipmentItemRepo";
import { shipmentAccountingRepo as defaultShipmentAccountingRepo } from "@/infra/firebase/repos/shipmentAccountingRepo";

function s(v) {
  return String(v || "").trim();
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function ni(v, d = 0) {
  return Math.max(0, Math.round(n(v, d)));
}

function normalizeShipmentCreateInput(input = {}) {
  const shipment_id = s(input.shipment_id);
  if (!shipment_id) throw new Error("shipment_id is required");
  return {
    shipment_id,
    name: s(input.name),
    status: s(input.status || "draft").toLowerCase(),
    cargo_cost_per_kg_gbp: n(input.cargo_cost_per_kg_gbp, 0),
    gbp_rate_product_bdt: n(input.gbp_rate_product_bdt, 0),
    gbp_rate_cargo_bdt: n(input.gbp_rate_cargo_bdt, 0),
    gbp_rate_avg_bdt: n(input.gbp_rate_avg_bdt, 0),
    order_date: input.order_date || null,
    arrived_date: input.arrived_date || null,
    total_value_gbp: n(input.total_value_gbp, 0),
    total_weight_g: n(input.total_weight_g, 0),
    received_weight_g: n(input.received_weight_g, 0),
    notes: s(input.notes),
  };
}

function normalizeShipmentPatch(patch = {}) {
  const out = {};
  const strFields = ["name", "status", "notes"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  const numFields = [
    "cargo_cost_per_kg_gbp",
    "gbp_rate_product_bdt",
    "gbp_rate_cargo_bdt",
    "gbp_rate_avg_bdt",
    "total_value_gbp",
    "total_weight_g",
    "received_weight_g",
  ];
  numFields.forEach((f) => {
    if (f in patch) out[f] = n(patch[f], 0);
  });
  if ("order_date" in patch) out.order_date = patch.order_date || null;
  if ("arrived_date" in patch) out.arrived_date = patch.arrived_date || null;
  return out;
}

function normalizeShipmentItemCreateInput(input = {}) {
  const shipment_id = s(input.shipment_id);
  const product_id = s(input.product_id);
  if (!shipment_id) throw new Error("shipment_id is required");
  if (!product_id) throw new Error("product_id is required");
  const unitProduct = ni(input.unit_product_weight_g, 0);
  const unitPackage = ni(input.unit_package_weight_g, 0);
  return {
    shipment_item_id: s(input.shipment_item_id),
    shipment_id,
    product_id,
    product_code: s(input.product_code),
    barcode: s(input.barcode),
    item_name: s(input.item_name || input.name),
    image_url: s(input.image_url),
    needed_qty: n(input.needed_qty, 0),
    arrived_qty: n(input.arrived_qty, 0),
    damaged_qty: n(input.damaged_qty, 0),
    expired_qty: n(input.expired_qty, 0),
    stolen_qty: n(input.stolen_qty, 0),
    other_qty: n(input.other_qty, 0),
    delivered_qty: n(input.delivered_qty, 0),
    unit_product_weight_g: unitProduct,
    unit_package_weight_g: unitPackage,
    unit_total_weight_g: ni(input.unit_total_weight_g, unitProduct + unitPackage),
    received_weight_g: n(input.received_weight_g, 0),
    purchase_unit_gbp: n(input.purchase_unit_gbp, 0),
    total_value_gbp: n(input.total_value_gbp, 0),
    order_refs: Array.isArray(input.order_refs) ? input.order_refs : [],
  };
}

function normalizeShipmentItemPatch(patch = {}) {
  const out = {};
  const strFields = ["product_code", "barcode", "item_name", "image_url"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  const numFields = [
    "needed_qty",
    "arrived_qty",
    "damaged_qty",
    "expired_qty",
    "stolen_qty",
    "other_qty",
    "delivered_qty",
    "received_weight_g",
    "purchase_unit_gbp",
    "total_value_gbp",
  ];
  numFields.forEach((f) => {
    if (f in patch) out[f] = n(patch[f], 0);
  });
  const intFields = ["unit_product_weight_g", "unit_package_weight_g", "unit_total_weight_g"];
  intFields.forEach((f) => {
    if (f in patch) out[f] = ni(patch[f], 0);
  });
  if ("order_refs" in patch) out.order_refs = Array.isArray(patch.order_refs) ? patch.order_refs : [];
  return out;
}

function normalizeAccountingCreateInput(input = {}) {
  const shipment_id = s(input.shipment_id);
  if (!shipment_id) throw new Error("shipment_id is required");
  return {
    shipment_id,
    shipment_name: s(input.shipment_name),
    cost_total_gbp: n(input.cost_total_gbp, 0),
    cost_rate_bdt_per_gbp: n(input.cost_rate_bdt_per_gbp, 0),
    cost_total_bdt: n(input.cost_total_bdt, 0),
    revenue_expected_bdt: n(input.revenue_expected_bdt, 0),
    revenue_collected_bdt: n(input.revenue_collected_bdt, 0),
    receivable_bdt: n(input.receivable_bdt, 0),
    profit_bdt: n(input.profit_bdt, 0),
    status: s(input.status || "open").toLowerCase(),
    closed_at: input.closed_at || null,
    customer_payment_summary: Array.isArray(input.customer_payment_summary) ? input.customer_payment_summary : [],
  };
}

function normalizeAccountingPatch(patch = {}) {
  const out = {};
  const strFields = ["shipment_name", "status"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  const numFields = [
    "cost_total_gbp",
    "cost_rate_bdt_per_gbp",
    "cost_total_bdt",
    "revenue_expected_bdt",
    "revenue_collected_bdt",
    "receivable_bdt",
    "profit_bdt",
  ];
  numFields.forEach((f) => {
    if (f in patch) out[f] = n(patch[f], 0);
  });
  if ("closed_at" in patch) out.closed_at = patch.closed_at || null;
  if ("customer_payment_summary" in patch) {
    out.customer_payment_summary = Array.isArray(patch.customer_payment_summary)
      ? patch.customer_payment_summary
      : [];
  }
  return out;
}

function normalizePaymentCreateInput(input = {}) {
  return {
    customer_email: s(input.customer_email).toLowerCase(),
    customer_name: s(input.customer_name),
    amount_bdt: n(input.amount_bdt, 0),
    method: s(input.method || "other").toLowerCase(),
    note: s(input.note),
    paid_at: input.paid_at || null,
    created_by: s(input.created_by).toLowerCase(),
  };
}

function normalizePaymentPatch(patch = {}) {
  const out = {};
  const strFields = ["customer_email", "customer_name", "method", "note", "created_by"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = f === "customer_email" || f === "created_by" ? s(patch[f]).toLowerCase() : s(patch[f]);
  });
  if ("amount_bdt" in patch) out.amount_bdt = n(patch.amount_bdt, 0);
  if ("paid_at" in patch) out.paid_at = patch.paid_at || null;
  return out;
}

export function createShipmentService(
  shipmentRepo = defaultShipmentRepo,
  shipmentItemRepo = defaultShipmentItemRepo,
  shipmentAccountingRepo = defaultShipmentAccountingRepo,
) {
  return {
    async getShipmentById(shipmentId) {
      return shipmentRepo.getById(s(shipmentId));
    },

    async listShipments() {
      return shipmentRepo.list();
    },

    async createShipment(input) {
      return shipmentRepo.create(normalizeShipmentCreateInput(input));
    },

    async updateShipment(shipmentId, patch) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentRepo.update(id, normalizeShipmentPatch(patch));
    },

    async removeShipment(shipmentId) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentRepo.remove(id);
    },

    async getShipmentItemById(shipmentItemId) {
      return shipmentItemRepo.getById(s(shipmentItemId));
    },

    async listShipmentItems(shipmentId) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentItemRepo.listByShipmentId(id);
    },

    async createShipmentItem(input) {
      return shipmentItemRepo.create(normalizeShipmentItemCreateInput(input));
    },

    async updateShipmentItem(shipmentItemId, patch) {
      const id = s(shipmentItemId);
      if (!id) throw new Error("shipment_item_id is required");
      return shipmentItemRepo.update(id, normalizeShipmentItemPatch(patch));
    },

    async removeShipmentItem(shipmentItemId) {
      const id = s(shipmentItemId);
      if (!id) throw new Error("shipment_item_id is required");
      return shipmentItemRepo.remove(id);
    },

    async getShipmentAccounting(shipmentId) {
      return shipmentAccountingRepo.getByShipmentId(s(shipmentId));
    },

    async createShipmentAccounting(input) {
      return shipmentAccountingRepo.create(normalizeAccountingCreateInput(input));
    },

    async updateShipmentAccounting(shipmentId, patch) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentAccountingRepo.update(id, normalizeAccountingPatch(patch));
    },

    async removeShipmentAccounting(shipmentId) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentAccountingRepo.remove(id);
    },

    async listCustomerPayments(shipmentId) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentAccountingRepo.listPayments(id);
    },

    async addCustomerPayment(shipmentId, paymentId, input) {
      const sid = s(shipmentId);
      const pid = s(paymentId);
      if (!sid || !pid) throw new Error("shipment_id and payment_id are required");
      return shipmentAccountingRepo.addPayment(sid, pid, normalizePaymentCreateInput(input));
    },

    async updateCustomerPayment(shipmentId, paymentId, patch) {
      const sid = s(shipmentId);
      const pid = s(paymentId);
      if (!sid || !pid) throw new Error("shipment_id and payment_id are required");
      return shipmentAccountingRepo.updatePayment(sid, pid, normalizePaymentPatch(patch));
    },

    async removeCustomerPayment(shipmentId, paymentId) {
      const sid = s(shipmentId);
      const pid = s(paymentId);
      if (!sid || !pid) throw new Error("shipment_id and payment_id are required");
      return shipmentAccountingRepo.removePayment(sid, pid);
    },
  };
}

export const shipmentService = createShipmentService();
