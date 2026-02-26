import { orderRepo as defaultOrderRepo } from "@/infra/firebase/repos/orderRepo";
import { orderItemRepo as defaultOrderItemRepo } from "@/infra/firebase/repos/orderItemRepo";
import { shipmentRepo as defaultShipmentRepo } from "@/infra/firebase/repos/shipmentRepo";
import { shipmentItemRepo as defaultShipmentItemRepo } from "@/infra/firebase/repos/shipmentItemRepo";
import { cartService as defaultCartService } from "@/services/carts/cartService";
import { shipmentAllocationService as defaultAllocationService } from "@/services/shipments/shipmentAllocationService";
import { statusOverrideRepo as defaultStatusOverrideRepo } from "@/infra/firebase/repos/statusOverrideRepo";
import { calculateOrderItemPricing } from "@/domain/orders/calc";
import {
  assertOrderCanChangeStatus,
  assertOrderCanEditHeader,
  assertOrderCanEditItems,
  canTransitionOrderStatus,
  getOrderCapabilities,
} from "@/domain/status/policy";

const GENERAL_SHIPMENT_ID = "SHP_GENERAL_POOL";

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

function normalizeStatus(v, fallback = "submitted") {
  const status = s(v).toLowerCase();
  return status || fallback;
}

function orderId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `ORD_${ts}_${rnd}`;
}

function caseStep(caseSize) {
  return Math.max(6, ni(caseSize, 0));
}

function isQtyValidByCase(quantity, caseSize) {
  const q = ni(quantity, 0);
  const step = caseStep(caseSize);
  return q >= step && q % step === 0;
}

function mergeCartItemsByProduct(items = []) {
  const map = new Map();
  items.forEach((raw) => {
    const pid = s(raw.product_id);
    if (!pid) return;
    const prev = map.get(pid);
    const quantity = ni(raw.quantity, 0);
    if (!prev) {
      map.set(pid, {
        product_id: pid,
        product_code: s(raw.product_code),
        barcode: s(raw.barcode),
        name: s(raw.name),
        brand: s(raw.brand),
        image_url: s(raw.image_url),
        case_size: n(raw.case_size, 0),
        needed_quantity: quantity,
        purchase_price_gbp: n(raw.unit_price_gbp, n(raw.price_gbp, 0)),
      });
      return;
    }
    prev.needed_quantity = ni(prev.needed_quantity + quantity, 0);
    if (!prev.name) prev.name = s(raw.name);
    if (!prev.brand) prev.brand = s(raw.brand);
    if (!prev.image_url) prev.image_url = s(raw.image_url);
    if (!prev.product_code) prev.product_code = s(raw.product_code);
    if (!prev.barcode) prev.barcode = s(raw.barcode);
    if (!(prev.case_size > 0)) prev.case_size = n(raw.case_size, 0);
    if (!(prev.purchase_price_gbp > 0)) prev.purchase_price_gbp = n(raw.unit_price_gbp, n(raw.price_gbp, 0));
  });
  return Array.from(map.values());
}

function normalizeOrderPatch(patch = {}) {
  const out = {};
  const strFields = ["order_name", "shipment_id", "creator_name"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  if ("creator_role" in patch) out.creator_role = s(patch.creator_role).toLowerCase();
  if ("status" in patch) out.status = normalizeStatus(patch.status, "submitted");
  const numFields = [
    "order_sl",
    "total_needed_qty",
    "total_delivered_qty",
    "shipment_count",
    "total_purchase_gbp",
    "total_final_bdt",
  ];
  numFields.forEach((f) => {
    if (f in patch) out[f] = f === "order_sl" ? ni(patch[f], 1) : n(patch[f], 0);
  });
  return out;
}

function normalizeItemPatch(patch = {}) {
  const out = {};
  const strFields = ["name", "brand", "image_url", "offer_price_mode", "delete_reason"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  const numFields = [
    "needed_quantity",
    "delivered_quantity",
    "purchase_price_gbp",
    "offer_price_bdt_on_purchase",
    "offer_price_bdt_on_total",
    "offered_price_bdt",
    "customer_counter_offer_price_bdt",
    "final_price_bdt",
    "profit_rate",
    "is_deleted",
  ];
  numFields.forEach((f) => {
    if (f in patch) out[f] = n(patch[f], 0);
  });
  if ("deleted_at" in patch) out.deleted_at = patch.deleted_at || null;
  if ("deleted_by" in patch) out.deleted_by = s(patch.deleted_by).toLowerCase();
  return out;
}

export function createOrderService(
  orderRepo = defaultOrderRepo,
  orderItemRepo = defaultOrderItemRepo,
  shipmentRepo = defaultShipmentRepo,
  shipmentItemRepo = defaultShipmentItemRepo,
  cartService = defaultCartService,
  allocationService = defaultAllocationService,
  statusOverrideRepo = defaultStatusOverrideRepo,
) {
  async function ensureGeneralShipment() {
    const existing = await shipmentRepo.getById(GENERAL_SHIPMENT_ID);
    if (existing) return existing;
    return shipmentRepo.create({
      shipment_id: GENERAL_SHIPMENT_ID,
      name: "General Shipment Pool",
      status: "draft",
      cargo_cost_per_kg_gbp: 0,
      gbp_rate_product_bdt: 0,
      gbp_rate_cargo_bdt: 0,
      gbp_rate_avg_bdt: 0,
    });
  }

  async function getPrimaryShipmentContext(orderItem) {
    const item = orderItem || {};
    const allocations = await allocationService.listByOrderItemId(item.order_item_id);
    const activeAlloc = allocations.find((r) => Number(r.is_removed || 0) !== 1);
    const shipmentId = s(activeAlloc?.shipment_id || GENERAL_SHIPMENT_ID);
    const shipment = await shipmentRepo.getById(shipmentId);
    if (!shipment) {
      return {
        shipment_id: shipmentId,
        cargo_cost_per_kg_gbp: 0,
        gbp_rate_avg_bdt: 0,
        unit_total_weight_g: 0,
      };
    }
    const aggRows = await shipmentItemRepo.listByShipmentId(shipmentId);
    const agg = aggRows.find((r) => s(r.product_id) === s(item.product_id));
    return {
      shipment_id: shipmentId,
      cargo_cost_per_kg_gbp: n(shipment.cargo_cost_per_kg_gbp, 0),
      gbp_rate_avg_bdt: n(shipment.gbp_rate_avg_bdt, 0),
      unit_total_weight_g: n(agg?.unit_total_weight_g, 0),
    };
  }

  async function recalcOrderItemPricing(orderItemId) {
    const id = s(orderItemId);
    if (!id) throw new Error("order_item_id is required");
    const item = await orderItemRepo.getById(id);
    if (!item) throw new Error("Order item not found");
    if (Number(item.is_deleted || 0) === 1) return item;

    const ctx = await getPrimaryShipmentContext(item);
    const input = {
      purchase_price_gbp: n(item.purchase_price_gbp, 0),
      needed_quantity: n(item.needed_quantity, 0),
      profit_rate: n(item.profit_rate, 0),
      offer_price_mode: s(item.offer_price_mode || "purchase"),
      unit_total_weight_g: n(ctx.unit_total_weight_g, 0),
      cargo_cost_per_kg_gbp: n(ctx.cargo_cost_per_kg_gbp, 0),
      gbp_rate_avg_bdt: n(ctx.gbp_rate_avg_bdt, 0),
    };
    const result = calculateOrderItemPricing(input);

    if (!result.ok) {
      return orderItemRepo.update(id, {
        calc_block_reasons: result.reasons,
        calculated_snapshot: {
          ok: false,
          reasons: result.reasons,
          shipment_id: ctx.shipment_id,
          input,
          calculated_at: new Date().toISOString(),
        },
      });
    }

    const out = result.output;
    return orderItemRepo.update(id, {
      offer_price_bdt_on_purchase: out.mode === "purchase" ? out.offered_total_unit_bdt : n(item.offer_price_bdt_on_purchase, 0),
      offer_price_bdt_on_total: out.mode === "total" ? out.offered_total_unit_bdt : n(item.offer_price_bdt_on_total, 0),
      offered_price_bdt: out.offered_total_unit_bdt,
      calc_block_reasons: [],
      calculated_snapshot: {
        ok: true,
        shipment_id: ctx.shipment_id,
        input,
        output: out,
        calculated_at: new Date().toISOString(),
      },
    });
  }

  async function runRecalcOrderPricing(orderIdValue) {
    const oid = s(orderIdValue);
    if (!oid) throw new Error("order_id is required");
    const items = await orderItemRepo.listByOrderId(oid, { includeDeleted: true });
    for (const item of items) {
      if (Number(item.is_deleted || 0) === 1) continue;
      await recalcOrderItemPricing(item.order_item_id);
    }
    return recomputeOrderTotals(oid);
  }

  async function recomputeOrderTotals(orderIdValue) {
    const oid = s(orderIdValue);
    if (!oid) throw new Error("order_id is required");
    const [items, allocations] = await Promise.all([
      orderItemRepo.listByOrderId(oid),
      allocationService.listByOrderId(oid),
    ]);
    const activeItems = items.filter((it) => Number(it.is_deleted || 0) !== 1);
    const total_needed_qty = activeItems.reduce((sum, it) => sum + n(it.needed_quantity, 0), 0);
    const total_delivered_qty = activeItems.reduce((sum, it) => sum + n(it.delivered_quantity, 0), 0);
    const total_purchase_gbp = activeItems.reduce(
      (sum, it) => sum + n(it.purchase_price_gbp, 0) * n(it.needed_quantity, 0),
      0,
    );
    const total_final_bdt = activeItems.reduce((sum, it) => {
      const finalBdt = n(it.final_price_bdt, 0);
      const offeredBdt = n(it.offered_price_bdt, 0);
      const unit = finalBdt > 0 ? finalBdt : offeredBdt;
      return sum + unit * n(it.needed_quantity, 0);
    }, 0);
    const shipment_count = new Set(
      allocations
        .filter((r) => Number(r.is_removed || 0) !== 1)
        .map((r) => s(r.shipment_id))
        .filter(Boolean),
    ).size;
    return orderRepo.update(oid, {
      total_needed_qty,
      total_delivered_qty,
      shipment_count,
      total_purchase_gbp: Number(total_purchase_gbp.toFixed(2)),
      total_final_bdt: Math.round(total_final_bdt),
    });
  }

  async function syncOrderItemDelivered(orderItemId) {
    const oiid = s(orderItemId);
    if (!oiid) return;
    const allocations = await allocationService.listByOrderItemId(oiid);
    const delivered = allocations
      .filter((r) => Number(r.is_removed || 0) !== 1)
      .reduce((sum, r) => sum + n(r.customer_delivered_qty, 0), 0);
    const item = await orderItemRepo.update(oiid, { delivered_quantity: delivered });
    await recomputeOrderTotals(item.order_id);
  }

  return {
    async getOrderById(orderIdValue) {
      return orderRepo.getById(s(orderIdValue));
    },

    async listOrdersByCreatorEmail(email) {
      return orderRepo.listByCreatorEmail(s(email).toLowerCase());
    },

    async listOrders() {
      return orderRepo.listAll();
    },

    async listOrdersForActor(context = {}) {
      const role = s(context?.role || "").toLowerCase();
      const email = s(context?.email || "").toLowerCase();
      if (role === "admin") return orderRepo.listAll();
      if (role === "customer") return orderRepo.listByCreatorEmail(email);
      return [];
    },

    async createOrderFromCart(context = {}, input = {}) {
      const role = s(context?.role || "").toLowerCase();
      const creator_email = s(context?.email).toLowerCase();
      if (!(role === "admin" || role === "customer")) {
        throw new Error("Only admin or customer can create orders.");
      }
      if (!creator_email) throw new Error("creator email is required");

      const cart = await cartService.getCart(creator_email);
      const raw = Array.isArray(cart?.items) ? cart.items : [];
      if (!raw.length) throw new Error("Cart is empty.");

      const merged = mergeCartItemsByProduct(raw);
      if (!merged.length) throw new Error("No valid cart items.");

      merged.forEach((item) => {
        if (!isQtyValidByCase(item.needed_quantity, item.case_size)) {
          throw new Error(`Invalid quantity for ${item.name || item.product_id}. Must follow case step.`);
        }
      });

      await ensureGeneralShipment();

      const nextSl = await orderRepo.nextOrderSl();
      const oid = orderId();
      const header = await orderRepo.create({
        order_id: oid,
        order_sl: nextSl,
        order_name: s(input.order_name) || `Order #${nextSl}`,
        creator_email,
        creator_name: s(context?.name),
        creator_role: role,
        status: "submitted",
        shipment_id: GENERAL_SHIPMENT_ID,
        total_needed_qty: 0,
        total_delivered_qty: 0,
        shipment_count: 1,
        total_purchase_gbp: 0,
        total_final_bdt: 0,
      });

      for (let i = 0; i < merged.length; i += 1) {
        const row = merged[i];
        const item_sl = i + 1;
        const order_item_id = `${oid}-${item_sl}`;
        await orderItemRepo.create({
          order_item_id,
          order_id: oid,
          item_sl,
          product_id: row.product_id,
          product_code: row.product_code,
          barcode: row.barcode,
          name: row.name,
          brand: row.brand,
          image_url: row.image_url,
          case_size: row.case_size,
          needed_quantity: row.needed_quantity,
          delivered_quantity: 0,
          purchase_price_gbp: Number(n(row.purchase_price_gbp, 0).toFixed(2)),
          offer_price_bdt_on_purchase: 0,
          offer_price_bdt_on_total: 0,
          offer_price_mode: "purchase",
          offered_price_bdt: 0,
          customer_counter_offer_price_bdt: 0,
          final_price_bdt: 0,
          profit_rate: 0,
          is_deleted: 0,
        });
        await allocationService.createAllocation({
          shipment_id: GENERAL_SHIPMENT_ID,
          product_id: row.product_id,
          order_id: oid,
          order_item_id,
          planned_qty: row.needed_quantity,
          arrived_qty_share: 0,
          damaged_qty_share: 0,
          expired_qty_share: 0,
          stolen_qty_share: 0,
          other_qty_share: 0,
          customer_delivered_qty: 0,
          unit_product_weight_g: 0,
          unit_package_weight_g: 0,
          unit_total_weight_g: 0,
          purchase_unit_gbp_snapshot: Number(n(row.purchase_price_gbp, 0).toFixed(2)),
          line_purchase_gbp: Number((n(row.purchase_price_gbp, 0) * n(row.needed_quantity, 0)).toFixed(2)),
          allocation_status: "active",
          is_removed: 0,
        });
      }

      await recomputeOrderTotals(oid);
      await cartService.clearCart(creator_email);
      return orderRepo.getById(header.order_id);
    },

    async updateOrder(orderIdValue, patch, context = { role: "admin" }) {
      const id = s(orderIdValue);
      if (!id) throw new Error("order_id is required");
      const prev = await orderRepo.getById(id);
      if (!prev) throw new Error("Order not found");
      assertOrderCanEditHeader({ role: context?.role || "admin", status: prev.status });
      return orderRepo.update(id, normalizeOrderPatch(patch));
    },

    async removeOrder(orderIdValue, context = { role: "admin" }) {
      const id = s(orderIdValue);
      if (!id) throw new Error("order_id is required");
      const prev = await orderRepo.getById(id);
      if (!prev) return { success: true };
      if (s(context?.role).toLowerCase() !== "admin") throw new Error("Only admin can delete order.");
      if (!["cancelled", "delivered"].includes(normalizeStatus(prev.status, ""))) {
        throw new Error("Order can be deleted only when cancelled or delivered.");
      }
      return orderRepo.remove(id);
    },

    async getOrderItemById(orderItemId) {
      return orderItemRepo.getById(s(orderItemId));
    },

    async listOrderItems(orderIdValue, options = {}) {
      const id = s(orderIdValue);
      if (!id) throw new Error("order_id is required");
      return orderItemRepo.listByOrderId(id, options);
    },

    async updateOrderItem(orderItemId, patch, context = { role: "admin" }) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      const prev = await orderItemRepo.getById(id);
      if (!prev) throw new Error("Order item not found");
      const order = await orderRepo.getById(prev.order_id);
      if (!order) throw new Error("Order not found");

      const role = s(context?.role || "admin").toLowerCase();
      assertOrderCanEditItems({ role, status: order.status });

      const normalized = normalizeItemPatch(patch);
      if ("needed_quantity" in normalized && !isQtyValidByCase(normalized.needed_quantity, prev.case_size)) {
        throw new Error("Quantity must follow case-size step.");
      }

      if (role === "customer") {
        const allowed = ["customer_counter_offer_price_bdt"];
        const invalid = Object.keys(normalized).filter((k) => !allowed.includes(k));
        if (invalid.length) throw new Error("Customer can only update counter offer.");
        if ("customer_counter_offer_price_bdt" in normalized && !(n(normalized.customer_counter_offer_price_bdt, 0) > 0)) {
          throw new Error("Customer counter offer must be greater than 0.");
        }
      } else {
        if ("final_price_bdt" in normalized && !(n(normalized.final_price_bdt, 0) > 0)) {
          throw new Error("Final price must be greater than 0.");
        }
        if ("offered_price_bdt" in normalized && !(n(normalized.offered_price_bdt, 0) >= 0)) {
          throw new Error("Offered price must be 0 or greater.");
        }
      }

      const updated = await orderItemRepo.update(id, normalized);
      await recomputeOrderTotals(updated.order_id);
      return updated;
    },

    async updateOrderItemsBulk(orderIdValue, patches = [], context = { role: "admin" }) {
      const oid = s(orderIdValue);
      if (!oid) throw new Error("order_id is required");
      for (const row of patches || []) {
        await this.updateOrderItem(row.order_item_id, row.patch || {}, context);
      }
      return this.listOrderItems(oid, { includeDeleted: true });
    },

    async removeOrderItemFromShipment(orderItemId, shipmentId, context = { role: "admin", email: "" }) {
      const oiid = s(orderItemId);
      const sid = s(shipmentId);
      if (!oiid || !sid) throw new Error("order_item_id and shipment_id are required");
      if (s(context?.role).toLowerCase() !== "admin") throw new Error("Only admin can remove from shipment.");
      const rows = await allocationService.listByOrderItemAndShipment(oiid, sid);
      for (const row of rows) {
        await allocationService.updateAllocation(row.allocation_id, {
          allocation_status: "removed",
          is_removed: 1,
          removed_at: new Date().toISOString(),
          removed_by: s(context?.email).toLowerCase(),
          remove_reason: "removed_from_shipment",
        });
      }
      if (rows.length) await syncOrderItemDelivered(oiid);
      return { success: true, removed: rows.length };
    },

    async softDeleteOrderItem(orderItemId, context = { role: "admin", email: "" }, opts = {}) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      if (s(context?.role).toLowerCase() !== "admin") throw new Error("Only admin can soft delete order item.");
      if (opts?.shipment_id) {
        return this.removeOrderItemFromShipment(id, opts.shipment_id, context);
      }
      const prev = await orderItemRepo.getById(id);
      if (!prev) return { success: true };
      const updated = await orderItemRepo.update(id, {
        is_deleted: 1,
        deleted_at: new Date().toISOString(),
        deleted_by: s(context?.email).toLowerCase(),
        delete_reason: s(opts?.reason || "soft_delete"),
      });
      const allocs = await allocationService.listByOrderItemId(id);
      for (const row of allocs) {
        await allocationService.updateAllocation(row.allocation_id, {
          allocation_status: "removed",
          is_removed: 1,
          removed_at: new Date().toISOString(),
          removed_by: s(context?.email).toLowerCase(),
          remove_reason: "order_item_soft_deleted",
        });
      }
      await recomputeOrderTotals(updated.order_id);
      return updated;
    },

    async restoreOrderItem(orderItemId, context = { role: "admin" }) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      if (s(context?.role).toLowerCase() !== "admin") throw new Error("Only admin can restore order item.");
      const prev = await orderItemRepo.getById(id);
      if (!prev) throw new Error("Order item not found");
      const updated = await orderItemRepo.update(id, {
        is_deleted: 0,
        deleted_at: null,
        deleted_by: "",
        delete_reason: "",
      });
      await recomputeOrderTotals(updated.order_id);
      return updated;
    },

    async syncOrderItemDelivered(orderItemId) {
      return syncOrderItemDelivered(orderItemId);
    },

    async recalcOrderItemPricing(orderItemId) {
      const updated = await recalcOrderItemPricing(orderItemId);
      await recomputeOrderTotals(updated.order_id);
      return updated;
    },

    async recalcOrderPricing(orderIdValue) {
      return runRecalcOrderPricing(orderIdValue);
    },

    async recomputeOrder(orderIdValue) {
      return runRecalcOrderPricing(orderIdValue);
    },

    async updateOrderStatus(orderIdValue, nextStatus, context = {}) {
      const id = s(orderIdValue);
      const to = normalizeStatus(nextStatus, "");
      if (!id) throw new Error("order_id is required");
      if (!to) throw new Error("target status is required");

      const prev = await orderRepo.getById(id);
      if (!prev) throw new Error("Order not found");
      const from = normalizeStatus(prev.status, "submitted");

      const actorRole = s(context?.role || "admin").toLowerCase();
      const actorEmail = s(context?.email).toLowerCase();
      const force = !!context?.force;
      const reason = s(context?.reason);

      assertOrderCanChangeStatus({ role: actorRole });
      if (from === to) return prev;

      const allowed = canTransitionOrderStatus(from, to);
      if (!allowed && !force) throw new Error(`Invalid order status transition: ${from} -> ${to}`);
      if (!allowed && force && !reason) throw new Error("Override reason is required for forced order status change.");

      const updated = await orderRepo.update(id, { status: to });
      if (!allowed && force) {
        await statusOverrideRepo.log({
          entity_type: "order",
          entity_id: id,
          from_status: from,
          to_status: to,
          reason,
          actor_email: actorEmail,
          actor_role: actorRole,
        });
      }
      return updated;
    },

    getOrderCapabilities,
  };
}

export const orderService = createOrderService();
