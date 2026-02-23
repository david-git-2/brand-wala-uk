/************** UK_Guards.gs **************/

function UK_roundGBP_(n) {
  if (n === "" || n === null || n === undefined) return "";
  const num = Number(String(n).trim());
  if (!isFinite(num)) return "";
  return Math.round(num * 100) / 100;
}

function UK_roundBDT_(n) {
  if (n === "" || n === null || n === undefined) return "";
  const num = Number(String(n).trim());
  if (!isFinite(num)) return "";
  return Math.round(num);
}

function UK_assertAdmin_(user) {
  if (!user || !user.role) throw new Error("Unauthorized: missing user/role");
  if (String(user.role).toLowerCase() !== "admin") throw new Error("Admin only");
}

function UK_assertNotDelivered_(status) {
  if (String(status || "").toLowerCase() === "delivered") {
    throw new Error("Order is delivered and locked");
  }
}

function UK_assertOrderExists_(order_id) {
  if (!order_id) throw new Error("order_id is required");

  const sh = ukGetSheet_("uk_orders");
  const m = UK_getMapStrict_(sh, ["order_id", "status", "creator_email"]);
  const found = ukFindRowIndexById_(sh, m.order_id, order_id);

  if (found.rowIndex < 0) throw new Error("Order not found: " + order_id);

  return {
    rowIndex: found.rowIndex,
    order_id: found.row[m.order_id],
    status: found.row[m.status],
    creator_email: found.row[m.creator_email],
  };
}

function UK_assertStatusTransition_(fromStatus, toStatus, role) {
  const fromS = String(fromStatus || "").toLowerCase();
  const toS = String(toStatus || "").toLowerCase();
  const r = String(role || "").toLowerCase();

  const customer = {
    draft: ["submitted"],
    priced: ["under_review", "finalized"],
    under_review: ["under_review"],
  };

  const admin = {
    draft: ["submitted", "cancelled"],
    submitted: ["priced", "cancelled"],
    priced: ["under_review", "finalized", "cancelled"],
    under_review: ["priced", "finalized", "cancelled"],
    finalized: ["processing", "cancelled"],
    processing: ["partially_delivered", "delivered", "cancelled"],
    partially_delivered: ["processing", "delivered", "cancelled"],
    cancelled: [],
    delivered: [],
  };

  const tbl = (r === "admin") ? admin : customer;
  const allowed = tbl[fromS] || [];
  if (allowed.indexOf(toS) === -1) {
    throw new Error("Invalid transition: " + fromS + " -> " + toS + " for role=" + r);
  }
  return true;
}

function UK_assertOrderEditable_(user, status) {
  const role = String((user && user.role) || "customer").toLowerCase();
  const s = String(status || "").toLowerCase();

  UK_assertNotDelivered_(s);
  if (role === "admin") return true;
  if (s !== "draft") throw new Error("Order is read-only in status: " + s);
  return true;
}

function UK_assertOrderItemEditable_(user, status, fields) {
  const role = String((user && user.role) || "customer").toLowerCase();
  const s = String(status || "").toLowerCase();
  const f = fields || [];

  UK_assertNotDelivered_(s);

  if (role === "admin") {
    if (s === "processing") {
      throw new Error("Order items are read-only in processing; update shipment_allocation.shipped_qty");
    }
    return true;
  }

  if (s === "draft") {
    const allowedDraft = { order_item_id: true, ordered_quantity: true };
    f.forEach(function(k) { if (!allowedDraft[k]) throw new Error("Field not allowed in draft: " + k); });
    return true;
  }

  if (s === "priced" || s === "under_review") {
    const allowedCounter = { order_item_id: true, customer_unit_gbp: true, customer_unit_bdt: true };
    f.forEach(function(k) { if (!allowedCounter[k]) throw new Error("Field not allowed in " + s + ": " + k); });
    return true;
  }

  throw new Error("Customer cannot edit items in status: " + s);
}

function UK_assertNoOverShip_(order_item_id, shippedQtyDelta, exclude_allocation_id) {
  const itemId = String(order_item_id || "").trim();
  if (!itemId) throw new Error("order_item_id is required");

  const shItems = ukGetSheet_("uk_order_items");
  const shAlloc = ukGetSheet_("uk_shipment_allocation");

  const mI = UK_getMapStrict_(shItems, ["order_item_id", "ordered_quantity"]);
  const itemRow = ukFindRowById_(shItems, mI.order_item_id, itemId);
  if (!itemRow) throw new Error("order_item_id not found: " + itemId);

  const ordered = ukNum_(itemRow[mI.ordered_quantity], 0);

  const mA = UK_getMapStrict_(shAlloc, ["allocation_id", "order_item_id", "shipped_qty"]);
  const lastRow = shAlloc.getLastRow();
  let existingShipped = 0;
  if (lastRow >= 2) {
    const data = shAlloc.getRange(2, 1, lastRow - 1, shAlloc.getLastColumn()).getValues();
    const excludeId = String(exclude_allocation_id || "").trim();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][mA.order_item_id]) !== itemId) continue;
      if (excludeId && String(data[i][mA.allocation_id]) === excludeId) continue;
      existingShipped += ukNum_(data[i][mA.shipped_qty], 0);
    }
  }

  const nextTotal = existingShipped + ukNum_(shippedQtyDelta, 0);
  if (nextTotal > ordered + 1e-9) {
    throw new Error("Over-ship blocked for " + itemId + ": " + nextTotal + " > ordered " + ordered);
  }
  return true;
}
