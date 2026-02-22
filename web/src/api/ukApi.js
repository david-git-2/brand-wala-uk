// ============================
// src/api/ukApi.js
// - Apps Script JSON POST helper
// - Cart uses product_id PK
// - Orders + Shipments + Shipment Orders added
// ============================

function apiUrl() {
  const u = window.BW_CONFIG?.API_URL;
  if (!u) throw new Error("Missing BW_CONFIG.API_URL");
  return u;
}

// Apps Script expects raw JSON in body
async function post(action, payload = {}) {
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Invalid JSON response from API");
  if (data.success !== true) throw new Error(data.error || "Request failed");
  return data;
}

export const UK_API = {
  // ============================
  // auth
  // ============================
  login: (email) => post("uk_login", { email }),
  checkAccess: (email) => post("uk_check_access", { email }),

  // ============================
  // orders
  // ============================
  // Server: body.order_name (snake_case)
  createOrder: (email, order_name) => post("uk_create_order", { email, order_name }),

  updateOrderItems: (email, order_id, items) =>
    post("uk_update_order_items", { email, order_id, items }),

  deleteOrderItems: (email, order_id, barcodes) =>
    post("uk_delete_order_items", { email, order_id, barcodes }),

  getOrderItems: (email, order_id) => post("uk_get_order_items", { email, order_id }),

  getOrders: (email, only_mine) =>
    post("uk_get_orders", {
      email,
      ...(typeof only_mine === "boolean" ? { only_mine } : {}),
    }),

  // patch is flattened in server handler; keep consistent
  updateOrder: (email, order_id, patch = {}) =>
    post("uk_update_order", { email, order_id, ...patch }),

  deleteOrder: (email, order_id) => post("uk_delete_order", { email, order_id }),

  // ============================
  // cart (PRODUCT_ID PRIMARY KEY)
  // ============================
  cartGetItems: (email) => post("uk_cart_get_items", { email }),

  cartAddItem: (email, item) => post("uk_cart_add_item", { email, item }),

  cartUpdateItem: (email, product_id, quantity) =>
    post("uk_cart_update_item", { email, product_id, quantity }),

  cartDeleteItem: (email, product_id) => post("uk_cart_delete_item", { email, product_id }),

  cartClear: (email) => post("uk_cart_clear", { email }),

  // ============================
  // shipments (ADMIN ONLY)
  // ============================
  shipmentCreate: (email, payload) => post("uk_shipment_create", { email, ...payload }),

  shipmentGetAll: (email) => post("uk_shipment_get_all", { email }),

  shipmentGetOne: (email, shipment_id) => post("uk_shipment_get_one", { email, shipment_id }),

  shipmentUpdate: (email, shipment_id, patch = {}) =>
    post("uk_shipment_update", { email, shipment_id, patch }),

  shipmentDelete: (email, shipment_id) => post("uk_shipment_delete", { email, shipment_id }),

  // ============================
  // shipment orders (ADMIN ONLY)
  // ============================
  shipmentAddOrders: (email, shipment_id, order_ids) =>
    post("uk_shipment_add_orders", { email, shipment_id, order_ids }),

  shipmentRemoveOrders: (email, shipment_id, order_ids) =>
    post("uk_shipment_remove_orders", { email, shipment_id, order_ids }),

  shipmentGetOrders: (email, shipment_id) =>
    post("uk_shipment_get_orders", { email, shipment_id }),

  shipmentGetShipmentsForOrder: (email, order_id) =>
    post("uk_shipment_get_shipments_for_order", { email, order_id }),

  orderSetShipment: (email, order_id, shipment_id) =>
    post("uk_order_set_shipment", { email, order_id, shipment_id }),

  // ✅ NEW: recalculate totals using current shipment values
  orderShipmentRecalculate: (email, order_id) =>
    post("uk_order_shipment_recalculate", { email, order_id }),

  orderSetProfit: (email, order_id, profit_rate, profit_on_just_product) =>
    post("uk_order_set_profit", { email, order_id, profit_rate, profit_on_just_product }),
  orderItemsBulkUpdateWeights: (email, order_id, rows) =>
  post("uk_order_items_bulk_update_weights", { email, order_id, rows }),
  // Update only status (ADMIN ONLY)
updateOrderStatus: (email, order_id, status) =>
  post("uk_update_order_status", { email, order_id, status }),
customerUpdateOrderItems: (email, order_id, items) =>
  post("uk_customer_update_order_items", { email, order_id, items }),

customerSetUnderReview: (email, order_id) =>
  post("uk_customer_set_under_review", { email, order_id }),
};