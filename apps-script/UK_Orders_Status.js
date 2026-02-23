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
  const mI = UK_getMapStrict_(shItems, ["order_id", "ordered_quantity"]);
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
  const mPM = UK_getMapStrict_(shPM, ["pricing_mode_id", "currency", "active"]);
  const pmRow = ukFindRowById_(shPM, mPM.pricing_mode_id, pricing_mode_id);
  if (!pmRow) throw new Error("Pricing mode not found: " + pricing_mode_id);
  if (!ukToBool_(pmRow[mPM.active])) throw new Error("Pricing mode inactive: " + pricing_mode_id);
  const pmCurrency = String(pmRow[mPM.currency] || "").toUpperCase();

  const perItem = {};
  (Array.isArray(body.items) ? body.items : []).forEach(function(it) {
    if (!it || !it.order_item_id) return;
    perItem[String(it.order_item_id).trim()] = it;
  });

  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, [
    "order_item_id", "order_id", "pricing_mode_id", "profit_rate", "buy_price_gbp", "offered_unit_gbp", "offered_unit_bdt"
  ]);

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

    if (pmCurrency === "GBP") {
      const offered = UK_roundGBP_(buy * (1 + ukNum_(pr, 0)));
      r[mI.offered_unit_gbp] = offered;
    } else {
      if (mI.offered_unit_bdt != null && r[mI.offered_unit_bdt] === "") r[mI.offered_unit_bdt] = "";
    }

    changed = true;
  }

  if (changed) range.setValues(data);
  UK_statusSetOrderStatus_(order_id, "priced");

  return { success: true, order_id: order_id, status: "priced" };
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

  const meta = UK_assertOrderExists_(order_id);
  UK_assertStatusTransition_(String(meta.status || "").toLowerCase(), to, "admin");
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
