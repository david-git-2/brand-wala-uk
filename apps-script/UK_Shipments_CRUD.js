/************** UK_Orders_Status.gs **************
Step 10 — Status Transition APIs (workflow)

Implements:
- UK_handleOrderPrice(body)            (admin) submitted/under_review -> priced (and generate offered prices)
- UK_handleOrderCustomerCounter(body)  (customer) priced -> under_review (set customer_unit_*)
- UK_handleOrderAcceptOffer(body)      (customer) priced -> finalized
- UK_handleOrderFinalize(body)         (admin) priced/under_review -> finalized (set final_unit_*)
- UK_handleOrderStartProcessing(body)  (admin) finalized -> processing
- UK_handleOrderCancel(body)           (admin) any -> cancelled (not if delivered)

Notes:
- This file focuses on clean transitions + permission gating.
- It updates ONLY order status + unit price fields on uk_order_items.
- Allocation recompute happens in Step 8/9 endpoints.

Depends on Step 2:
- UK_getMapStrict_(sheet, requiredCols)
- UK_assertAdmin_(user)
- UK_roundGBP_(n), UK_roundBDT_(n)
- UK_assertOrderExists_(order_id)   (from Step 2)
- UK_assertNotDelivered_(status)
**************************************************/

/***********************
 * Helpers (local)
 ************************/

function UK_assertStatusTransition_(fromStatus, toStatus, role) {
  const fromS = String(fromStatus || "").toLowerCase();
  const toS = String(toStatus || "").toLowerCase();
  const r = String(role || "").toLowerCase();

  const allow = {};

  // Customer transitions
  allow["customer"] = {
    priced: ["under_review", "finalized"], // counter or accept
  };

  // Admin transitions
  allow["admin"] = {
    submitted: ["priced", "cancelled"],
    under_review: ["priced", "finalized", "cancelled"],
    priced: ["finalized", "cancelled"],
    finalized: ["processing", "cancelled"],
    processing: ["cancelled"], // auto to partial/delivered via recompute
    partially_delivered: ["cancelled"], // optional; up to you
    draft: ["cancelled"]
  };

  // Delivered is terminal
  if (fromS === "delivered") return false;

  const allowedTargets = (allow[r] && allow[r][fromS]) ? allow[r][fromS] : [];
  return allowedTargets.indexOf(toS) !== -1;
}

function UK_setOrderStatus_(order_id, newStatus) {
  const ss = ukOpenSS_();
  const sh = ss.getSheetByName("uk_orders");
  if (!sh) throw new Error("Missing sheet: uk_orders");

  const req = ["order_id", "status", "updated_at"];
  const m = UK_getMapStrict_(sh, req);

  const found = _findRowIndexById_(sh, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  sh.getRange(found.rowIndex, m.status + 1).setValue(newStatus);
  sh.getRange(found.rowIndex, m.updated_at + 1).setValue(new Date());
}

function UK_getOrderStatus_(order_id) {
  const ss = ukOpenSS_();
  const sh = ss.getSheetByName("uk_orders");
  if (!sh) throw new Error("Missing sheet: uk_orders");

  const req = ["order_id", "status"];
  const m = UK_getMapStrict_(sh, req);

  const found = _findRowIndexById_(sh, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  return String(found.row[m.status] || "").trim();
}

function UK_getOrderCreatorAndGBPFlag_(order_id) {
  const ss = ukOpenSS_();
  const sh = ss.getSheetByName("uk_orders");
  if (!sh) throw new Error("Missing sheet: uk_orders");

  const req = ["order_id", "creator_email", "creator_can_see_price_gbp"];
  const m = UK_getMapStrict_(sh, req);

  const found = _findRowIndexById_(sh, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  return {
    creator_email: String(found.row[m.creator_email] || "").trim(),
    creator_can_see_price_gbp: !!found.row[m.creator_can_see_price_gbp]
  };
}

/***********************
 * 1) Admin: Price order
 ************************
body:
{
  order_id,
  pricing_mode_id,          // set on all items unless overridden per item later
  profit_rate,              // default profit rate applied to all items if item profit_rate blank
  // optional: per_item overrides:
  items: [{ order_item_id, profit_rate, pricing_mode_id }]
}

Logic:
- allowed from submitted or under_review
- sets on each item:
  - pricing_mode_id
  - profit_rate (if blank)
  - offered_unit_gbp or offered_unit_bdt (depending on PM currency)
- sets order status -> priced
*/
function UK_handleOrderPrice(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const currentStatus = UK_getOrderStatus_(order_id);
  UK_assertNotDelivered_(currentStatus);

  if (!UK_assertStatusTransition_(currentStatus, "priced", "admin")) {
    throw new Error(`Invalid transition: ${currentStatus} -> priced`);
  }

  const defaultPM = String(body.pricing_mode_id || "").trim();
  if (!defaultPM) throw new Error("pricing_mode_id is required");

  const defaultProfit = (body.profit_rate === "" || body.profit_rate === null || body.profit_rate === undefined)
    ? ""
    : Number(body.profit_rate);

  const perItem = {};
  (body.items || []).forEach(x => {
    if (!x || !x.order_item_id) return;
    perItem[String(x.order_item_id).trim()] = x;
  });

  // Load pricing mode currency
  const shPM = ss.getSheetByName("uk_pricing_modes");
  if (!shPM) throw new Error("Missing sheet: uk_pricing_modes");
  const mPM = UK_getMapStrict_(shPM, ["pricing_mode_id", "currency", "active"]);
  const pmRow = _findRowById_(shPM, mPM.pricing_mode_id, defaultPM);
  if (!pmRow) throw new Error(`Pricing mode not found: ${defaultPM}`);
  if (!_toBool_(pmRow[mPM.active])) throw new Error(`Pricing mode inactive: ${defaultPM}`);
  const pmCurrency = String(pmRow[mPM.currency] || "").trim();

  // Update items
  const shItems = ss.getSheetByName("uk_order_items");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  const itemReq = [
    "order_item_id",
    "order_id",
    "pricing_mode_id",
    "profit_rate",
    "buy_price_gbp",
    "offered_unit_gbp",
    "offered_unit_bdt"
  ];
  const mI = UK_getMapStrict_(shItems, itemReq);

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) throw new Error("No order_items rows found");

  const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
  const data = range.getValues();

  let changed = false;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    const override = perItem[oid] || {};

    const pmId = String((override.pricing_mode_id !== undefined) ? override.pricing_mode_id : defaultPM).trim();

    // Determine profit rate to set (only if blank)
    const existingPR = r[mI.profit_rate];
    const prBlank = (existingPR === "" || existingPR === null || existingPR === undefined);
    const prToUse = prBlank
      ? ((override.profit_rate !== undefined) ? Number(override.profit_rate) : defaultProfit)
      : Number(existingPR);

    // offered unit = buy_price_gbp * (1 + profit_rate) converted to currency-specific unit price
    const buy = Number(r[mI.buy_price_gbp] || 0);

    r[mI.pricing_mode_id] = pmId;
    if (prBlank && prToUse !== "") r[mI.profit_rate] = prToUse;

    if (pmCurrency === "GBP") {
      const offered = UK_roundGBP_(buy * (1 + (Number(prToUse || 0))));
      r[mI.offered_unit_gbp] = offered;
      // leave offered_unit_bdt blank
    } else if (pmCurrency === "BDT") {
      // For BDT mode, offered_unit_bdt is not strictly required by your spec (revenue is computed on landed cost),
      // but we populate it as "indicative" using buy_gbp -> (avg) not available here.
      // Safer: leave blank and let admin set offered_unit_bdt manually if they want.
      r[mI.offered_unit_bdt] = r[mI.offered_unit_bdt] || "";
    }

    changed = true;
  }

  if (changed) range.setValues(data);

  // Set order status -> priced
  UK_setOrderStatus_(order_id, "priced");

  return { success: true, order_id, status: "priced" };
}

/*******************************
 * 2) Customer: Send counter
 ******************************
body:
{
  order_id,
  items: [{ order_item_id, customer_unit_gbp }...] OR [{ order_item_id, customer_unit_bdt }...]
}

Rules:
- priced -> under_review
- customer can only update customer_unit_* fields
*/
function UK_handleOrderCustomerCounter(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "customer").trim() };

  const email = String(body.email || user.email || "").trim();
  if (!email) throw new Error("email is required");

  const role = String(user.role || "customer").toLowerCase();
  if (role === "admin") {
    // admin may still call, but treat as customer action not recommended
  }

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const currentStatus = UK_getOrderStatus_(order_id);
  UK_assertNotDelivered_(currentStatus);

  if (!UK_assertStatusTransition_(currentStatus, "under_review", "customer")) {
    throw new Error(`Invalid transition: ${currentStatus} -> under_review`);
  }

  // Verify ownership
  const meta = UK_getOrderCreatorAndGBPFlag_(order_id);
  if (String(meta.creator_email).toLowerCase() !== email.toLowerCase()) {
    throw new Error("Forbidden: not your order");
  }

  const shItems = ss.getSheetByName("uk_order_items");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  const req = [
    "order_item_id",
    "order_id",
    "customer_unit_gbp",
    "customer_unit_bdt",
    "pricing_mode_id"
  ];
  const mI = UK_getMapStrict_(shItems, req);

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) throw new Error("No order_items rows found");

  const updates = {};
  (body.items || []).forEach(x => {
    if (!x || !x.order_item_id) return;
    updates[String(x.order_item_id).trim()] = x;
  });
  const keys = Object.keys(updates);
  if (!keys.length) throw new Error("items[] with order_item_id is required");

  const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
  const data = range.getValues();

  let changed = false;
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    const u = updates[oid];
    if (!u) continue;

    // Customer can submit either GBP or BDT depending on pricing_mode,
    // but we accept whichever is provided.
    if (u.customer_unit_gbp !== undefined) r[mI.customer_unit_gbp] = UK_roundGBP_(u.customer_unit_gbp);
    if (u.customer_unit_bdt !== undefined) r[mI.customer_unit_bdt] = UK_roundBDT_(u.customer_unit_bdt);

    changed = true;
  }

  if (changed) range.setValues(data);

  UK_setOrderStatus_(order_id, "under_review");

  return { success: true, order_id, status: "under_review" };
}

/*******************************
 * 3) Customer: Accept offer
 ******************************
- priced -> finalized
*/
function UK_handleOrderAcceptOffer(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "customer").trim() };

  const email = String(body.email || user.email || "").trim();
  if (!email) throw new Error("email is required");

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const currentStatus = UK_getOrderStatus_(order_id);
  UK_assertNotDelivered_(currentStatus);

  if (!UK_assertStatusTransition_(currentStatus, "finalized", "customer")) {
    throw new Error(`Invalid transition: ${currentStatus} -> finalized`);
  }

  const meta = UK_getOrderCreatorAndGBPFlag_(order_id);
  if (String(meta.creator_email).toLowerCase() !== email.toLowerCase()) {
    throw new Error("Forbidden: not your order");
  }

  UK_setOrderStatus_(order_id, "finalized");
  return { success: true, order_id, status: "finalized" };
}

/*******************************
 * 4) Admin: Finalize order
 ******************************
body:
{
  order_id,
  items: [{ order_item_id, final_unit_gbp }...] OR [{ order_item_id, final_unit_bdt }...]
}
- priced/under_review -> finalized
*/
function UK_handleOrderFinalize(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const currentStatus = UK_getOrderStatus_(order_id);
  UK_assertNotDelivered_(currentStatus);

  if (!UK_assertStatusTransition_(currentStatus, "finalized", "admin")) {
    throw new Error(`Invalid transition: ${currentStatus} -> finalized`);
  }

  const shItems = ss.getSheetByName("uk_order_items");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  const req = ["order_item_id", "order_id", "final_unit_gbp", "final_unit_bdt"];
  const mI = UK_getMapStrict_(shItems, req);

  const updates = {};
  (body.items || []).forEach(x => {
    if (!x || !x.order_item_id) return;
    updates[String(x.order_item_id).trim()] = x;
  });

  // items optional; admin can finalize without setting per-item finals (not recommended)
  const lastRow = shItems.getLastRow();
  if (lastRow >= 2 && Object.keys(updates).length) {
    const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
    const data = range.getValues();

    let changed = false;
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (String(r[mI.order_id]) !== order_id) continue;

      const oid = String(r[mI.order_item_id] || "").trim();
      const u = updates[oid];
      if (!u) continue;

      if (u.final_unit_gbp !== undefined) r[mI.final_unit_gbp] = UK_roundGBP_(u.final_unit_gbp);
      if (u.final_unit_bdt !== undefined) r[mI.final_unit_bdt] = UK_roundBDT_(u.final_unit_bdt);

      changed = true;
    }
    if (changed) range.setValues(data);
  }

  UK_setOrderStatus_(order_id, "finalized");
  return { success: true, order_id, status: "finalized" };
}

/*******************************
 * 5) Admin: Start processing
 ******************************
- finalized -> processing
*/
function UK_handleOrderStartProcessing(body) {
  body = body || {};

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const currentStatus = UK_getOrderStatus_(order_id);
  UK_assertNotDelivered_(currentStatus);

  if (!UK_assertStatusTransition_(currentStatus, "processing", "admin")) {
    throw new Error(`Invalid transition: ${currentStatus} -> processing`);
  }

  UK_setOrderStatus_(order_id, "processing");
  return { success: true, order_id, status: "processing" };
}

/*******************************
 * 6) Admin: Cancel order
 ******************************
- any -> cancelled (except delivered)
*/
function UK_handleOrderCancel(body) {
  body = body || {};

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const currentStatus = UK_getOrderStatus_(order_id);
  UK_assertNotDelivered_(currentStatus);

  // allow cancel from any non-delivered status
  UK_setOrderStatus_(order_id, "cancelled");
  return { success: true, order_id, status: "cancelled" };
}

/************** shared internal helpers **************/

function _findRowIndexById_(sheet, idColIdx0, idVal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rowIndex: -1, row: null };
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idColIdx0]) === String(idVal)) {
      return { rowIndex: i + 2, row: data[i] };
    }
  }
  return { rowIndex: -1, row: null };
}

function _findRowById_(sheet, idColIdx0, idVal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idColIdx0]) === String(idVal)) return data[i];
  }
  return null;
}

function _toBool_(v) {
  if (v === true || v === false) return v;
  const s = String(v || "").trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  if (s === "") return false;
  const n = Number(s);
  if (isFinite(n)) return n !== 0;
  return false;
}