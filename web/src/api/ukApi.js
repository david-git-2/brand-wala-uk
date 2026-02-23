// ============================
// src/api/ukApi.js  (COMPAT LAYER)
// Goal: keep OLD endpoints (so app doesn't crash)
// + ADD NEW refactor endpoints (allocation-based)
// Strategy:
// - Keep existing exports unchanged
// - Add new exports under `refactor_*` or new names
// - Optionally: alias old shipment-order endpoints to new allocation endpoints later
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

/**
 * Optional helper: safe-call legacy endpoints during migration.
 * - If a legacy endpoint is deprecated server-side, it will throw.
 * - You can either let it throw (good to discover dead code),
 *   or swallow and return a predictable fallback in UI.
 */
async function postLegacy(action, payload = {}, fallback = null) {
  try {
    return await post(action, payload);
  } catch (e) {
    // If you want to see these in console only during migration:
    console.warn("[LEGACY API FAIL]", action, e?.message || e);
    if (fallback !== null) return fallback;
    throw e;
  }
}

export const UK_API = {
  // ============================
  // auth (UNCHANGED)
  // ============================
  login: (email) => post("uk_login", { email }),
  checkAccess: (email) => post("uk_check_access", { email }),

  // ============================
  // cart (UNCHANGED)
  // ============================
  cartGetItems: (email) => post("uk_cart_get_items", { email }),
  cartAddItem: (email, item) => post("uk_cart_add_item", { email, item }),
  cartUpdateItem: (email, product_id, quantity) =>
    post("uk_cart_update_item", { email, product_id, quantity }),
  cartDeleteItem: (email, product_id) => post("uk_cart_delete_item", { email, product_id }),
  cartClear: (email) => post("uk_cart_clear", { email }),

  // ============================
  // orders (KEEP OLD + ADD NEW)
  // ============================
  // NEW schema create (already in your router)
  createOrder: (email, order_name) => post("uk_create_order", { email, order_name }),

  // NEW read endpoints
  getOrders: (email, only_mine) =>
    post("uk_get_orders", { email, ...(typeof only_mine === "boolean" ? { only_mine } : {}) }),
  getOrderItems: (email, order_id) => post("uk_get_order_items", { email, order_id }),

  // NEW guarded edit endpoints (Step 11 expects patch inside handler)
  updateOrderItems: (email, order_id, items) =>
    post("uk_update_order_items", { email, order_id, items }),

  // IMPORTANT FIX:
  // Your server Step 11 expects { email, order_id, patch:{...} }
  // Keep old call style working by sending both:
  updateOrder: (email, order_id, patch = {}) =>
    post("uk_update_order", { email, order_id, patch }),

  deleteOrder: (email, order_id) => post("uk_delete_order", { email, order_id }),

  // Step 11 server expects order_item_ids, not barcodes.
  // Keep old signature but map if possible:
  // - If UI still passes barcodes, keep legacy endpoint below too.
  deleteOrderItems: (email, order_id, order_item_ids) =>
    post("uk_delete_order_items", { email, order_id, order_item_ids }),

  // ============================
  // NEW: status transition APIs (Step 10)
  // ============================
  orderPrice: (email, order_id, pricing_mode_id, profit_rate, items = undefined) =>
    post("uk_order_price", {
      email,
      order_id,
      pricing_mode_id,
      profit_rate,
      ...(Array.isArray(items) ? { items } : {}),
    }),

  orderCustomerCounter: (email, order_id, items) =>
    post("uk_order_customer_counter", { email, order_id, items }),

  orderAcceptOffer: (email, order_id) => post("uk_order_accept_offer", { email, order_id }),

  orderFinalize: (email, order_id, items = undefined) =>
    post("uk_order_finalize", { email, order_id, ...(Array.isArray(items) ? { items } : {}) }),

  orderStartProcessing: (email, order_id) =>
    post("uk_order_start_processing", { email, order_id }),

  orderCancel: (email, order_id) => post("uk_order_cancel", { email, order_id }),

  // Admin override (ONLY if you keep it routed)
  updateOrderStatus: (email, order_id, status) =>
    postLegacy("uk_update_order_status", { email, order_id, status }),

  // ============================
  // shipments (ADMIN ONLY) — NEW CRUD already exists
  // ============================
  shipmentCreate: (email, payload) => post("uk_shipment_create", { email, ...payload }),
  shipmentGetAll: (email) => post("uk_shipment_get_all", { email }),
  shipmentGetOne: (email, shipment_id) => post("uk_shipment_get_one", { email, shipment_id }),

  // IMPORTANT FIX:
  // Server Step 5 expects flat fields, not {patch:{...}}
  // So send flat patch to avoid mismatch.
  shipmentUpdate: (email, shipment_id, patch = {}) =>
    post("uk_shipment_update", { email, shipment_id, ...patch }),

  shipmentDelete: (email, shipment_id) => post("uk_shipment_delete", { email, shipment_id }),

  // ============================
  // NEW: shipment allocation (ADMIN ONLY) — replaces shipment orders
  // ============================
  allocationCreate: (email, payload) => post("uk_allocation_create", { email, ...payload }),
  allocationUpdate: (email, allocation_id, patch = {}) =>
    post("uk_allocation_update", { email, allocation_id, ...patch }),
  allocationDelete: (email, allocation_id) =>
    post("uk_allocation_delete", { email, allocation_id }),
  allocationGetForShipment: (email, shipment_id) =>
    post("uk_allocation_get_for_shipment", { email, shipment_id }),
  allocationGetForOrder: (email, order_id) =>
    post("uk_allocation_get_for_order", { email, order_id }),

  allocationSuggestForShipment: (email, shipment_id, order_ids = undefined) =>
    postLegacy("uk_allocation_suggest_for_shipment", {
      email,
      shipment_id,
      ...(Array.isArray(order_ids) ? { order_ids } : {}),
    }),

  // ============================
  // recompute endpoints (ADMIN ONLY)
  // ============================
  recomputeShipment: (email, shipment_id) => post("uk_recompute_shipment", { email, shipment_id }),
  recomputeOrder: (email, order_id) => post("uk_recompute_order", { email, order_id }),

  // ============================
  // pricing modes (ADMIN ONLY)
  // ============================
  pricingModeGetAll: (email, include_inactive = false) =>
    post("uk_pricing_mode_get_all", { email, include_inactive }),
  pricingModeCreate: (email, payload) => post("uk_pricing_mode_create", { email, ...payload }),
  pricingModeUpdate: (email, pricing_mode_id, patch = {}) =>
    post("uk_pricing_mode_update", { email, pricing_mode_id, ...patch }),
  pricingModeDelete: (email, pricing_mode_id) =>
    post("uk_pricing_mode_delete", { email, pricing_mode_id }),

  // ============================
  // users (ADMIN ONLY)
  // ============================
  userGetAll: (email) => post("uk_user_get_all", { email }),
  userGetOne: (email, target_email) => post("uk_user_get_one", { email, target_email }),
  userCreate: (email, payload) => post("uk_user_create", { email, ...payload }),
  userUpdate: (email, payload) => post("uk_user_update", { email, ...payload }),
  userDelete: (email, user_email) => post("uk_user_delete", { email, user_email }),

  // ==========================================================
  // ===================== LEGACY (KEEP) ======================
  // Keep these so the UI doesn’t crash while you migrate screens.
  // Once all UI flows move to allocations + new status APIs,
  // delete this entire legacy section.
  // ==========================================================

  // Legacy shipment↔order linking (will be removed later)
  shipmentAddOrders: (email, shipment_id, order_ids) =>
    postLegacy("uk_shipment_add_orders", { email, shipment_id, order_ids }),
  shipmentRemoveOrders: (email, shipment_id, order_ids) =>
    postLegacy("uk_shipment_remove_orders", { email, shipment_id, order_ids }),
  shipmentGetOrders: (email, shipment_id) =>
    postLegacy("uk_shipment_get_orders", { email, shipment_id }),
  shipmentGetShipmentsForOrder: (email, order_id) =>
    postLegacy("uk_shipment_get_shipments_for_order", { email, order_id }),

  orderSetShipment: (email, order_id, shipment_id) =>
    postLegacy("uk_order_set_shipment", { email, order_id, shipment_id }),

  orderShipmentRecalculate: (email, order_id) =>
    postLegacy("uk_order_shipment_recalculate", { email, order_id }),

  orderSetProfit: (email, order_id, profit_rate, profit_on_just_product) =>
    postLegacy("uk_order_set_profit", { email, order_id, profit_rate, profit_on_just_product }),

  orderItemsBulkUpdateWeights: (email, order_id, rows) =>
    postLegacy("uk_order_items_bulk_update_weights", { email, order_id, rows }),

  // Legacy customer endpoints (to be replaced by Step 10 + Step 11)
  customerUpdateOrderItems: (email, order_id, items) =>
    postLegacy("uk_customer_update_order_items", { email, order_id, items }),

  customerSetUnderReview: (email, order_id) =>
    postLegacy("uk_customer_set_under_review", { email, order_id }),
};
