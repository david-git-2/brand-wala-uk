// ============================
// src/api/ukApi.js  (FIXED: product_id for cart update/delete)
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
  // auth
  login: (email) => post("uk_login", { email }),
  checkAccess: (email) => post("uk_check_access", { email }),

  // orders
  createOrder: (email, orderName, status, items) =>
    post("uk_create_order", { email, orderName, status, items }),

  updateOrderItems: (email, orderId, items) =>
    post("uk_update_order_items", { email, orderId, items }),

  deleteOrderItems: (email, orderId, barcodes) =>
    post("uk_delete_order_items", { email, orderId, barcodes }),

  getOrderItems: (email, orderId) => post("uk_get_order_items", { email, orderId }),

  getOrders: (email) => post("uk_get_orders", { email }),

  updateOrder: (email, orderId, patch = {}) =>
    post("uk_update_order", { email, orderId, ...patch }),

  deleteOrder: (email, orderId) => post("uk_delete_order", { email, orderId }),

  // ============================
  // cart (PRODUCT_ID PRIMARY KEY)
  // ============================
  cartGetItems: (email) => post("uk_cart_get_items", { email }),

  cartAddItem: (email, item) => post("uk_cart_add_item", { email, item }),

  // ✅ now uses product_id (not barcode)
  cartUpdateItem: (email, product_id, quantity) =>
    post("uk_cart_update_item", { email, product_id, quantity }),

  // ✅ now uses product_id (not barcode)
  cartDeleteItem: (email, product_id) =>
    post("uk_cart_delete_item", { email, product_id }),

  cartClear: (email) => post("uk_cart_clear", { email }),
};