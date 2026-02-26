import { shipmentRepo as defaultShipmentRepo } from "@/infra/firebase/repos/shipmentRepo";
import { shipmentItemRepo as defaultShipmentItemRepo } from "@/infra/firebase/repos/shipmentItemRepo";
import { shipmentAccountingRepo as defaultShipmentAccountingRepo } from "@/infra/firebase/repos/shipmentAccountingRepo";
import { statusOverrideRepo as defaultStatusOverrideRepo } from "@/infra/firebase/repos/statusOverrideRepo";
import {
  assertShipmentCanEdit,
  assertShipmentCanEditItemFields,
  assertShipmentCanEditItems,
  assertShipmentCanSoftClose,
  canTransitionShipmentStatus,
  getShipmentCapabilities,
} from "@/domain/status/policy";

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

function r2(v) {
  return Number(n(v, 0).toFixed(2));
}

function makeShipmentId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `SHP_${ts}_${rnd}`;
}

function pickNum(...vals) {
  for (const v of vals) {
    const x = Number(v);
    if (Number.isFinite(x) && x > 0) return x;
  }
  return 0;
}

function autoAvgRate(productRate, cargoRate, avgRate) {
  const manualAvg = n(avgRate, 0);
  if (manualAvg > 0) return manualAvg;
  const p = n(productRate, 0);
  const c = n(cargoRate, 0);
  if (p > 0 && c > 0) return (p + c) / 2;
  if (p > 0) return p;
  if (c > 0) return c;
  return 0;
}

function computeReceivedWeightG(row = {}) {
  const direct = n(row.received_weight_g, NaN);
  if (Number.isFinite(direct)) return direct;
  return n(row.arrived_qty, 0) * n(row.unit_total_weight_g, 0);
}

function normalizeShipmentCreateInput(input = {}) {
  const shipment_id = s(input.shipment_id) || makeShipmentId();
  const status = s(input.status || "draft").toLowerCase();
  const rateProduct = pickNum(input.gbp_rate_product_bdt, input.gbp_rate_product);
  const rateCargo = pickNum(input.gbp_rate_cargo_bdt, input.gbp_rate_cargo);
  const rateAvg = autoAvgRate(rateProduct, rateCargo, pickNum(input.gbp_rate_avg_bdt, input.gbp_avg_rate));
  return {
    shipment_id,
    name: s(input.name),
    status,
    cargo_cost_per_kg_gbp: pickNum(input.cargo_cost_per_kg_gbp, input.cargo_cost_per_kg),
    gbp_rate_product_bdt: rateProduct,
    gbp_rate_cargo_bdt: rateCargo,
    gbp_rate_avg_bdt: rateAvg,
    order_date: input.order_date || null,
    arrived_date: input.arrived_date || null,
    total_value_gbp: r2(n(input.total_value_gbp, 0)),
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
  if ("cargo_cost_per_kg" in patch) out.cargo_cost_per_kg_gbp = n(patch.cargo_cost_per_kg, 0);
  if ("gbp_rate_product" in patch) out.gbp_rate_product_bdt = n(patch.gbp_rate_product, 0);
  if ("gbp_rate_cargo" in patch) out.gbp_rate_cargo_bdt = n(patch.gbp_rate_cargo, 0);
  if ("gbp_avg_rate" in patch) out.gbp_rate_avg_bdt = n(patch.gbp_avg_rate, 0);
  if ("order_date" in patch) out.order_date = patch.order_date || null;
  if ("arrived_date" in patch) out.arrived_date = patch.arrived_date || null;
  const hasRates =
    "gbp_rate_product_bdt" in out ||
    "gbp_rate_cargo_bdt" in out ||
    "gbp_rate_avg_bdt" in out;
  if (hasRates) {
    out.gbp_rate_avg_bdt = autoAvgRate(out.gbp_rate_product_bdt, out.gbp_rate_cargo_bdt, out.gbp_rate_avg_bdt);
  }
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
  statusOverrideRepo = defaultStatusOverrideRepo,
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

    async updateShipment(shipmentId, patch, context = { role: "admin" }) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      const prev = await shipmentRepo.getById(id);
      if (!prev) throw new Error("Shipment not found");
      assertShipmentCanEdit({ role: context?.role || "admin", status: prev.status });
      return shipmentRepo.update(id, normalizeShipmentPatch(patch));
    },

    async removeShipment(shipmentId, context = { role: "admin", email: "" }) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      const prev = await shipmentRepo.getById(id);
      if (!prev) throw new Error("Shipment not found");
      assertShipmentCanSoftClose({ role: context?.role || "admin", status: prev.status });
      return this.updateShipmentStatus(id, "cancelled", {
        role: context?.role || "admin",
        email: context?.email || "",
        reason: "soft_delete",
        force: true,
      });
    },

    async getShipmentItemById(shipmentItemId) {
      return shipmentItemRepo.getById(s(shipmentItemId));
    },

    async listShipmentItems(shipmentId) {
      const id = s(shipmentId);
      if (!id) throw new Error("shipment_id is required");
      return shipmentItemRepo.listByShipmentId(id);
    },

    async createShipmentItem(input, context = { role: "admin" }) {
      const shipment_id = s(input?.shipment_id);
      const ship = await shipmentRepo.getById(shipment_id);
      if (!ship) throw new Error("Shipment not found");
      assertShipmentCanEditItems({ role: context?.role || "admin", status: ship.status });
      const created = await shipmentItemRepo.create(normalizeShipmentItemCreateInput(input));
      await this.recomputeShipmentTotals(shipment_id);
      return created;
    },

    async updateShipmentItem(shipmentItemId, patch, context = { role: "admin" }) {
      const id = s(shipmentItemId);
      if (!id) throw new Error("shipment_item_id is required");
      const prev = await shipmentItemRepo.getById(id);
      if (!prev) throw new Error("Shipment item not found");
      const ship = await shipmentRepo.getById(s(prev.shipment_id));
      if (!ship) throw new Error("Shipment not found");
      assertShipmentCanEditItems({ role: context?.role || "admin", status: ship.status });
      const normalized = normalizeShipmentItemPatch(patch);
      assertShipmentCanEditItemFields({
        role: context?.role || "admin",
        status: ship.status,
        fields: Object.keys(normalized),
      });
      const updated = await shipmentItemRepo.update(id, normalized);
      await this.recomputeShipmentTotals(s(prev.shipment_id));
      return updated;
    },

    async removeShipmentItem(shipmentItemId, context = { role: "admin" }) {
      const id = s(shipmentItemId);
      if (!id) throw new Error("shipment_item_id is required");
      const prev = await shipmentItemRepo.getById(id);
      if (!prev) return { success: true };
      const ship = await shipmentRepo.getById(s(prev.shipment_id));
      if (!ship) throw new Error("Shipment not found");
      assertShipmentCanEditItems({ role: context?.role || "admin", status: ship.status });
      const out = await shipmentItemRepo.remove(id);
      await this.recomputeShipmentTotals(s(prev.shipment_id));
      return out;
    },

    async getShipmentCapabilities(shipmentId, role = "admin") {
      const ship = await shipmentRepo.getById(s(shipmentId));
      if (!ship) throw new Error("Shipment not found");
      return getShipmentCapabilities({ role, status: ship.status });
    },

    async recomputeShipmentTotals(shipmentId) {
      const sid = s(shipmentId);
      if (!sid) throw new Error("shipment_id is required");
      const ship = await shipmentRepo.getById(sid);
      if (!ship) throw new Error("Shipment not found");
      const rows = await shipmentItemRepo.listByShipmentId(sid);

      const total_value_gbp = r2(rows.reduce((sum, r) => sum + n(r.total_value_gbp, 0), 0));
      const total_weight_g = rows.reduce((sum, r) => {
        const qty = n(r.needed_qty, 0);
        const unit = n(r.unit_total_weight_g, 0);
        return sum + qty * unit;
      }, 0);
      const received_weight_g = rows.reduce((sum, r) => sum + computeReceivedWeightG(r), 0);

      const nextRates = normalizeShipmentPatch({
        gbp_rate_product_bdt: n(ship.gbp_rate_product_bdt, 0),
        gbp_rate_cargo_bdt: n(ship.gbp_rate_cargo_bdt, 0),
        gbp_rate_avg_bdt: n(ship.gbp_rate_avg_bdt, 0),
      });

      return shipmentRepo.update(sid, {
        ...nextRates,
        total_value_gbp,
        total_weight_g,
        received_weight_g,
      });
    },

    async updateShipmentStatus(shipmentId, nextStatus, context = {}) {
      const sid = s(shipmentId);
      const to = s(nextStatus).toLowerCase();
      if (!sid) throw new Error("shipment_id is required");
      if (!to) throw new Error("target status is required");

      const ship = await shipmentRepo.getById(sid);
      if (!ship) throw new Error("Shipment not found");
      const from = s(ship.status || "draft").toLowerCase();
      const actorRole = s(context?.role || "admin").toLowerCase();
      const actorEmail = s(context?.email).toLowerCase();
      const force = !!context?.force;
      const reason = s(context?.reason);

      if (actorRole !== "admin") {
        throw new Error("Only admin can change shipment status.");
      }
      if (from === to) return ship;

      const allowed = canTransitionShipmentStatus(from, to);
      if (!allowed && !force) {
        throw new Error(`Invalid shipment status transition: ${from} -> ${to}`);
      }
      if (!allowed && force && !reason) {
        throw new Error("Override reason is required for forced shipment status change.");
      }

      const updated = await shipmentRepo.update(sid, { status: to });
      if (!allowed && force) {
        await statusOverrideRepo.log({
          entity_type: "shipment",
          entity_id: sid,
          from_status: from,
          to_status: to,
          reason,
          actor_email: actorEmail,
          actor_role: actorRole,
        });
      }
      return updated;
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
