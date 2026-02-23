// ============================
// UK_Main.gs  (UPDATED ROUTER)
// - Contains ONLY doPost + parsing + routing
// - Auth + Cart routes remain unchanged
// - Orders/Shipments refactored to NEW allocation-based model
// - Handlers live in separate files
// - Uses existing UK_Utils.gs + UK_AuthChecks.gs (unchanged)
// ============================

function doPost(e) {
  try {
    const body = ukParseBody_(e);
    const action = String(body.action || "").trim();

    if (!action) return ukJson_({ success: false, error: "Missing action" });

    function _ret(v) {
      if (v && typeof v.getContent === "function") return v;
      return ukJson_(v == null ? { success: true } : v);
    }

    // ----------------------------
    // UK auth / session endpoints (UNCHANGED)
    // ----------------------------
    if (action === "uk_login") return _ret(UK_handleLogin(body));
    if (action === "uk_check_access") return _ret(UK_handleCheckAccess(body));

    // ----------------------------
    // UK cart endpoints (UNCHANGED)
    // ----------------------------
    if (action === "uk_cart_add_item") return _ret(UK_handleCartAddItem(body));
    if (action === "uk_cart_update_item") return _ret(UK_handleCartUpdateItem(body));
    if (action === "uk_cart_delete_item") return _ret(UK_handleCartDeleteItem(body));
    if (action === "uk_cart_get_items") return _ret(UK_handleCartGetItems(body));
    if (action === "uk_cart_clear") return _ret(UK_handleCartClear(body));

    // ----------------------------
    // UK orders endpoints (REFRESHED for NEW SCHEMA)
    // ----------------------------
    if (action === "uk_create_order") return _ret(UK_handleCreateOrder(body));                // creates order + items, status=submitted
    if (action === "uk_get_orders") return _ret(UK_handleGetOrders(body));                    // list orders (role aware)
    if (action === "uk_get_order_items") return _ret(UK_handleGetOrderItems(body));           // list items for an order

    // Edits (role+status guarded inside handlers)
    if (action === "uk_update_order") return _ret(UK_handleUpdateOrder(body));                // header only (name/cancel notes, etc)
    if (action === "uk_update_order_items") return _ret(UK_handleUpdateOrderItems(body));    // draft qty edits (customer) OR pricing edits (admin)
    if (action === "uk_delete_order_items") return _ret(UK_handleDeleteOrderItems(body));    // usually draft only
    if (action === "uk_delete_order") return _ret(UK_handleDeleteOrder(body));               // admin only (not delivered)

    // ----------------------------
    // UK order status transitions (NEW, recommended)
    // ----------------------------
    if (action === "uk_order_submit") return _ret(UK_handleOrderSubmit(body));                // draft -> submitted (optional if you still create as submitted)
    if (action === "uk_order_price") return _ret(UK_handleOrderPrice(body));                  // submitted/under_review -> priced (admin)
    if (action === "uk_order_customer_counter") return _ret(UK_handleOrderCustomerCounter(body)); // priced -> under_review (customer)
    if (action === "uk_order_accept_offer") return _ret(UK_handleOrderAcceptOffer(body));     // priced -> finalized (customer)
    if (action === "uk_order_finalize") return _ret(UK_handleOrderFinalize(body));            // priced/under_review -> finalized (admin)
    if (action === "uk_order_start_processing") return _ret(UK_handleOrderStartProcessing(body)); // finalized -> processing (admin)
    if (action === "uk_order_cancel") return _ret(UK_handleOrderCancel(body));                // any -> cancelled (admin)

    // Admin override (optional; keep if you want)
    if (action === "uk_update_order_status") return _ret(UK_handleUpdateOrderStatus(body));

    // ----------------------------
    // UK shipments endpoints (ADMIN ONLY) (KEEP CRUD)
    // ----------------------------
    if (action === "uk_shipment_create") return _ret(UK_handleShipmentCreate(body));
    if (action === "uk_shipment_get_all") return _ret(UK_handleShipmentGetAll(body));
    if (action === "uk_shipment_get_one") return _ret(UK_handleShipmentGetOne(body));
    if (action === "uk_shipment_update") return _ret(UK_handleShipmentUpdate(body));
    if (action === "uk_shipment_delete") return _ret(UK_handleShipmentDelete(body));

    // ----------------------------
    // Shipment Allocation (ADMIN ONLY)  <-- replaces old shipment↔order linking
    // ----------------------------
    if (action === "uk_allocation_create") return _ret(UK_handleAllocationCreate(body));
    if (action === "uk_allocation_update") return _ret(UK_handleAllocationUpdate(body));
    if (action === "uk_allocation_delete") return _ret(UK_handleAllocationDelete(body));
    if (action === "uk_allocation_get_for_shipment") return _ret(UK_handleAllocationGetForShipment(body));
    if (action === "uk_allocation_get_for_order") return _ret(UK_handleAllocationGetForOrder(body));

    // Optional helper: suggest allocation rows based on remaining qty
    if (action === "uk_allocation_suggest_for_shipment") return _ret(UK_handleAllocationSuggestForShipment(body));

    // ----------------------------
    // Pricing modes (ADMIN ONLY)
    // ----------------------------
    if (action === "uk_pricing_mode_get_all") return _ret(UK_handlePricingModeGetAll(body));
    if (action === "uk_pricing_mode_create") return _ret(UK_handlePricingModeCreate(body));
    if (action === "uk_pricing_mode_update") return _ret(UK_handlePricingModeUpdate(body));
    if (action === "uk_pricing_mode_delete") return _ret(UK_handlePricingModeDelete(body)); // or deactivate

    // ----------------------------
    // Users CRUD (ADMIN ONLY)
    // ----------------------------
    if (action === "uk_user_get_all") return _ret(UK_handleUserGetAll(body));
    if (action === "uk_user_get_one") return _ret(UK_handleUserGetOne(body));
    if (action === "uk_user_create") return _ret(UK_handleUserCreate(body));
    if (action === "uk_user_update") return _ret(UK_handleUserUpdate(body));
    if (action === "uk_user_delete") return _ret(UK_handleUserDelete(body));

    // ----------------------------
    // Recompute / rollups (ADMIN ONLY but safe)
    // ----------------------------
    if (action === "uk_recompute_order") return _ret(UK_handleRecomputeOrder(body));
    if (action === "uk_recompute_shipment") return _ret(UK_handleRecomputeShipment(body));

    // ----------------------------
    // Debug helper
    // ----------------------------
    if (action === "uk_debug_sheets") return _ret(UK_handleDebugSheets(body));
    if (action === "uk_setup_sheets") return _ret(UK_handleSetupSheets(body));

    // ----------------------------
    // Removed legacy shipment↔order APIs (DO NOT ROUTE)
    // - uk_shipment_add_orders / remove_orders / get_orders
    // - uk_shipment_get_shipments_for_order
    // - uk_order_set_shipment / order_shipment_recalculate / set_profit
    // - uk_order_items_bulk_update_weights
    // - uk_customer_set_under_review (replaced by uk_order_customer_counter)
    // ----------------------------

    return ukJson_({ success: false, error: "Invalid action" });
  } catch (err) {
    const stack = (err && err.stack) ? String(err.stack) : "";
    return ukJson_({
      success: false,
      error: (err && err.message) ? err.message : String(err),
      stack: stack,
    });
  }
}

/**
 * Parse body from:
 * 1) application/x-www-form-urlencoded: data=<JSON_STRING>
 * 2) application/json OR text/plain containing JSON
 */
function ukParseBody_(e) {
  let body = {};
  if (e && e.parameter && e.parameter.data) {
    body = JSON.parse(e.parameter.data || "{}");
  } else if (e && e.postData && e.postData.contents) {
    body = JSON.parse(e.postData.contents || "{}");
  }
  return body || {};
}

function UK_handleDebugSheets(body) {
  const ss = ukOpenSS_();
  const email = String((body && body.email) || "").trim();
  if (email) {
    const auth = ukRequireActiveUser_(email);
    if (!auth.ok) return ukJson_({ success: false, error: auth.error });
  }

  const sheets = ss.getSheets().map((s) => s.getName());
  return ukJson_({
    success: true,
    spreadsheet_id: ukSpreadsheetId_(),
    spreadsheet_name: ss.getName(),
    sheet_names: sheets,
    code_marker: "uk-router-2026-02-23-v2",
  });
}
