/************** UK_Allocation_Handlers.gs **************/

function UK_handleAllocationCreate(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  ukRequireFields_(body, ["shipment_id", "order_item_id", "allocated_qty"]);

  const shipment_id = String(body.shipment_id || "").trim();
  const order_item_id = String(body.order_item_id || "").trim();
  const allocated_qty = ukNum_(body.allocated_qty, 0);
  const shipped_qty = ukNum_(body.shipped_qty, 0);
  if (allocated_qty <= 0) throw new Error("allocated_qty must be > 0");
  if (shipped_qty < 0) throw new Error("shipped_qty cannot be negative");

  const item = UK_allocGetOrderItemMeta_(order_item_id);
  UK_assertNoOverShip_(order_item_id, shipped_qty, "");

  const sh = ukGetSheet_("uk_shipment_allocation");
  const m = UK_getMapStrict_(sh, [
    "allocation_id", "shipment_id", "order_id", "order_item_id", "product_id",
    "allocated_qty", "shipped_qty", "unit_product_weight", "unit_package_weight",
    "unit_total_weight", "allocated_weight", "shipped_weight",
    "pricing_mode_id", "buy_price_gbp", "product_cost_gbp", "product_cost_bdt",
    "cargo_cost_gbp", "cargo_cost_bdt", "revenue_bdt", "profit_bdt", "total_cost_bdt"
  ]);

  const upw = ukNumOrBlank_(body.unit_product_weight);
  const upkg = ukNumOrBlank_(body.unit_package_weight);
  const utw = ukNum_(upw, 0) + ukNum_(upkg, 0);

  const row = new Array(sh.getLastColumn()).fill("");
  row[m.allocation_id] = String(body.allocation_id || ukMakeId_("ALC")).trim();
  row[m.shipment_id] = shipment_id;
  row[m.order_id] = item.order_id;
  row[m.order_item_id] = order_item_id;
  row[m.product_id] = item.product_id;

  row[m.allocated_qty] = allocated_qty;
  row[m.shipped_qty] = shipped_qty;
  row[m.unit_product_weight] = upw;
  row[m.unit_package_weight] = upkg;
  row[m.unit_total_weight] = utw;
  row[m.allocated_weight] = allocated_qty * utw;
  row[m.shipped_weight] = shipped_qty * utw;

  row[m.pricing_mode_id] = "";
  row[m.buy_price_gbp] = "";
  row[m.product_cost_gbp] = "";
  row[m.product_cost_bdt] = "";
  row[m.cargo_cost_gbp] = "";
  row[m.cargo_cost_bdt] = "";
  row[m.revenue_bdt] = "";
  row[m.profit_bdt] = "";
  row[m.total_cost_bdt] = "";

  sh.appendRow(row);
  return { success: true, allocation_id: row[m.allocation_id] };
}

function UK_handleAllocationUpdate(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const allocation_id = String(body.allocation_id || "").trim();
  if (!allocation_id) throw new Error("allocation_id is required");

  const sh = ukGetSheet_("uk_shipment_allocation");
  const m = UK_getMapStrict_(sh, [
    "allocation_id", "shipment_id", "order_id", "order_item_id", "product_id",
    "allocated_qty", "shipped_qty", "unit_product_weight", "unit_package_weight",
    "unit_total_weight", "allocated_weight", "shipped_weight"
  ]);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error("Allocation not found: " + allocation_id);
  const range = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
  const data = range.getValues();

  let idx = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][m.allocation_id]) === allocation_id) { idx = i; break; }
  }
  if (idx === -1) throw new Error("Allocation not found: " + allocation_id);

  const row = data[idx];
  const oldOrderItemId = String(row[m.order_item_id] || "");
  if (body.order_item_id !== undefined && String(body.order_item_id || "") !== oldOrderItemId) {
    throw new Error("order_item_id cannot be changed on update");
  }

  const newShipped = body.shipped_qty !== undefined ? ukNum_(body.shipped_qty, 0) : ukNum_(row[m.shipped_qty], 0);
  if (newShipped < 0) throw new Error("shipped_qty cannot be negative");
  UK_assertNoOverShip_(oldOrderItemId, newShipped, allocation_id);

  if (body.shipment_id !== undefined) row[m.shipment_id] = String(body.shipment_id || "").trim();
  if (body.allocated_qty !== undefined) {
    const q = ukNum_(body.allocated_qty, 0);
    if (q < 0) throw new Error("allocated_qty cannot be negative");
    row[m.allocated_qty] = q;
  }
  row[m.shipped_qty] = newShipped;

  if (body.unit_product_weight !== undefined) row[m.unit_product_weight] = ukNumOrBlank_(body.unit_product_weight);
  if (body.unit_package_weight !== undefined) row[m.unit_package_weight] = ukNumOrBlank_(body.unit_package_weight);

  const utw = ukNum_(row[m.unit_product_weight], 0) + ukNum_(row[m.unit_package_weight], 0);
  row[m.unit_total_weight] = utw;
  row[m.allocated_weight] = ukNum_(row[m.allocated_qty], 0) * utw;
  row[m.shipped_weight] = ukNum_(row[m.shipped_qty], 0) * utw;

  data[idx] = row;
  range.setValues(data);

  return { success: true, allocation_id: allocation_id };
}

function UK_handleAllocationDelete(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const allocation_id = String(body.allocation_id || "").trim();
  if (!allocation_id) throw new Error("allocation_id is required");

  const sh = ukGetSheet_("uk_shipment_allocation");
  const m = UK_getMapStrict_(sh, ["allocation_id"]);
  const found = ukFindRowIndexById_(sh, m.allocation_id, allocation_id);
  if (found.rowIndex < 0) throw new Error("Allocation not found: " + allocation_id);

  sh.deleteRow(found.rowIndex);
  return { success: true, allocation_id: allocation_id };
}

function UK_handleAllocationGetForShipment(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  const sh = ukGetSheet_("uk_shipment_allocation");
  const rows = ukReadObjects_(sh).rows.filter(function(r) { return String(r.shipment_id || "") === shipment_id; });

  return { success: true, shipment_id: shipment_id, allocations: rows };
}

function UK_handleAllocationGetForOrder(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const sh = ukGetSheet_("uk_shipment_allocation");
  const rows = ukReadObjects_(sh).rows.filter(function(r) { return String(r.order_id || "") === order_id; });

  return { success: true, order_id: order_id, allocations: rows };
}

function UK_handleAllocationSuggestForShipment(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  const order_id = String(body.order_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");
  if (!order_id) throw new Error("order_id is required");

  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id", "ordered_quantity", "shipped_qty_total"]);

  const rows = ukReadObjects_(shItems).rows.filter(function(r) { return String(r.order_id || "") === order_id; });

  const suggestions = rows
    .map(function(r) {
      const remaining = ukNum_(r.ordered_quantity, 0) - ukNum_(r.shipped_qty_total, 0);
      return {
        shipment_id: shipment_id,
        order_id: order_id,
        order_item_id: r.order_item_id,
        allocated_qty: remaining > 0 ? remaining : 0,
        shipped_qty: 0,
      };
    })
    .filter(function(x) { return x.allocated_qty > 0; });

  return { success: true, shipment_id: shipment_id, order_id: order_id, suggestions: suggestions };
}

function UK_allocGetOrderItemMeta_(order_item_id) {
  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id", "product_id"]);
  const row = ukFindRowById_(shItems, mI.order_item_id, order_item_id);
  if (!row) throw new Error("order_item_id not found: " + order_item_id);
  return {
    order_id: row[mI.order_id],
    product_id: row[mI.product_id],
  };
}
