/************** UK_Orders_Status.gs **************/

function UK_handleOrderSubmit(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const meta = UK_assertOrderExists_(order_id);
  const creator = String(meta.creator_email || "").toLowerCase();
  const email = String(user.email || "").toLowerCase();

  if (!ukIsAdmin_(user) && creator !== email) throw new Error("Forbidden: not your order");

  const status = String(meta.status || "").toLowerCase();
  const role = ukIsAdmin_(user) ? "admin" : "customer";
  UK_assertStatusTransition_(status, "submitted", role);

  const shItems = ukGetSheet_("uk_order_items");
  UK_getMapStrict_(shItems, ["order_id", "ordered_quantity"]);
  const rows = ukReadObjects_(shItems).rows.filter(function(r) { return String(r.order_id) === order_id; });
  if (!rows.length) throw new Error("Cannot submit order without items");
  for (let i = 0; i < rows.length; i++) {
    if (ukNum_(rows[i].ordered_quantity, 0) <= 0) throw new Error("All ordered_quantity must be > 0");
  }

  UK_statusSetOrderStatus_(order_id, "submitted");
  return { success: true, order_id: order_id, status: "submitted" };
}

function UK_handleOrderPrice(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  const pricing_mode_id = String(body.pricing_mode_id || "").trim();
  const defaultProfit = ukNumOrBlank_(body.profit_rate);

  if (!order_id) throw new Error("order_id is required");
  if (!pricing_mode_id) throw new Error("pricing_mode_id is required");

  const meta = UK_assertOrderExists_(order_id);
  const from = String(meta.status || "").toLowerCase();
  UK_assertStatusTransition_(from, "priced", "admin");

  const shPM = ukGetSheet_("uk_pricing_modes");
  const mPM = UK_getMapStrict_(shPM, ["pricing_mode_id", "currency", "conversion_rule", "rate_source_revenue", "active"]);
  const pmRow = ukFindRowById_(shPM, mPM.pricing_mode_id, pricing_mode_id);
  if (!pmRow) throw new Error("Pricing mode not found: " + pricing_mode_id);
  if (!ukToBool_(pmRow[mPM.active])) throw new Error("Pricing mode inactive: " + pricing_mode_id);
  const pmMap = _buildIdMap_(shPM, mPM.pricing_mode_id);

  const perItem = {};
  (Array.isArray(body.items) ? body.items : []).forEach(function(it) {
    if (!it || !it.order_item_id) return;
    perItem[String(it.order_item_id).trim()] = it;
  });

  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, [
    "order_item_id", "order_id", "pricing_mode_id", "profit_rate", "buy_price_gbp", "offered_unit_gbp", "offered_unit_bdt"
  ]);

  const shAlloc = ukGetSheet_("uk_shipment_allocation");
  const mA = UK_getMapStrict_(shAlloc, [
    "order_item_id", "allocated_qty", "shipped_qty", "unit_product_weight", "unit_package_weight", "unit_total_weight", "shipment_id"
  ]);
  const allocRows = ukReadObjects_(shAlloc).rows;

  const shShip = ukGetSheet_("uk_shipments");
  const mS = UK_getMapStrict_(shShip, [
    "shipment_id", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo", "cargo_cost_per_kg"
  ]);
  const shipMap = _buildIdMap_(shShip, mS.shipment_id);
  const fallbackShipment = UK_pickDefaultShipmentForPricing_(shShip, mS, body.shipment_id);

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) throw new Error("No order_items rows found");

  const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
  const data = range.getValues();
  let changed = false;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    const ov = perItem[oid] || {};

    const pmId = String(ov.pricing_mode_id !== undefined ? ov.pricing_mode_id : pricing_mode_id).trim();
    const pr = ov.profit_rate !== undefined ? ukNumOrBlank_(ov.profit_rate) : defaultProfit;
    const buy = ukNum_(r[mI.buy_price_gbp], 0);

    r[mI.pricing_mode_id] = pmId;
    if (pr !== "") r[mI.profit_rate] = pr;

    const pmRowLocal = pmMap[pmId];
    const pmCurrency = String(pmRowLocal ? pmRowLocal[mPM.currency] : "").toUpperCase();
    const pmConversion = String(pmRowLocal ? pmRowLocal[mPM.conversion_rule] : "SEPARATE_RATES").toUpperCase();

    if (pmCurrency === "GBP") {
      const offeredGBP = UK_roundGBP_(buy * (1 + ukNum_(pr, 0)));
      r[mI.offered_unit_gbp] = offeredGBP;
      if (mI.offered_unit_bdt != null) {
        const shipForItem = UK_pickShipmentForOrderItem_(oid, allocRows, mA, shipMap) || fallbackShipment;
        const offeredBDT = UK_convertGBPUnitToBDT_(offeredGBP, pmRowLocal, mPM, shipForItem, mS);
        r[mI.offered_unit_bdt] = offeredBDT === "" ? "" : offeredBDT;
      }
    } else if (pmCurrency === "BDT") {
      const landedUnitBDT = UK_estimateLandedUnitBDTForItem_(
        oid,
        buy,
        pmConversion,
        allocRows,
        mA,
        shipMap,
        mS,
        fallbackShipment,
      );
      if (mI.offered_unit_bdt != null) {
        r[mI.offered_unit_bdt] = landedUnitBDT === "" ? "" : UK_roundBDT_(landedUnitBDT * (1 + ukNum_(pr, 0)));
      }
      r[mI.offered_unit_gbp] = "";
    }

    changed = true;
  }

  if (changed) range.setValues(data);
  UK_refreshOfferedUnitsForOrder_(order_id, body.shipment_id);
  UK_statusSetOrderStatus_(order_id, "priced");

  return { success: true, order_id: order_id, status: "priced" };
}

function UK_refreshOfferedUnitsForOrder_(order_id, preferredShipmentId) {
  const shPM = ukGetSheet_("uk_pricing_modes");
  const mPM = UK_getMapStrict_(shPM, ["pricing_mode_id", "currency", "conversion_rule", "rate_source_revenue", "active"]);
  const pmMap = UK_buildIdMapGeneric_(shPM, mPM.pricing_mode_id);

  const shAlloc = ukGetSheet_("uk_shipment_allocation");
  const mA = UK_getMapStrict_(shAlloc, [
    "order_item_id", "allocated_qty", "shipped_qty", "unit_product_weight", "unit_package_weight", "unit_total_weight", "shipment_id"
  ]);
  const allocRows = ukReadObjects_(shAlloc).rows;

  const shShip = ukGetSheet_("uk_shipments");
  const mS = UK_getMapStrict_(shShip, [
    "shipment_id", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo", "cargo_cost_per_kg"
  ]);
  const shipMap = UK_buildIdMapGeneric_(shShip, mS.shipment_id);
  const fallbackShipment = UK_pickDefaultShipmentForPricing_(shShip, mS, preferredShipmentId);

  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, [
    "order_item_id", "order_id", "pricing_mode_id", "profit_rate", "buy_price_gbp", "offered_unit_gbp", "offered_unit_bdt"
  ]);

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) return;
  const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
  const data = range.getValues();
  let changed = false;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[mI.order_id] || "").trim() !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    const pmId = String(r[mI.pricing_mode_id] || "").trim();
    const pr = ukNum_(r[mI.profit_rate], 0);
    const buy = ukNum_(r[mI.buy_price_gbp], 0);

    const pmRowLocal = pmMap[pmId];
    if (!pmRowLocal) continue;
    if (!ukToBool_(pmRowLocal[mPM.active])) continue;

    const pmCurrency = String(pmRowLocal[mPM.currency] || "").toUpperCase();
    const pmConversion = String(pmRowLocal[mPM.conversion_rule] || "SEPARATE_RATES").toUpperCase();

    if (pmCurrency === "GBP") {
      const offeredGBP = UK_roundGBP_(buy * (1 + pr));
      const shipForItem = UK_pickShipmentForOrderItem_(oid, allocRows, mA, shipMap) || fallbackShipment;
      const offeredBDT = UK_convertGBPUnitToBDT_(offeredGBP, pmRowLocal, mPM, shipForItem, mS);
      r[mI.offered_unit_gbp] = offeredGBP;
      r[mI.offered_unit_bdt] = offeredBDT === "" ? "" : offeredBDT;
      changed = true;
      continue;
    }

    if (pmCurrency === "BDT") {
      const landedUnitBDT = UK_estimateLandedUnitBDTForItem_(
        oid,
        buy,
        pmConversion,
        allocRows,
        mA,
        shipMap,
        mS,
        fallbackShipment,
      );
      r[mI.offered_unit_bdt] = landedUnitBDT === "" ? "" : UK_roundBDT_(landedUnitBDT * (1 + pr));
      // keep GBP shown as converted reference if shipment exists
      const shipForItem = UK_pickShipmentForOrderItem_(oid, allocRows, mA, shipMap) || fallbackShipment;
      if (shipForItem) {
        const rateRef = UK_effectiveAvgRate_(shipForItem[mS.gbp_avg_rate], shipForItem[mS.gbp_rate_product], shipForItem[mS.gbp_rate_cargo]);
        r[mI.offered_unit_gbp] = rateRef > 0 ? UK_roundGBP_(ukNum_(r[mI.offered_unit_bdt], 0) / rateRef) : "";
      } else {
        r[mI.offered_unit_gbp] = "";
      }
      changed = true;
    }
  }

  if (changed) range.setValues(data);
}

function UK_estimateLandedUnitBDTForItem_(order_item_id, buy_price_gbp, conversionRule, allocRows, mA, shipMap, mS, fallbackShipment) {
  let weightedCost = 0;
  let totalQty = 0;
  let firstCost = "";

  for (let i = 0; i < allocRows.length; i++) {
    const ar = allocRows[i];
    if (String(ar.order_item_id || "").trim() !== order_item_id) continue;

    const shipment_id = String(ar.shipment_id || "").trim();
    const ship = shipMap[shipment_id];
    if (!ship) continue;

    const rateProduct = ukNum_(ship[mS.gbp_rate_product], 0);
    const rateCargo = ukNum_(ship[mS.gbp_rate_cargo], 0);
    const rateAvg = UK_effectiveAvgRate_(ship[mS.gbp_avg_rate], rateProduct, rateCargo);
    const cargoPerKg = ukNum_(ship[mS.cargo_cost_per_kg], 0);

    const unitProductWeight = ukNum_(ar.unit_product_weight, 0);
    const unitPackageWeight = ukNum_(ar.unit_package_weight, 0);
    const unitTotalWeight = ukNum_(ar.unit_total_weight, unitProductWeight + unitPackageWeight);
    const unitCargoGBP = UK_roundGBP_(unitTotalWeight * cargoPerKg);

    const useSeparate = String(conversionRule || "").toUpperCase() === "SEPARATE_RATES";
    const productUnitBDT = useSeparate
      ? UK_roundBDT_(buy_price_gbp * rateProduct)
      : UK_roundBDT_(buy_price_gbp * rateAvg);
    const cargoUnitBDT = useSeparate
      ? UK_roundBDT_(unitCargoGBP * rateCargo)
      : UK_roundBDT_(unitCargoGBP * rateAvg);
    const landedUnitBDT = UK_roundBDT_(productUnitBDT + cargoUnitBDT);

    if (firstCost === "") firstCost = landedUnitBDT;

    const qty = ukNum_(ar.allocated_qty, ukNum_(ar.shipped_qty, 0));
    if (qty > 0) {
      totalQty += qty;
      weightedCost += landedUnitBDT * qty;
    }
  }

  if (totalQty > 0) return UK_roundBDT_(weightedCost / totalQty);
  if (firstCost !== "") return firstCost;

  // Fallback: use explicit/default shipment rates even if item has no allocations yet.
  if (fallbackShipment) {
    const rateProduct = ukNum_(fallbackShipment[mS.gbp_rate_product], 0);
    const rateCargo = ukNum_(fallbackShipment[mS.gbp_rate_cargo], 0);
    const rateAvg = UK_effectiveAvgRate_(fallbackShipment[mS.gbp_avg_rate], rateProduct, rateCargo);
    const useSeparate = String(conversionRule || "").toUpperCase() === "SEPARATE_RATES";
    const productUnitBDT = useSeparate
      ? UK_roundBDT_(buy_price_gbp * rateProduct)
      : UK_roundBDT_(buy_price_gbp * rateAvg);
    // no allocation weights yet -> cargo part cannot be estimated reliably, keep as 0
    const cargoUnitBDT = 0;
    return UK_roundBDT_(productUnitBDT + cargoUnitBDT);
  }

  return firstCost;
}

function UK_effectiveAvgRate_(avgRate, rateProduct, rateCargo) {
  const avg = ukNum_(avgRate, 0);
  const p = ukNum_(rateProduct, 0);
  const c = ukNum_(rateCargo, 0);
  if (avg > 0) return UK_roundGBP_(avg);
  if (p > 0 && c > 0) return UK_roundGBP_((p + c) / 2);
  if (p > 0) return UK_roundGBP_(p);
  if (c > 0) return UK_roundGBP_(c);
  return 0;
}

function UK_pickShipmentForOrderItem_(order_item_id, allocRows, mA, shipMap) {
  for (let i = 0; i < allocRows.length; i++) {
    const ar = allocRows[i];
    if (String(ar.order_item_id || "").trim() !== order_item_id) continue;
    const sid = String(ar.shipment_id || "").trim();
    if (!sid) continue;
    const sh = shipMap[sid];
    if (sh) return sh;
  }
  return null;
}

function UK_convertGBPUnitToBDT_(unitGBP, pmRowLocal, mPM, shipmentRow, mS) {
  if (!shipmentRow) return "";
  const rs = String(pmRowLocal && mPM.rate_source_revenue != null ? pmRowLocal[mPM.rate_source_revenue] : "").toLowerCase();
  const rateAvg = UK_effectiveAvgRate_(shipmentRow[mS.gbp_avg_rate], shipmentRow[mS.gbp_rate_product], shipmentRow[mS.gbp_rate_cargo]);
  let rate = rateAvg;
  if (rs === "product") rate = ukNum_(shipmentRow[mS.gbp_rate_product], rateAvg);
  if (rs === "cargo") rate = ukNum_(shipmentRow[mS.gbp_rate_cargo], rateAvg);
  if (rs === "avg" || rs === "") rate = rateAvg;
  return UK_roundBDT_(ukNum_(unitGBP, 0) * ukNum_(rate, 0));
}

function UK_pickDefaultShipmentForPricing_(shShip, mS, preferredShipmentId) {
  const preferredId = String(preferredShipmentId || "").trim();
  if (preferredId) {
    const row = ukFindRowById_(shShip, mS.shipment_id, preferredId);
    if (row) return row;
  }

  const rows = ukReadObjects_(shShip).rows;
  if (!rows.length) return null;
  rows.sort(function(a, b) {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
    return tb - ta;
  });
  const best = rows[0];
  return ukFindRowById_(shShip, mS.shipment_id, String(best.shipment_id || ""));
}

function UK_buildIdMapGeneric_(sheet, idColIdx0) {
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

function UK_handleOrderCustomerCounter(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const order_id = String(body.order_id || "").trim();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!order_id) throw new Error("order_id is required");
  if (!items.length) throw new Error("items[] is required");

  const meta = UK_assertOrderExists_(order_id);
  const creator = String(meta.creator_email || "").toLowerCase();
  if (creator !== String(user.email || "").toLowerCase()) throw new Error("Forbidden: not your order");

  const shOrders = ukGetSheet_("uk_orders");
  const mO = UK_getMapStrict_(shOrders, ["order_id"]);
  const hmO = ukHeaderMap_(shOrders);
  const orow = ukFindRowById_(shOrders, mO.order_id, order_id);
  if (!orow) throw new Error("Order not found: " + order_id);
  if (hmO.counter_enabled != null && !ukToBool_(orow[hmO.counter_enabled])) {
    throw new Error("Counter offer is disabled for this order");
  }

  const from = String(meta.status || "").toLowerCase();
  UK_assertStatusTransition_(from, "under_review", "customer");

  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id", "pricing_mode_id", "customer_unit_gbp", "customer_unit_bdt"]);

  const byId = {};
  items.forEach(function(it) { if (it && it.order_item_id) byId[String(it.order_item_id).trim()] = it; });

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) throw new Error("No order_items rows found");

  const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
  const data = range.getValues();
  let changed = false;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    const u = byId[oid];
    if (!u) continue;

    const pm = String(r[mI.pricing_mode_id] || "").toUpperCase();
    if (pm.indexOf("GBP") >= 0) {
      if (u.customer_unit_gbp === undefined) throw new Error("customer_unit_gbp required for GBP mode on " + oid);
      r[mI.customer_unit_gbp] = UK_roundGBP_(u.customer_unit_gbp);
    } else if (pm.indexOf("BDT") >= 0) {
      if (u.customer_unit_bdt === undefined) throw new Error("customer_unit_bdt required for BDT mode on " + oid);
      r[mI.customer_unit_bdt] = UK_roundBDT_(u.customer_unit_bdt);
    } else {
      if (u.customer_unit_gbp !== undefined) r[mI.customer_unit_gbp] = UK_roundGBP_(u.customer_unit_gbp);
      if (u.customer_unit_bdt !== undefined) r[mI.customer_unit_bdt] = UK_roundBDT_(u.customer_unit_bdt);
    }

    changed = true;
  }

  if (changed) range.setValues(data);
  UK_statusSetOrderStatus_(order_id, "under_review");

  return { success: true, order_id: order_id, status: "under_review" };
}

function UK_handleOrderAcceptOffer(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const meta = UK_assertOrderExists_(order_id);
  const creator = String(meta.creator_email || "").toLowerCase();
  if (creator !== String(user.email || "").toLowerCase()) throw new Error("Forbidden: not your order");

  UK_assertStatusTransition_(String(meta.status || "").toLowerCase(), "finalized", "customer");
  UK_statusSetOrderStatus_(order_id, "finalized");

  return { success: true, order_id: order_id, status: "finalized" };
}

function UK_handleOrderFinalize(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const meta = UK_assertOrderExists_(order_id);
  UK_assertStatusTransition_(String(meta.status || "").toLowerCase(), "finalized", "admin");

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length) {
    const shItems = ukGetSheet_("uk_order_items");
    const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id", "final_unit_gbp", "final_unit_bdt"]);
    const byId = {};
    items.forEach(function(it) { if (it && it.order_item_id) byId[String(it.order_item_id).trim()] = it; });

    const lastRow = shItems.getLastRow();
    if (lastRow >= 2) {
      const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
      const data = range.getValues();
      let changed = false;

      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        if (String(r[mI.order_id]) !== order_id) continue;
        const oid = String(r[mI.order_item_id] || "").trim();
        const u = byId[oid];
        if (!u) continue;

        if (u.final_unit_gbp !== undefined) r[mI.final_unit_gbp] = UK_roundGBP_(u.final_unit_gbp);
        if (u.final_unit_bdt !== undefined) r[mI.final_unit_bdt] = UK_roundBDT_(u.final_unit_bdt);
        changed = true;
      }
      if (changed) range.setValues(data);
    }
  }

  UK_statusSetOrderStatus_(order_id, "finalized");
  return { success: true, order_id: order_id, status: "finalized" };
}

function UK_handleOrderStartProcessing(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const meta = UK_assertOrderExists_(order_id);
  UK_assertStatusTransition_(String(meta.status || "").toLowerCase(), "processing", "admin");
  UK_statusSetOrderStatus_(order_id, "processing");

  return { success: true, order_id: order_id, status: "processing" };
}

function UK_handleOrderCancel(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const meta = UK_assertOrderExists_(order_id);
  UK_assertNotDelivered_(meta.status);
  UK_statusSetOrderStatus_(order_id, "cancelled");

  return { success: true, order_id: order_id, status: "cancelled" };
}

function UK_handleUpdateOrderStatus(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  const to = String(body.status || "").trim().toLowerCase();
  if (!order_id) throw new Error("order_id is required");
  if (!to) throw new Error("status is required");
  const ALLOWED = {
    draft: 1,
    submitted: 1,
    priced: 1,
    under_review: 1,
    finalized: 1,
    processing: 1,
    partially_delivered: 1,
    delivered: 1,
    cancelled: 1,
  };
  if (!ALLOWED[to]) throw new Error("Invalid status: " + to);

  UK_assertOrderExists_(order_id);
  UK_statusSetOrderStatus_(order_id, to);

  return { success: true, order_id: order_id, status: to };
}

function UK_statusSetOrderStatus_(order_id, newStatus) {
  const sh = ukGetSheet_("uk_orders");
  const m = UK_getMapStrict_(sh, ["order_id", "status", "updated_at"]);
  const found = ukFindRowIndexById_(sh, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error("Order not found: " + order_id);

  sh.getRange(found.rowIndex, m.status + 1).setValue(String(newStatus || "").toLowerCase());
  sh.getRange(found.rowIndex, m.updated_at + 1).setValue(new Date());
}
