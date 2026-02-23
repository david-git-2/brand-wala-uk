/************** UK_Orders_Edit.gs **************/

function UK_handleUpdateOrder(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const order_id = String(body.order_id || "").trim();
  const patch = body.patch || {};

  if (!order_id) throw new Error("order_id is required");
  if (!patch || typeof patch !== "object") throw new Error("patch object is required");
  if (patch.order_name === undefined && patch.counter_enabled === undefined) {
    throw new Error("Supported fields: patch.order_name, patch.counter_enabled");
  }

  const sh = ukGetSheet_("uk_orders");
  const m = UK_getMapStrict_(sh, ["order_id", "order_name", "creator_email", "status", "updated_at"]);
  const found = ukFindRowIndexById_(sh, m.order_id, order_id);
  if (found.rowIndex < 0) throw new Error("Order not found: " + order_id);

  const status = String(found.row[m.status] || "").toLowerCase();
  const creator = String(found.row[m.creator_email] || "").toLowerCase();
  const isOwner = creator === String(user.email || "").toLowerCase();

  if (!ukIsAdmin_(user)) {
    if (!isOwner) throw new Error("Forbidden: not your order");
    UK_assertOrderEditable_(user, status);
  } else {
    UK_assertNotDelivered_(status);
  }

  const headers = ukHeaderMap_(sh);
  if (patch.order_name !== undefined) {
    sh.getRange(found.rowIndex, m.order_name + 1).setValue(String(patch.order_name || "").trim());
  }
  if (patch.counter_enabled !== undefined) {
    if (!ukIsAdmin_(user)) throw new Error("Admin only: patch.counter_enabled");
    if (headers.counter_enabled == null) throw new Error("Missing column: counter_enabled");
    sh.getRange(found.rowIndex, headers.counter_enabled + 1).setValue(ukBool01_(patch.counter_enabled));
  }
  sh.getRange(found.rowIndex, m.updated_at + 1).setValue(new Date());

  return { success: true, order_id: order_id };
}

function UK_handleUpdateOrderItems(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const order_id = String(body.order_id || "").trim();
  const itemsPatch = Array.isArray(body.items) ? body.items : [];

  if (!order_id) throw new Error("order_id is required");
  if (!itemsPatch.length) throw new Error("items[] patches are required");

  const shOrders = ukGetSheet_("uk_orders");
  const shItems = ukGetSheet_("uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "status", "creator_email"]);
  const of = ukFindRowIndexById_(shOrders, mO.order_id, order_id);
  if (of.rowIndex < 0) throw new Error("Order not found: " + order_id);

  const status = String(of.row[mO.status] || "").toLowerCase();
  const creator = String(of.row[mO.creator_email] || "").toLowerCase();
  const isOwner = creator === String(user.email || "").toLowerCase();

  if (!ukIsAdmin_(user) && !isOwner) throw new Error("Forbidden: not your order");
  if (!ukIsAdmin_(user) && status === "processing") throw new Error("Order items are read-only in processing");
  if (status === "partially_delivered") throw new Error("Order items are read-only in partially_delivered");

  const mI = UK_getMapStrict_(shItems, [
    "order_item_id", "order_id", "ordered_quantity", "pricing_mode_id", "profit_rate",
    "offered_unit_gbp", "customer_unit_gbp", "final_unit_gbp",
    "offered_unit_bdt", "customer_unit_bdt", "final_unit_bdt"
  ]);

  const patchById = {};
  for (let i = 0; i < itemsPatch.length; i++) {
    const p = itemsPatch[i] || {};
    const oid = String(p.order_item_id || "").trim();
    if (!oid) throw new Error("Each item patch must include order_item_id");
    patchById[oid] = p;
  }

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) throw new Error("No order_items rows found");

  const range = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn());
  const data = range.getValues();
  let changed = false;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const oid = String(r[mI.order_item_id] || "").trim();
    const p = patchById[oid];
    if (!p) continue;

    const fields = Object.keys(p);
    UK_assertOrderItemEditable_(user, status, fields);

    if (ukIsAdmin_(user)) {
      if (p.pricing_mode_id !== undefined) r[mI.pricing_mode_id] = String(p.pricing_mode_id || "").trim();
      if (p.profit_rate !== undefined) r[mI.profit_rate] = ukNumOrBlank_(p.profit_rate);
      if (p.offered_unit_gbp !== undefined) r[mI.offered_unit_gbp] = UK_roundGBP_(p.offered_unit_gbp);
      if (p.offered_unit_bdt !== undefined) r[mI.offered_unit_bdt] = UK_roundBDT_(p.offered_unit_bdt);
      if (p.final_unit_gbp !== undefined) r[mI.final_unit_gbp] = UK_roundGBP_(p.final_unit_gbp);
      if (p.final_unit_bdt !== undefined) r[mI.final_unit_bdt] = UK_roundBDT_(p.final_unit_bdt);
      changed = true;
      continue;
    }

    if (status === "draft" && p.ordered_quantity !== undefined) {
      const q = ukNum_(p.ordered_quantity, 0);
      if (q <= 0) throw new Error("ordered_quantity must be > 0");
      r[mI.ordered_quantity] = q;
      changed = true;
    }

    if (status === "priced" || status === "under_review") {
      if (p.customer_unit_gbp !== undefined) r[mI.customer_unit_gbp] = UK_roundGBP_(p.customer_unit_gbp);
      if (p.customer_unit_bdt !== undefined) r[mI.customer_unit_bdt] = UK_roundBDT_(p.customer_unit_bdt);
      changed = true;
    }
  }

  if (changed) range.setValues(data);
  return { success: true, order_id: order_id };
}

function UK_handleDeleteOrderItems(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const order_id = String(body.order_id || "").trim();
  const order_item_ids = Array.isArray(body.order_item_ids) ? body.order_item_ids : [];

  if (!order_id) throw new Error("order_id is required");
  if (!order_item_ids.length) throw new Error("order_item_ids[] is required");

  const shOrders = ukGetSheet_("uk_orders");
  const shItems = ukGetSheet_("uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "status", "creator_email"]);
  const of = ukFindRowIndexById_(shOrders, mO.order_id, order_id);
  if (of.rowIndex < 0) throw new Error("Order not found: " + order_id);

  const status = String(of.row[mO.status] || "").toLowerCase();
  const creator = String(of.row[mO.creator_email] || "").toLowerCase();
  const isOwner = creator === String(user.email || "").toLowerCase();

  UK_assertNotDelivered_(status);

  if (!ukIsAdmin_(user)) {
    if (!isOwner) throw new Error("Forbidden: not your order");
    if (status !== "draft") throw new Error("Cannot delete items in status: " + status);
  } else if (status === "processing" || status === "partially_delivered") {
    throw new Error("Cannot delete items in status: " + status);
  }

  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id"]);
  const idsSet = {};
  order_item_ids.forEach(function(id) { idsSet[String(id || "").trim()] = true; });

  const lastRow = shItems.getLastRow();
  if (lastRow < 2) return { success: true, deleted: 0 };

  const data = shItems.getRange(2, 1, lastRow - 1, shItems.getLastColumn()).getValues();
  const toDelete = [];
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][mI.order_id]) !== order_id) continue;
    const oid = String(data[i][mI.order_item_id] || "").trim();
    if (idsSet[oid]) toDelete.push(i + 2);
  }

  for (let i = toDelete.length - 1; i >= 0; i--) shItems.deleteRow(toDelete[i]);
  return { success: true, deleted: toDelete.length };
}

function UK_handleDeleteOrder(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const shOrders = ukGetSheet_("uk_orders");
  const shItems = ukGetSheet_("uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "status", "order_name"]);
  const of = ukFindRowIndexById_(shOrders, mO.order_id, order_id);
  if (of.rowIndex < 0) throw new Error("Order not found: " + order_id);

  const status = String(of.row[mO.status] || "").toLowerCase();
  // Permanent delete is allowed only when order is finalized lifecycle end.
  if (status !== "delivered" && status !== "cancelled") {
    throw new Error("Permanent delete allowed only for delivered/cancelled orders");
  }

  const mI = UK_getMapStrict_(shItems, ["order_item_id", "order_id"]);
  const lastRowI = shItems.getLastRow();
  if (lastRowI >= 2) {
    const data = shItems.getRange(2, 1, lastRowI - 1, shItems.getLastColumn()).getValues();
    const del = [];
    for (let i = 0; i < data.length; i++) if (String(data[i][mI.order_id]) === order_id) del.push(i + 2);
    for (let i = del.length - 1; i >= 0; i--) shItems.deleteRow(del[i]);
  }

  // Cascade delete allocations linked to this order
  const shAlloc = ukGetSheet_("uk_shipment_allocation");
  const mA = UK_getMapStrict_(shAlloc, ["allocation_id", "order_id"]);
  const lastRowA = shAlloc.getLastRow();
  if (lastRowA >= 2) {
    const dataA = shAlloc.getRange(2, 1, lastRowA - 1, shAlloc.getLastColumn()).getValues();
    const delA = [];
    for (let i = 0; i < dataA.length; i++) if (String(dataA[i][mA.order_id]) === order_id) delA.push(i + 2);
    for (let i = delA.length - 1; i >= 0; i--) shAlloc.deleteRow(delA[i]);
  }

  shOrders.deleteRow(of.rowIndex);
  return { success: true, order_id: order_id, deleted_status: status };
}
