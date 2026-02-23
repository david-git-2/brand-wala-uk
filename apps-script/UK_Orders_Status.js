/************** UK_Orders_Edit.gs **************
Step 11 — Lockdown edits (order/item edit endpoints)

Implements:
- UK_handleUpdateOrder(body)       // header only
- UK_handleUpdateOrderItems(body)  // guarded by role+status+field list
- UK_handleDeleteOrderItems(body)  // guarded (admin only unless draft customer)
- UK_handleDeleteOrder(body)       // admin only (or draft owner if you want)

Key rule from your spec:
- Customer editable:
  - draft: orders.order_name; order_items ordered_quantity (+ add/remove items)
  - priced/under_review: customer_unit_* only (based on pricing_mode)
- Admin editable:
  - most statuses: profit_rate, offered_unit_*, final_unit_*, pricing_mode_id
  - shipment_allocation edits happen elsewhere
  - processing: DO NOT allow item edits (only allocation shipped_qty via allocation update)

Depends on Step 2:
- UK_getMapStrict_(sheet, requiredCols)
- UK_assertAdmin_(user)
- UK_roundGBP_(n), UK_roundBDT_(n)
- UK_assertNotDelivered_(status)
**************************************************/

function UK_handleUpdateOrder(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "customer").trim() };

  const email = String(body.email || user.email || "").trim();
  const role = String(user.role || "customer").toLowerCase();

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const patch = body.patch || {};
  if (!patch || typeof patch !== "object") throw new Error("patch object is required");

  const shOrders = ss.getSheetByName("uk_orders");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");

  const req = ["order_id", "order_name", "creator_email", "status", "updated_at"];
  const m = UK_getMapStrict_(shOrders, req);

  const found = _findRowIndexById_(shOrders, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  const status = String(found.row[m.status] || "").trim().toLowerCase();
  UK_assertNotDelivered_(status);

  const creatorEmail = String(found.row[m.creator_email] || "").trim().toLowerCase();
  const isOwner = creatorEmail === email.toLowerCase();

  // Permissions for header edit:
  // - customer can edit order_name only in draft and only if owner
  // - admin can edit order_name in most statuses except delivered
  if (role !== "admin") {
    if (!isOwner) throw new Error("Forbidden: not your order");
    if (status !== "draft") throw new Error(`Order header is read-only in status: ${status}`);
  } else {
    if (status === "delivered") throw new Error("Order is delivered and locked");
  }

  // Only allow order_name patch here
  if (patch.order_name !== undefined) {
    shOrders.getRange(found.rowIndex, m.order_name + 1).setValue(String(patch.order_name || "").trim());
  } else {
    throw new Error("Only patch.order_name is supported in uk_update_order");
  }

  shOrders.getRange(found.rowIndex, m.updated_at + 1).setValue(new Date());

  return { success: true, order_id };
}

function UK_handleUpdateOrderItems(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "customer").trim() };

  const email = String(body.email || user.email || "").trim();
  const role = String(user.role || "customer").toLowerCase();

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const itemsPatch = body.items || [];
  if (!Array.isArray(itemsPatch) || !itemsPatch.length) throw new Error("items[] patches are required");

  // Load order to get status + owner
  const shOrders = ss.getSheetByName("uk_orders");
  const shItems = ss.getSheetByName("uk_order_items");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "status", "creator_email"]);
  const oFound = _findRowIndexById_(shOrders, mO.order_id, order_id);
  if (oFound.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  const status = String(oFound.row[mO.status] || "").trim().toLowerCase();
  UK_assertNotDelivered_(status);

  const creatorEmail = String(oFound.row[mO.creator_email] || "").trim().toLowerCase();
  const isOwner = creatorEmail === email.toLowerCase();

  if (role !== "admin" && !isOwner) throw new Error("Forbidden: not your order");

  // Hard block item edits during processing/partially_delivered/delivered:
  // (processing item edits are disallowed per your spec; shipped_qty happens via allocation update)
  if (status === "processing" || status === "partially_delivered") {
    throw new Error(`Order items are read-only in status: ${status} (update allocations instead)`);
  }

  // Map patches by order_item_id
  const patchById = {};
  itemsPatch.forEach(p => {
    if (!p || !p.order_item_id) throw new Error("Each item patch must include order_item_id");
    patchById[String(p.order_item_id).trim()] = p;
  });

  // Required cols on items
  const itemReq = [
    "order_item_id",
    "order_id",
    "ordered_quantity",
    "pricing_mode_id",
    "profit_rate",
    "offered_unit_gbp",
    "customer_unit_gbp",
    "final_unit_gbp",
    "offered_unit_bdt",
    "customer_unit_bdt",
    "final_unit_bdt",
    "buy_price_gbp"
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
    const patch = patchById[oid];
    if (!patch) continue;

    // Field-level allowlist by role+status
    if (role !== "admin") {
      // CUSTOMER rules:
      if (status === "draft") {
        // can edit ordered_quantity only (and add/remove items via separate endpoints)
        _assertOnlyFields_(patch, ["order_item_id", "ordered_quantity"]);
        if (patch.ordered_quantity !== undefined) {
          const q = _numOrZero_(patch.ordered_quantity);
          if (q <= 0) throw new Error("ordered_quantity must be > 0");
          r[mI.ordered_quantity] = q;
          changed = true;
        }
      } else if (status === "priced" || status === "under_review") {
        // can edit ONLY customer_unit_* (one or both)
        _assertOnlyFields_(patch, ["order_item_id", "customer_unit_gbp", "customer_unit_bdt"]);

        if (patch.customer_unit_gbp !== undefined) {
          r[mI.customer_unit_gbp] = UK_roundGBP_(patch.customer_unit_gbp);
          changed = true;
        }
        if (patch.customer_unit_bdt !== undefined) {
          r[mI.customer_unit_bdt] = UK_roundBDT_(patch.customer_unit_bdt);
          changed = true;
        }
      } else {
        throw new Error(`Customer cannot edit items in status: ${status}`);
      }
    } else {
      // ADMIN rules:
      // In most statuses except delivered/processing: pricing_mode_id, profit_rate, offered_unit_*, final_unit_*.
      // We keep buy_price_gbp read-only here (product catalog / ingestion typically controls it).
      if (status === "delivered") throw new Error("Order is delivered and locked");

      const allowed = [
        "order_item_id",
        "pricing_mode_id",
        "profit_rate",
        "offered_unit_gbp",
        "offered_unit_bdt",
        "final_unit_gbp",
        "final_unit_bdt"
      ];

      _assertOnlyFields_(patch, allowed);

      if (patch.pricing_mode_id !== undefined) r[mI.pricing_mode_id] = String(patch.pricing_mode_id || "").trim();
      if (patch.profit_rate !== undefined) r[mI.profit_rate] = _numOrBlank_(patch.profit_rate);

      if (patch.offered_unit_gbp !== undefined) r[mI.offered_unit_gbp] = UK_roundGBP_(patch.offered_unit_gbp);
      if (patch.final_unit_gbp !== undefined) r[mI.final_unit_gbp] = UK_roundGBP_(patch.final_unit_gbp);

      if (patch.offered_unit_bdt !== undefined) r[mI.offered_unit_bdt] = UK_roundBDT_(patch.offered_unit_bdt);
      if (patch.final_unit_bdt !== undefined) r[mI.final_unit_bdt] = UK_roundBDT_(patch.final_unit_bdt);

      changed = true;
    }
  }

  if (changed) range.setValues(data);

  return { success: true, order_id };
}

/**
 * Delete order_items rows.
 * Recommended rules:
 * - Customer can delete items only in draft and only if owner
 * - Admin can delete items in draft/submitted/priced/under_review/cancelled (avoid deleting after allocations exist)
 */
function UK_handleDeleteOrderItems(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "customer").trim() };

  const email = String(body.email || user.email || "").trim();
  const role = String(user.role || "customer").toLowerCase();

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const order_item_ids = body.order_item_ids || [];
  if (!Array.isArray(order_item_ids) || !order_item_ids.length) {
    throw new Error("order_item_ids[] is required");
  }

  // Load order
  const shOrders = ss.getSheetByName("uk_orders");
  const shItems = ss.getSheetByName("uk_order_items");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "status", "creator_email"]);
  const oFound = _findRowIndexById_(shOrders, mO.order_id, order_id);
  if (oFound.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  const status = String(oFound.row[mO.status] || "").trim().toLowerCase();
  UK_assertNotDelivered_(status);

  const creatorEmail = String(oFound.row[mO.creator_email] || "").trim().toLowerCase();
  const isOwner = creatorEmail === email.toLowerCase();

  if (role !== "admin") {
    if (!isOwner) throw new Error("Forbidden: not your order");
    if (status !== "draft") throw new Error(`Cannot delete items in status: ${status}`);
  } else {
    // admin: block deletes during processing/partial/delivered
    if (status === "processing" || status === "partially_delivered") {
      throw new Error(`Cannot delete items in status: ${status}`);
    }
  }

  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id"]);
  const lastRow = shItems.getLastRow();
  if (lastRow < 2) return { success: true, deleted: 0 };

  const idsSet = {};
  order_item_ids.forEach(id => { idsSet[String(id).trim()] = true; });

  // Delete bottom-up by sheet row
  const data = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn()).getValues();
  const toDelete = [];
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][mI.order_id]) !== order_id) continue;
    const oid = String(data[i][mI.order_item_id] || "").trim();
    if (idsSet[oid]) toDelete.push(i + 2);
  }

  for (let i = toDelete.length - 1; i >= 0; i--) {
    shItems.deleteRow(toDelete[i]);
  }

  return { success: true, deleted: toDelete.length };
}

/**
 * Delete an entire order.
 * Recommended: admin only (safe). If you want draft-owner delete, add it later.
 */
function UK_handleDeleteOrder(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const shOrders = ss.getSheetByName("uk_orders");
  const shItems = ss.getSheetByName("uk_order_items");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "status"]);
  const oFound = _findRowIndexById_(shOrders, mO.order_id, order_id);
  if (oFound.rowIndex < 0) throw new Error(`Order not found: ${order_id}`);

  const status = String(oFound.row[mO.status] || "").trim().toLowerCase();
  UK_assertNotDelivered_(status);

  // Block delete if processing/partial (recommended)
  if (status === "processing" || status === "partially_delivered") {
    throw new Error(`Cannot delete order in status: ${status}`);
  }

  // Delete items first (bottom-up)
  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id"]);
  const itemsLastRow = shItems.getLastRow();
  if (itemsLastRow >= 2) {
    const itemsData = shItems.getRange(2, 1, itemsLastRow - 1, shItems.getLastColumn()).getValues();
    const toDeleteItems = [];
    for (let i = 0; i < itemsData.length; i++) {
      if (String(itemsData[i][mI.order_id]) === order_id) toDeleteItems.push(i + 2);
    }
    for (let i = toDeleteItems.length - 1; i >= 0; i--) shItems.deleteRow(toDeleteItems[i]);
  }

  // Delete order row
  shOrders.deleteRow(oFound.rowIndex);

  return { success: true, order_id };
}

/************** helpers **************/

function _assertOnlyFields_(obj, allowed) {
  const allow = {};
  allowed.forEach(k => allow[k] = true);
  Object.keys(obj).forEach(k => {
    if (!allow[k]) throw new Error(`Field not allowed: ${k}`);
  });
}

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

function _numOrZero_(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).trim());
  if (!isFinite(n)) return 0;
  return n;
}

function _numOrBlank_(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(String(v).trim());
  if (!isFinite(n)) return "";
  return n;
}