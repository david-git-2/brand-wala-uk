import { orderRepo as defaultOrderRepo } from "@/infra/firebase/repos/orderRepo";
import { orderItemRepo as defaultOrderItemRepo } from "@/infra/firebase/repos/orderItemRepo";

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

export function createOrderService(orderRepo = defaultOrderRepo, orderItemRepo = defaultOrderItemRepo) {
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

    async createOrder(input) {
      return orderRepo.create(normalizeOrderCreateInput(input));
    },

    async updateOrder(orderId, patch) {
      const id = s(orderId);
      if (!id) throw new Error("order_id is required");
      return orderRepo.update(id, normalizeOrderPatch(patch));
    },

    async removeOrder(orderId) {
      const id = s(orderId);
      if (!id) throw new Error("order_id is required");
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

    async updateOrderItem(orderItemId, patch) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      return orderItemRepo.update(id, normalizeItemPatch(patch));
    },

    async removeOrderItem(orderItemId) {
      const id = s(orderItemId);
      if (!id) throw new Error("order_item_id is required");
      return orderItemRepo.remove(id);
    },
  };
}

export const orderService = createOrderService();
