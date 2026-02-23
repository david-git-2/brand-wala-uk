/************** UK_Setup.gs **************/

function UK_setupSheets() {
  return UK_setupSheets_();
}

function UK_handleSetupSheets(body) {
  const user = ukRequireActiveUserOrThrow_(body || {});
  UK_assertAdmin_(user);
  return UK_setupSheets_();
}

function UK_setupSheets_() {
  const ss = ukOpenSS_();

  const defs = {
    users: ["email", "active", "role", "can_see_price_gbp", "name"],
    uk_cart_items: [
      "cart_item_sl", "cart_id", "user_email", "product_id", "barcode", "brand", "name",
      "image_url", "price_gbp", "case_size", "quantity", "created_at", "updated_at"
    ],
    uk_orders: [
      "order_id", "order_sl", "order_name", "creator_email", "creator_name", "creator_role", "creator_can_see_price_gbp",
      "status", "counter_enabled", "created_at", "updated_at",
      "total_order_qty", "total_allocated_qty", "total_shipped_qty", "total_remaining_qty",
      "total_revenue_bdt", "total_product_cost_bdt", "total_cargo_cost_bdt", "total_total_cost_bdt", "total_profit_bdt"
    ],
    uk_order_items: [
      "order_item_id", "item_sl", "order_id", "product_id", "barcode", "brand", "name", "image_url", "case_size",
      "ordered_quantity", "pricing_mode_id", "profit_rate",
      "offered_unit_gbp", "customer_unit_gbp", "final_unit_gbp",
      "offered_unit_bdt", "customer_unit_bdt", "final_unit_bdt",
      "buy_price_gbp",
      "allocated_qty_total", "shipped_qty_total", "remaining_qty", "item_status"
    ],
    uk_shipments: [
      "shipment_id", "name", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo",
      "cargo_cost_per_kg", "created_at", "updated_at", "status"
    ],
    uk_shipment_allocation: [
      "allocation_id", "shipment_id", "order_id", "order_item_id", "product_id",
      "allocated_qty", "shipped_qty",
      "unit_product_weight", "unit_package_weight", "unit_total_weight", "allocated_weight", "shipped_weight",
      "pricing_mode_id", "buy_price_gbp", "product_cost_gbp", "product_cost_bdt",
      "cargo_cost_gbp", "cargo_cost_bdt", "revenue_bdt", "profit_bdt", "total_cost_bdt"
    ],
    uk_pricing_modes: [
      "pricing_mode_id", "name", "version", "currency", "profit_base", "cargo_charge",
      "conversion_rule", "rate_source_revenue", "active", "notes"
    ]
  };

  const out = [];

  Object.keys(defs).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    const created = !sh;
    if (!sh) sh = ss.insertSheet(name);

    sh.clear();
    const headers = defs[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);

    out.push({ sheet: name, created: created, columns: headers.length });
  });

  return { success: true, spreadsheet_id: ukSpreadsheetId_(), sheets: out };
}
