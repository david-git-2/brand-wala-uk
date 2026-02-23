/************** UK_Recompute.gs **************
Step 8 — Recompute Shipment totals

Implements:
- UK_handleRecomputeShipment(body)
- internal helper: UK_recomputeShipment_(shipment_id)
- internal helper: UK_computeAllocationAmounts_(ctx)

What it does (for ALL allocation rows in a shipment):
- Re-derives weights (unit_total_weight, allocated_weight, shipped_weight)
- Looks up:
  - shipment rates + cargo_cost_per_kg from uk_shipments
  - buy_price_gbp + pricing_mode_id + profit_rate + final_unit_* from uk_order_items
  - pricing mode config from uk_pricing_modes
- Computes (with rounding rules):
  - product_cost_gbp / product_cost_bdt
  - cargo_cost_gbp / cargo_cost_bdt
  - revenue_bdt
  - total_cost_bdt
  - profit_bdt (based on profit_base)

Depends on Step 2:
- UK_getMapStrict_(sheet, requiredCols)
- UK_assertAdmin_(user)
- UK_roundGBP_(n)  // 2dp
- UK_roundBDT_(n)  // 0dp
**************************************************/

function UK_handleRecomputeShipment(body) {
  body = body || {};

  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  UK_recomputeShipment_(shipment_id);

  return { success: true, shipment_id };
}

function UK_recomputeShipment_(shipment_id) {
  const ss = ukOpenSS_();

  const shAlloc = ss.getSheetByName("uk_shipment_allocation");
  const shShip = ss.getSheetByName("uk_shipments");
  const shItems = ss.getSheetByName("uk_order_items");
  const shPM = ss.getSheetByName("uk_pricing_modes");

  if (!shAlloc) throw new Error("Missing sheet: uk_shipment_allocation");
  if (!shShip) throw new Error("Missing sheet: uk_shipments");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");
  if (!shPM) throw new Error("Missing sheet: uk_pricing_modes");

  // ---- Strict columns ----
  const allocReq = [
    "allocation_id",
    "shipment_id",
    "order_id",
    "order_item_id",
    "product_id",
    "allocated_qty",
    "shipped_qty",
    "unit_product_weight",
    "unit_package_weight",
    "unit_total_weight",
    "allocated_weight",
    "shipped_weight",
    "pricing_mode_id",
    "buy_price_gbp",
    "product_cost_gbp",
    "product_cost_bdt",
    "cargo_cost_gbp",
    "cargo_cost_bdt",
    "revenue_bdt",
    "profit_bdt",
    "total_cost_bdt"
  ];
  const shipReq = [
    "shipment_id",
    "gbp_avg_rate",
    "gbp_rate_product",
    "gbp_rate_cargo",
    "cargo_cost_per_kg"
  ];
  const pmReq = [
    "pricing_mode_id",
    "currency",
    "profit_base",
    "cargo_charge",
    "conversion_rule",
    "rate_source_revenue",
    "active"
  ];
  const itemReq = [
    "order_item_id",
    "product_id",
    "pricing_mode_id",
    "profit_rate",
    "final_unit_gbp",
    "final_unit_bdt",
    "buy_price_gbp"
  ];

  const mA = UK_getMapStrict_(shAlloc, allocReq);
  const mS = UK_getMapStrict_(shShip, shipReq);
  const mPM = UK_getMapStrict_(shPM, pmReq);
  const mI = UK_getMapStrict_(shItems, itemReq);

  // ---- Load shipment row ----
  const shipment = ukFindRowById_(shShip, mS.shipment_id, shipment_id);
  if (!shipment) throw new Error(`Shipment not found: ${shipment_id}`);

  const shipCtx = {
    shipment_id: shipment_id,
    gbp_avg_rate: ukNum_(shipment[mS.gbp_avg_rate]),
    gbp_rate_product: ukNum_(shipment[mS.gbp_rate_product]),
    gbp_rate_cargo: ukNum_(shipment[mS.gbp_rate_cargo]),
    cargo_cost_per_kg: ukNum_(shipment[mS.cargo_cost_per_kg])
  };

  // ---- Cache pricing modes ----
  const pmMap = _buildIdMap_(shPM, mPM.pricing_mode_id);

  // ---- Read allocations for this shipment ----
  const lastRowA = shAlloc.getLastRow();
  if (lastRowA < 2) return;

  const rangeA = shAlloc.getRange(2, 1, lastRowA - 1, shAlloc.getLastColumn());
  const dataA = rangeA.getValues();

  // Collect order_item_ids used in this shipment
  const neededItemIds = {};
  let hasAny = false;
  for (let i = 0; i < dataA.length; i++) {
    if (String(dataA[i][mA.shipment_id]) !== shipment_id) continue;
    hasAny = true;
    const oid = String(dataA[i][mA.order_item_id] || "").trim();
    if (oid) neededItemIds[oid] = true;
  }
  if (!hasAny) return;

  // Cache needed order_items (order_item_id -> row)
  const itemMap = _buildIdMapFiltered_(shItems, mI.order_item_id, neededItemIds);

  // ---- Recompute allocation rows in-memory ----
  let changed = false;

  for (let i = 0; i < dataA.length; i++) {
    const r = dataA[i];
    if (String(r[mA.shipment_id]) !== shipment_id) continue;

    const order_item_id = String(r[mA.order_item_id] || "").trim();
    const itemRow = itemMap[order_item_id];
    if (!itemRow) {
      // Keep row but can’t compute money without item; skip gracefully
      continue;
    }

    // Lookups from order_items
    const pricing_mode_id = String(itemRow[mI.pricing_mode_id] || "").trim();
    const profit_rate = ukNum_(itemRow[mI.profit_rate]);
    const buy_price_gbp = ukNum_(itemRow[mI.buy_price_gbp]);

    const final_unit_gbp = itemRow[mI.final_unit_gbp];
    const final_unit_bdt = itemRow[mI.final_unit_bdt];

    const product_id = String(itemRow[mI.product_id] || "").trim();

    const pm = pmMap[pricing_mode_id];
    if (!pm) {
      // If missing PM, still update basic linkage fields
      r[mA.pricing_mode_id] = pricing_mode_id;
      r[mA.buy_price_gbp] = UK_roundGBP_(buy_price_gbp);
      if (product_id) r[mA.product_id] = product_id;
      changed = true;
      continue;
    }

    // Build allocation ctx
    const allocCtx = {
      shipped_qty: ukNum_(r[mA.shipped_qty]),
      allocated_qty: ukNum_(r[mA.allocated_qty]),
      unit_product_weight: ukNum_(r[mA.unit_product_weight]),
      unit_package_weight: ukNum_(r[mA.unit_package_weight]),

      buy_price_gbp: buy_price_gbp,
      profit_rate: profit_rate,
      final_unit_gbp: final_unit_gbp,
      final_unit_bdt: final_unit_bdt,

      pricing_mode: {
        pricing_mode_id: pricing_mode_id,
        currency: String(pm[mPM.currency] || "").trim(),
        profit_base: String(pm[mPM.profit_base] || "").trim(),
        cargo_charge: String(pm[mPM.cargo_charge] || "").trim(),
        conversion_rule: String(pm[mPM.conversion_rule] || "").trim(),
        rate_source_revenue: String(pm[mPM.rate_source_revenue] || "").trim()
      },

      shipment: shipCtx
    };

    const amounts = UK_computeAllocationAmounts_(allocCtx);

    // Write derived weights
    r[mA.unit_total_weight] = amounts.unit_total_weight;
    r[mA.allocated_weight] = amounts.allocated_weight;
    r[mA.shipped_weight] = amounts.shipped_weight;

    // Link fields
    r[mA.pricing_mode_id] = pricing_mode_id;
    if (product_id) r[mA.product_id] = product_id;

    // Money fields
    r[mA.buy_price_gbp] = amounts.buy_price_gbp;
    r[mA.product_cost_gbp] = amounts.product_cost_gbp;
    r[mA.product_cost_bdt] = amounts.product_cost_bdt;
    r[mA.cargo_cost_gbp] = amounts.cargo_cost_gbp;
    r[mA.cargo_cost_bdt] = amounts.cargo_cost_bdt;
    r[mA.revenue_bdt] = amounts.revenue_bdt;
    r[mA.total_cost_bdt] = amounts.total_cost_bdt;
    r[mA.profit_bdt] = amounts.profit_bdt;

    changed = true;
  }

  if (changed) rangeA.setValues(dataA);

  // Optional: if you later add shipment total columns, compute & write them here.
}

/**
 * Core calculator for ONE allocation row, returning already-rounded outputs.
 * Enforces:
 * - GBP: 2dp
 * - BDT: 0dp
 */
function UK_computeAllocationAmounts_(ctx) {
  const shipped_qty = ukNum_(ctx.shipped_qty);
  const allocated_qty = ukNum_(ctx.allocated_qty);

  const unit_total_weight = ukNum_(ctx.unit_product_weight) + ukNum_(ctx.unit_package_weight);
  const allocated_weight = unit_total_weight * allocated_qty;
  const shipped_weight = unit_total_weight * shipped_qty;

  const buy_price_gbp = ukNum_(ctx.buy_price_gbp);
  const profit_rate = ukNum_(ctx.profit_rate);

  const pm = ctx.pricing_mode || {};
  const ship = ctx.shipment || {};

  // --- Product cost ---
  const product_cost_gbp = UK_roundGBP_(shipped_qty * buy_price_gbp);

  const product_cost_bdt = (String(pm.conversion_rule) === "SEPARATE_RATES")
    ? UK_roundBDT_(product_cost_gbp * ukNum_(ship.gbp_rate_product))
    : UK_roundBDT_(product_cost_gbp * ukNum_(ship.gbp_avg_rate));

  // --- Cargo cost ---
  const cargo_cost_gbp = UK_roundGBP_(shipped_weight * ukNum_(ship.cargo_cost_per_kg));

  const cargo_cost_bdt = (String(pm.conversion_rule) === "SEPARATE_RATES")
    ? UK_roundBDT_(cargo_cost_gbp * ukNum_(ship.gbp_rate_cargo))
    : UK_roundBDT_(cargo_cost_gbp * ukNum_(ship.gbp_avg_rate));

  // --- Revenue ---
  let revenue_bdt = 0;

  if (String(pm.currency) === "GBP") {
    // Determine sell_unit_gbp:
    // - if final_unit_gbp exists use it
    // - else buy_price_gbp * (1 + profit_rate)
    const hasFinal = !(ctx.final_unit_gbp === "" || ctx.final_unit_gbp === null || ctx.final_unit_gbp === undefined);
    const finalUnitNum = hasFinal ? Number(ctx.final_unit_gbp) : NaN;

    const sell_unit_gbp = hasFinal && isFinite(finalUnitNum)
      ? UK_roundGBP_(finalUnitNum)
      : UK_roundGBP_(buy_price_gbp * (1 + profit_rate));

    const product_revenue_gbp = UK_roundGBP_(shipped_qty * sell_unit_gbp);

    // Choose conversion rate for revenue_bdt
    const rs = String(pm.rate_source_revenue || "").toLowerCase();
    let rate = ukNum_(ship.gbp_avg_rate);
    if (rs === "product") rate = ukNum_(ship.gbp_rate_product) || rate;
    if (rs === "cargo") rate = ukNum_(ship.gbp_rate_cargo) || rate;
    if (rs === "avg" || rs === "") rate = ukNum_(ship.gbp_avg_rate) || rate;

    revenue_bdt = UK_roundBDT_(product_revenue_gbp * rate);

    // PASS_THROUGH means customer pays cargo separately,
    // but our stored revenue_bdt is "product revenue in BDT" (per your spec).
    // If you later want "customer_total_bdt", compute it in another column.
  } else if (String(pm.currency) === "BDT") {
    const landed_cost_bdt = UK_roundBDT_(product_cost_bdt + cargo_cost_bdt);

    const hasFinal = !(ctx.final_unit_bdt === "" || ctx.final_unit_bdt === null || ctx.final_unit_bdt === undefined);
    const finalUnitNum = hasFinal ? Number(ctx.final_unit_bdt) : NaN;

    if (hasFinal && isFinite(finalUnitNum)) {
      revenue_bdt = UK_roundBDT_(shipped_qty * finalUnitNum);
    } else {
      revenue_bdt = UK_roundBDT_(landed_cost_bdt * (1 + profit_rate));
    }
  } else {
    revenue_bdt = 0;
  }

  // --- Total cost + profit ---
  const total_cost_bdt = UK_roundBDT_(product_cost_bdt + cargo_cost_bdt);

  let profit_bdt = 0;
  if (String(pm.profit_base) === "PRODUCT_ONLY") {
    profit_bdt = UK_roundBDT_(revenue_bdt - product_cost_bdt);
  } else if (String(pm.profit_base) === "PRODUCT_PLUS_CARGO") {
    profit_bdt = UK_roundBDT_(revenue_bdt - total_cost_bdt);
  } else {
    // default safe: landed
    profit_bdt = UK_roundBDT_(revenue_bdt - total_cost_bdt);
  }

  return {
    // weights
    unit_total_weight: unit_total_weight,
    allocated_weight: allocated_weight,
    shipped_weight: shipped_weight,

    // money (already rounded per rules)
    buy_price_gbp: UK_roundGBP_(buy_price_gbp),
    product_cost_gbp: product_cost_gbp,
    product_cost_bdt: product_cost_bdt,
    cargo_cost_gbp: cargo_cost_gbp,
    cargo_cost_bdt: cargo_cost_bdt,
    revenue_bdt: revenue_bdt,
    total_cost_bdt: total_cost_bdt,
    profit_bdt: profit_bdt
  };
}

/************** internal helpers **************/

function _buildIdMap_(sheet, idColIdx0) {
  const lastRow = sheet.getLastRow();
  const out = {};
  if (lastRow < 2) return out;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    const id = String(data[i][idColIdx0] || "").trim();
    if (!id) continue;
    out[id] = data[i];
  }
  return out;
}

function _buildIdMapFiltered_(sheet, idColIdx0, allowedIdsObj) {
  const lastRow = sheet.getLastRow();
  const out = {};
  if (lastRow < 2) return out;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    const id = String(data[i][idColIdx0] || "").trim();
    if (!id) continue;
    if (!allowedIdsObj[id]) continue;
    out[id] = data[i];
  }
  return out;
}

/************** UK_Recompute.gs **************
Step 9 — Recompute Order totals + item status

Implements:
- UK_handleRecomputeOrder(body)
- internal helpers:
  - UK_recomputeOrder_(order_id)
  - UK_recomputeOrderStatus_(order_id, orderStatus)  // auto status update when processing/partial/delivered
  - UK_assertNoOverShipAll_(order_id)                // enforces shipped <= ordered per item (hard rule)

What it does:
1) For a given order_id:
   - Reads all order_items in the order
   - Reads all allocations for the order
   - Computes per item:
     allocated_qty_total, shipped_qty_total, remaining_qty, item_status
   - Writes those fields back to uk_order_items
2) Computes order totals in uk_orders from allocations (BDT totals must be integers):
   total_order_qty, total_allocated_qty, total_shipped_qty, total_remaining_qty,
   total_revenue_bdt, total_product_cost_bdt, total_cargo_cost_bdt, total_total_cost_bdt, total_profit_bdt
3) If order status is processing or partially_delivered:
   - if remaining == 0 -> delivered
   - else if shipped > 0 -> partially_delivered
   - else -> processing

Depends on Step 2:
- UK_getMapStrict_(sheet, requiredCols)
- UK_assertAdmin_(user)         (recommend admin-only recompute endpoint)
- UK_roundBDT_(n)
**************************************************/

function UK_handleRecomputeOrder(body) {
  body = body || {};

  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  UK_recomputeOrder_(order_id);

  return { success: true, order_id };
}

function UK_recomputeOrder_(order_id) {
  const ss = ukOpenSS_();

  const shOrders = ss.getSheetByName("uk_orders");
  const shItems = ss.getSheetByName("uk_order_items");
  const shAlloc = ss.getSheetByName("uk_shipment_allocation");

  if (!shOrders) throw new Error("Missing sheet: uk_orders");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");
  if (!shAlloc) throw new Error("Missing sheet: uk_shipment_allocation");

  // ---- Strict columns ----
  const ordersReq = [
    "order_id",
    "status",
    "updated_at",
    "total_order_qty",
    "total_allocated_qty",
    "total_shipped_qty",
    "total_remaining_qty",
    "total_revenue_bdt",
    "total_product_cost_bdt",
    "total_cargo_cost_bdt",
    "total_total_cost_bdt",
    "total_profit_bdt"
  ];

  const itemsReq = [
    "order_item_id",
    "order_id",
    "ordered_quantity",
    "allocated_qty_total",
    "shipped_qty_total",
    "remaining_qty",
    "item_status"
  ];

  const allocReq = [
    "order_id",
    "order_item_id",
    "allocated_qty",
    "shipped_qty",
    "revenue_bdt",
    "product_cost_bdt",
    "cargo_cost_bdt",
    "total_cost_bdt",
    "profit_bdt"
  ];

  const mO = UK_getMapStrict_(shOrders, ordersReq);
  const mI = UK_getMapStrict_(shItems, itemsReq);
  const mA = UK_getMapStrict_(shAlloc, allocReq);

  // ---- Load order row ----
  const orderFind = ukFindRowIndexById_(shOrders, mO.order_id, order_id);
  if (orderFind.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  const orderStatus = String(orderFind.row[mO.status] || "").trim().toLowerCase();

  // ---- Read all items for this order ----
  const itemsLastRow = shItems.getLastRow();
  if (itemsLastRow < 2) throw new Error(`No order_items found for order: ${order_id}`);

  const itemsRange = shItems.getRange(2, 1, itemsLastRow - 1, shItems.getLastColumn());
  const itemsData = itemsRange.getValues();

  // Collect item indices and quantities
  const itemIndexById = {}; // order_item_id -> itemsData index
  const orderedQtyById = {}; // order_item_id -> ordered_quantity
  const itemIds = [];

  let total_order_qty = 0;

  for (let i = 0; i < itemsData.length; i++) {
    const r = itemsData[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    if (!oid) continue;

    const orderedQty = ukNum_(r[mI.ordered_quantity]);

    itemIndexById[oid] = i;
    orderedQtyById[oid] = orderedQty;
    itemIds.push(oid);

    total_order_qty += orderedQty;
  }

  // It’s valid (though unusual) for order to have 0 items; handle gracefully
  if (!itemIds.length) {
    // still zero totals
    _writeOrderTotals_(shOrders, mO, orderFind.rowIndex, {
      total_order_qty: 0,
      total_allocated_qty: 0,
      total_shipped_qty: 0,
      total_remaining_qty: 0,
      total_revenue_bdt: 0,
      total_product_cost_bdt: 0,
      total_cargo_cost_bdt: 0,
      total_total_cost_bdt: 0,
      total_profit_bdt: 0
    });
    return;
  }

  // ---- Read allocations for this order ----
  const allocLastRow = shAlloc.getLastRow();
  const allocData = (allocLastRow < 2)
    ? []
    : shAlloc.getRange(2, 1, allocLastRow - 1, shAlloc.getLastColumn()).getValues();

  const agg = {}; // order_item_id -> aggregates
  itemIds.forEach(id => {
    agg[id] = {
      allocated_qty_total: 0,
      shipped_qty_total: 0,

      revenue_bdt: 0,
      product_cost_bdt: 0,
      cargo_cost_bdt: 0,
      total_cost_bdt: 0,
      profit_bdt: 0
    };
  });

  for (let i = 0; i < allocData.length; i++) {
    const r = allocData[i];
    if (String(r[mA.order_id]) !== order_id) continue;

    const oid = String(r[mA.order_item_id] || "").trim();
    if (!agg[oid]) continue; // allocation might point to an item not in the order list (ignore)

    agg[oid].allocated_qty_total += ukNum_(r[mA.allocated_qty]);
    agg[oid].shipped_qty_total += ukNum_(r[mA.shipped_qty]);

    // money (BDT integer expected)
    agg[oid].revenue_bdt += ukNum_(r[mA.revenue_bdt]);
    agg[oid].product_cost_bdt += ukNum_(r[mA.product_cost_bdt]);
    agg[oid].cargo_cost_bdt += ukNum_(r[mA.cargo_cost_bdt]);
    agg[oid].total_cost_bdt += ukNum_(r[mA.total_cost_bdt]);
    agg[oid].profit_bdt += ukNum_(r[mA.profit_bdt]);
  }

  // ---- Enforce NO OVER-SHIP across ALL allocations for each item ----
  // Hard rule: shipped_qty_total <= ordered_quantity
  for (let k = 0; k < itemIds.length; k++) {
    const oid = itemIds[k];
    const shipped = agg[oid].shipped_qty_total;
    const ordered = orderedQtyById[oid];
    if (shipped > ordered + 1e-9) {
      throw new Error(`Over-ship detected: ${oid} shipped=${shipped} > ordered=${ordered}`);
    }
  }

  // ---- Write back item tracking fields ----
  let total_allocated_qty = 0;
  let total_shipped_qty = 0;
  let total_remaining_qty = 0;

  // order money totals computed from allocations
  let total_revenue_bdt = 0;
  let total_product_cost_bdt = 0;
  let total_cargo_cost_bdt = 0;
  let total_total_cost_bdt = 0;
  let total_profit_bdt = 0;

  for (let k = 0; k < itemIds.length; k++) {
    const oid = itemIds[k];
    const idx = itemIndexById[oid];
    const itemRow = itemsData[idx];

    const ordered = orderedQtyById[oid];
    const allocated = agg[oid].allocated_qty_total;
    const shipped = agg[oid].shipped_qty_total;

    const remaining = ordered - shipped;

    // item_status rules
    let item_status = "not_started";
    if (shipped <= 0) item_status = "not_started";
    else if (shipped > 0 && shipped < ordered) item_status = "partial";
    else if (Math.abs(shipped - ordered) < 1e-9) item_status = "delivered";

    // write to row
    itemRow[mI.allocated_qty_total] = allocated;
    itemRow[mI.shipped_qty_total] = shipped;
    itemRow[mI.remaining_qty] = remaining;
    itemRow[mI.item_status] = item_status;

    // totals
    total_allocated_qty += allocated;
    total_shipped_qty += shipped;
    total_remaining_qty += remaining;

    // money rollup (round to integers on final write)
    total_revenue_bdt += agg[oid].revenue_bdt;
    total_product_cost_bdt += agg[oid].product_cost_bdt;
    total_cargo_cost_bdt += agg[oid].cargo_cost_bdt;
    total_total_cost_bdt += agg[oid].total_cost_bdt;
    total_profit_bdt += agg[oid].profit_bdt;
  }

  // Push item updates
  itemsRange.setValues(itemsData);

  // ---- Ensure integer BDT totals (round 0dp) ----
  total_revenue_bdt = UK_roundBDT_(total_revenue_bdt);
  total_product_cost_bdt = UK_roundBDT_(total_product_cost_bdt);
  total_cargo_cost_bdt = UK_roundBDT_(total_cargo_cost_bdt);
  total_total_cost_bdt = UK_roundBDT_(total_total_cost_bdt);
  total_profit_bdt = UK_roundBDT_(total_profit_bdt);

  // ---- Write order totals ----
  _writeOrderTotals_(shOrders, mO, orderFind.rowIndex, {
    total_order_qty: total_order_qty,
    total_allocated_qty: total_allocated_qty,
    total_shipped_qty: total_shipped_qty,
    total_remaining_qty: total_remaining_qty,
    total_revenue_bdt: total_revenue_bdt,
    total_product_cost_bdt: total_product_cost_bdt,
    total_cargo_cost_bdt: total_cargo_cost_bdt,
    total_total_cost_bdt: total_total_cost_bdt,
    total_profit_bdt: total_profit_bdt
  });

  // ---- Auto status update (only when in processing/partially_delivered) ----
  UK_recomputeOrderStatus_(order_id, orderStatus, total_remaining_qty, total_shipped_qty);
}

function UK_recomputeOrderStatus_(order_id, currentStatusLower, total_remaining_qty, total_shipped_qty) {
  const ss = ukOpenSS_();
  const shOrders = ss.getSheetByName("uk_orders");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");

  const req = ["order_id", "status", "updated_at"];
  const m = UK_getMapStrict_(shOrders, req);

  // Only auto-update when processing or partially_delivered
  if (currentStatusLower !== "processing" && currentStatusLower !== "partially_delivered") return;

  let newStatus = currentStatusLower;
  if (total_remaining_qty === 0) newStatus = "delivered";
  else if (total_shipped_qty > 0) newStatus = "partially_delivered";
  else newStatus = "processing";

  if (newStatus === currentStatusLower) return;

  const found = ukFindRowIndexById_(shOrders, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  shOrders.getRange(found.rowIndex, m.status + 1).setValue(newStatus);
  shOrders.getRange(found.rowIndex, m.updated_at + 1).setValue(new Date());
}

/************** internal helpers **************/

function _writeOrderTotals_(shOrders, mO, rowIndex, totals) {
  // Write each cell individually to avoid dependency on exact lastColumn length
  shOrders.getRange(rowIndex, mO.total_order_qty + 1).setValue(totals.total_order_qty);
  shOrders.getRange(rowIndex, mO.total_allocated_qty + 1).setValue(totals.total_allocated_qty);
  shOrders.getRange(rowIndex, mO.total_shipped_qty + 1).setValue(totals.total_shipped_qty);
  shOrders.getRange(rowIndex, mO.total_remaining_qty + 1).setValue(totals.total_remaining_qty);

  shOrders.getRange(rowIndex, mO.total_revenue_bdt + 1).setValue(totals.total_revenue_bdt);
  shOrders.getRange(rowIndex, mO.total_product_cost_bdt + 1).setValue(totals.total_product_cost_bdt);
  shOrders.getRange(rowIndex, mO.total_cargo_cost_bdt + 1).setValue(totals.total_cargo_cost_bdt);
  shOrders.getRange(rowIndex, mO.total_total_cost_bdt + 1).setValue(totals.total_total_cost_bdt);
  shOrders.getRange(rowIndex, mO.total_profit_bdt + 1).setValue(totals.total_profit_bdt);

  shOrders.getRange(rowIndex, mO.updated_at + 1).setValue(new Date());
}
