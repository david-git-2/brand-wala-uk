/************** UK_Orders_Create.gs **************/

function UK_handleCreateOrder(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const email = String(user.email || "").trim();
  const order_name = String(body.order_name || "").trim();

  const shOrders = ukGetSheet_("uk_orders");
  const shItems = ukGetSheet_("uk_order_items");
  const orderSlCol = UK_ensureOrderSerials_(shOrders);

  const mO = UK_getMapStrict_(shOrders, [
    "order_id", "order_name", "creator_email", "creator_name", "creator_role",
    "creator_can_see_price_gbp", "status", "created_at", "updated_at"
  ]);

  const mI = UK_getMapStrict_(shItems, [
    "order_item_id", "item_sl", "order_id", "product_id", "ordered_quantity",
    "pricing_mode_id", "profit_rate", "offered_unit_gbp", "customer_unit_gbp", "final_unit_gbp",
    "offered_unit_bdt", "customer_unit_bdt", "final_unit_bdt", "buy_price_gbp",
    "allocated_qty_total", "shipped_qty_total", "remaining_qty", "item_status"
  ]);

  const cartRows = UK_createGetCartItems_(email);
  const dedup = {};

  for (let i = 0; i < cartRows.length; i++) {
    const c = cartRows[i];
    const pid = String(c.product_id || "").trim();
    const qty = ukNum_(c.quantity != null ? c.quantity : c.ordered_quantity, 0);
    if (!pid || qty <= 0) continue;

    if (!dedup[pid]) {
      dedup[pid] = {
        product_id: pid,
        barcode: c.barcode || "",
        brand: c.brand || "",
        name: c.name || "",
        image_url: c.image_url || "",
        case_size: c.case_size || "",
        buy_price_gbp: c.buy_price_gbp || c.price_gbp || "",
        ordered_quantity: qty,
      };
    } else {
      dedup[pid].ordered_quantity += qty;
    }
  }

  const lines = Object.keys(dedup).map(function(k) { return dedup[k]; });
  if (!lines.length) throw new Error("Cannot create order: cart is empty");

  const now = new Date();
  const order_id = ukMakeId_("ORD");

  const orderRow = new Array(shOrders.getLastColumn()).fill("");
  orderRow[mO.order_id] = order_id;
  if (orderSlCol != null) orderRow[orderSlCol] = UK_nextOrderSerial_(shOrders, orderSlCol);
  orderRow[mO.order_name] = order_name;
  orderRow[mO.creator_email] = email;
  orderRow[mO.creator_name] = String(user.name || "").trim();
  orderRow[mO.creator_role] = String(user.role || "customer").trim();
  orderRow[mO.creator_can_see_price_gbp] = ukBool01_(user.can_see_price_gbp);
  orderRow[mO.status] = "submitted";
  orderRow[mO.created_at] = now;
  orderRow[mO.updated_at] = now;

  const mapO = ukHeaderMap_(shOrders);
  if (mapO.total_order_qty != null) orderRow[mapO.total_order_qty] = lines.reduce(function(s, x) { return s + ukNum_(x.ordered_quantity, 0); }, 0);
  if (mapO.counter_enabled != null) orderRow[mapO.counter_enabled] = 1;
  if (mapO.total_allocated_qty != null) orderRow[mapO.total_allocated_qty] = 0;
  if (mapO.total_shipped_qty != null) orderRow[mapO.total_shipped_qty] = 0;
  if (mapO.total_remaining_qty != null) orderRow[mapO.total_remaining_qty] = orderRow[mapO.total_order_qty] || 0;
  if (mapO.total_revenue_bdt != null) orderRow[mapO.total_revenue_bdt] = 0;
  if (mapO.total_product_cost_bdt != null) orderRow[mapO.total_product_cost_bdt] = 0;
  if (mapO.total_cargo_cost_bdt != null) orderRow[mapO.total_cargo_cost_bdt] = 0;
  if (mapO.total_total_cost_bdt != null) orderRow[mapO.total_total_cost_bdt] = 0;
  if (mapO.total_profit_bdt != null) orderRow[mapO.total_profit_bdt] = 0;

  shOrders.appendRow(orderRow);

  const outRows = [];
  for (let i = 0; i < lines.length; i++) {
    const sl = i + 1;
    const it = lines[i];
    const qty = ukNum_(it.ordered_quantity, 0);

    const row = new Array(shItems.getLastColumn()).fill("");
    row[mI.order_item_id] = order_id + "-" + sl;
    row[mI.item_sl] = sl;
    row[mI.order_id] = order_id;
    row[mI.product_id] = it.product_id;

    const mapI = ukHeaderMap_(shItems);
    if (mapI.barcode != null) row[mapI.barcode] = it.barcode;
    if (mapI.brand != null) row[mapI.brand] = it.brand;
    if (mapI.name != null) row[mapI.name] = it.name;
    if (mapI.image_url != null) row[mapI.image_url] = it.image_url;
    if (mapI.case_size != null) row[mapI.case_size] = it.case_size;

    row[mI.ordered_quantity] = qty;
    row[mI.pricing_mode_id] = "";
    row[mI.profit_rate] = "";

    row[mI.offered_unit_gbp] = "";
    row[mI.customer_unit_gbp] = "";
    row[mI.final_unit_gbp] = "";
    row[mI.offered_unit_bdt] = "";
    row[mI.customer_unit_bdt] = "";
    row[mI.final_unit_bdt] = "";

    row[mI.buy_price_gbp] = UK_roundGBP_(it.buy_price_gbp);
    row[mI.allocated_qty_total] = 0;
    row[mI.shipped_qty_total] = 0;
    row[mI.remaining_qty] = qty;
    row[mI.item_status] = "not_started";

    outRows.push(row);
  }

  shItems.getRange(shItems.getLastRow() + 1, 1, outRows.length, shItems.getLastColumn()).setValues(outRows);

  if (typeof UK_clearCartForEmail_ === "function") {
    UK_clearCartForEmail_(email);
  }

  return {
    success: true,
    order_id: order_id,
    status: "submitted",
    created_items: outRows.length,
  };
}

function UK_ensureOrderSerials_(shOrders) {
  let map = ukHeaderMap_(shOrders);
  let col = map.order_sl;

  if (col == null) {
    const newCol = shOrders.getLastColumn() + 1;
    shOrders.getRange(1, newCol).setValue("order_sl");
    col = newCol - 1;
    map = ukHeaderMap_(shOrders);
  }

  const orderIdCol = map.order_id;
  if (orderIdCol == null) return col;

  const lastRow = shOrders.getLastRow();
  if (lastRow < 2) return col;

  const createdCol = map.created_at;
  const data = shOrders.getRange(2, 1, lastRow - 1, shOrders.getLastColumn()).getValues();

  let maxSl = 0;
  const missing = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const oid = String(row[orderIdCol] || "").trim();
    if (!oid) continue;
    const sl = Number(row[col]);
    if (Number.isFinite(sl) && sl > 0) {
      if (sl > maxSl) maxSl = sl;
    } else {
      missing.push({
        i: i,
        t: createdCol != null && row[createdCol] ? new Date(row[createdCol]).getTime() : 0,
      });
    }
  }

  if (!missing.length) return col;
  missing.sort(function(a, b) {
    if (a.t !== b.t) return a.t - b.t;
    return a.i - b.i;
  });

  for (let j = 0; j < missing.length; j++) {
    maxSl += 1;
    data[missing[j].i][col] = maxSl;
  }
  shOrders.getRange(2, 1, lastRow - 1, shOrders.getLastColumn()).setValues(data);
  return col;
}

function UK_nextOrderSerial_(shOrders, orderSlCol) {
  const lastRow = shOrders.getLastRow();
  if (lastRow < 2) return 1;
  const vals = shOrders.getRange(2, orderSlCol + 1, lastRow - 1, 1).getValues();
  let maxSl = 0;
  for (let i = 0; i < vals.length; i++) {
    const n = Number(vals[i][0]);
    if (Number.isFinite(n) && n > maxSl) maxSl = n;
  }
  return maxSl + 1;
}

function UK_createGetCartItems_(email) {
  const sh = ukGetSheet_("uk_cart_items");
  const rows = ukReadObjects_(sh).rows;
  const target = String(email || "").trim().toLowerCase();
  return rows.filter(function(r) {
    return String(r.user_email || r.email || "").trim().toLowerCase() === target;
  });
}
