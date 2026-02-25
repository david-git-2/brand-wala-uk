import { orderRepo as defaultOrderRepo } from "@/infra/firebase/repos/orderRepo";
import { orderItemRepo as defaultOrderItemRepo } from "@/infra/firebase/repos/orderItemRepo";
import { statusOverrideRepo as defaultStatusOverrideRepo } from "@/infra/firebase/repos/statusOverrideRepo";
import {
  assertOrderCanChangeStatus,
  assertOrderCanEditHeader,
  assertOrderCanEditItems,
  canTransitionOrderStatus,
  getOrderCapabilities,
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

function normalizeStatus(v, fallback = "submitted") {
  const status = s(v).toLowerCase();
  if (!status) return fallback;
  return status;
}

function normalizeOrderCreateInput(input = {}) {
  const order_id = s(input.order_id);
  if (!order_id) throw new Error("order_id is required");
  return {
    order_id,
    order_sl: ni(input.order_sl, 1),
    order_name: s(input.order_name),
    creator_email: s(input.creator_email).toLowerCase(),
    creator_name: s(input.creator_name),
    creator_role: s(input.creator_role || "customer").toLowerCase(),
    status: normalizeStatus(input.status, "submitted"),
    shipment_id: s(input.shipment_id),
    total_needed_qty: n(input.total_needed_qty, 0),
    total_delivered_qty: n(input.total_delivered_qty, 0),
    total_purchase_gbp: n(input.total_purchase_gbp, 0),
    total_final_bdt: n(input.total_final_bdt, 0),
  };
}

function normalizeOrderPatch(patch = {}) {
  const out = {};
  const strFields = ["order_name", "shipment_id", "creator_name"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  if ("creator_role" in patch) out.creator_role = s(patch.creator_role).toLowerCase();
  if ("status" in patch) out.status = normalizeStatus(patch.status, "submitted");
  const numFields = ["order_sl", "total_needed_qty", "total_delivered_qty", "total_purchase_gbp", "total_final_bdt"];
  numFields.forEach((f) => {
    if (f in patch) out[f] = f === "order_sl" ? ni(patch[f], 1) : n(patch[f], 0);
  });
  return out;
}

function normalizeItemCreateInput(input = {}) {
  const order_item_id = s(input.order_item_id);
  const order_id = s(input.order_id);
  if (!order_item_id) throw new Error("order_item_id is required");
  if (!order_id) throw new Error("order_id is required");

  return {
    order_item_id,
    order_id,
    item_sl: ni(input.item_sl, 1),
    product_id: s(input.product_id),
    product_code: s(input.product_code),
    barcode: s(input.barcode),
    name: s(input.name),
    brand: s(input.brand),
    image_url: s(input.image_url),
    case_size: n(input.case_size, 0),
    needed_quantity: n(input.needed_quantity, 0),
    delivered_quantity: n(input.delivered_quantity, 0),
    purchase_price_gbp: n(input.purchase_price_gbp, 0),
    offer_price_bdt_on_purchase: n(input.offer_price_bdt_on_purchase, 0),
    offer_price_bdt_on_total: n(input.offer_price_bdt_on_total, 0),
    offer_price_mode: s(input.offer_price_mode || "purchase").toLowerCase(),
    offered_price_bdt: n(input.offered_price_bdt, 0),
    customer_counter_offer_price_bdt: n(input.customer_counter_offer_price_bdt, 0),
    final_price_bdt: n(input.final_price_bdt, 0),
    profit_rate: n(input.profit_rate, 0),
  };
}

function normalizeItemPatch(patch = {}) {
  const out = {};
  const strFields = [
    "order_id",
    "product_id",
    "product_code",
    "barcode",
    "name",
    "brand",
    "image_url",
    "offer_price_mode",
  ];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  const numFields = [
    "item_sl",
    "case_size",
    "needed_quantity",
    "delivered_quantity",
    "purchase_price_gbp",
    "offer_price_bdt_on_purchase",
    "offer_price_bdt_on_total",
    "offered_price_bdt",
    "customer_counter_offer_price_bdt",
    "final_price_bdt",
    "profit_rate",
  ];
  numFields.forEach((f) => {
    if (f in patch) out[f] = f === "item_sl" ? ni(patch[f], 1) : n(patch[f], 0);
  });
  return out;
}

export function createOrderService(
  orderRepo = defaultOrderRepo,
  orderItemRepo = defaultOrderItemRepo,
  statusOverrideRepo = defaultStatusOverrideRepo,
) {
  function canCustomerSeeOrderStatus(status) {
    const s1 = normalizeStatus(status, "submitted");
    return ["priced", "under_review", "finalized", "processing", "partially_delivered", "delivered", "cancelled"].includes(s1);
  }

  return {
    async getOrderById(orderId) {
      return orderRepo.getById(s(orderId));
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
      if (role === "admin" || role === "ops" || role === "sales" || role === "investor") {
        return orderRepo.listAll();
      }
      if (role === "customer") {
        const rows = await orderRepo.listByCreatorEmail(email);
        return rows.filter((r) => canCustomerSeeOrderStatus(r.status));
      }
      return [];
    },

    async createOrder(input) {
      return orderRepo.create(normalizeOrderCreateInput(input));
    },

    async updateOrder(orderId, patch, context = { role: "admin" }) {
      const id = s(orderId);
      if (!id) throw new Error("order_id is required");
      const prev = await orderRepo.getById(id);
      if (!prev) throw new Error("Order not found");
      assertOrderCanEditHeader({ role: context?.role || "admin", status: prev.status });
      return orderRepo.update(id, normalizeOrderPatch(patch));
    },

    async removeOrder(orderId, context = { role: "admin" }) {
      const id = s(orderId);
      if (!id) throw new Error("order_id is required");
      const prev = await orderRepo.getById(id);
      if (!prev) return { success: true };
      const cap = getOrderCapabilities({ role: context?.role || "admin", status: prev.status });
      if (!cap.isAdmin) throw new Error("Only admin can delete orders.");
      return orderRepo.remove(id);
    },

    async getOrderItemById(orderItemId) {
      return orderItemRepo.getById(s(orderItemId));
    },

    async listOrderItems(orderId) {
      const id = s(orderId);
      if (!id) throw new Error("order_id is required");
      return orderItemRepo.listByOrderId(id);
    },

    async createOrderItem(input) {
      return orderItemRepo.create(normalizeItemCreateInput(input));
    },

    async updateOrderItem(orderItemId, patch, context = { role: "admin" }) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      const prev = await orderItemRepo.getById(id);
      if (!prev) throw new Error("Order item not found");
      const order = await orderRepo.getById(prev.order_id);
      if (!order) throw new Error("Order not found");
      assertOrderCanEditItems({ role: context?.role || "admin", status: order.status });
      return orderItemRepo.update(id, normalizeItemPatch(patch));
    },

    async removeOrderItem(orderItemId) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      return orderItemRepo.remove(id);
    },

    async updateOrderStatus(orderId, nextStatus, context = {}) {
      const id = s(orderId);
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
      if (!allowed && !force) {
        throw new Error(`Invalid order status transition: ${from} -> ${to}`);
      }
      if (!allowed && force && !reason) {
        throw new Error("Override reason is required for forced order status change.");
      }

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
  };
}

export const orderService = createOrderService();
