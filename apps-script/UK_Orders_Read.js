/************** UK_Orders_Create.gs **************
Step 3 — Orders Create (NEW schema)

Creates:
- 1 row in `uk_orders`
- 0..N rows in `uk_order_items` (from `uk_cart_items`, deduped by product_id, quantities summed)
- status = submitted
- clears cart rows for that email

Depends on Step 2 utilities:
- UK_getMapStrict_(sheet, requiredCols)
- UK_roundGBP_(n), UK_roundBDT_(n)
- (existing) ukRequireActiveUser_()  // your auth helper
**************************************************/

function UK_handleCreateOrder(body) {
  body = body || {};
  const ss = ukOpenSS_();

  // --- Auth (reuse your existing auth helper if present) ---
  // Expected to return: { email, name, role, creator_can_see_price_gbp? }
  let user;
  if (typeof ukRequireActiveUser_ === "function") {
    user = ukRequireActiveUser_(body); // many codebases pass body; ok if ignored
  } else {
    // fallback (dev-only)
    user = {
      email: String(body.email || "").trim(),
      name: String(body.creator_name || body.name || "").trim(),
      role: String(body.creator_role || body.role || "customer").trim(),
      creator_can_see_price_gbp: !!body.creator_can_see_price_gbp
    };
  }
  const email = String(body.email || user.email || "").trim();
  if (!email) throw new Error("email is required");

  const orderName = String(body.order_name || body.orderName || "").trim();

  const shOrders = ss.getSheetByName("uk_orders");
  const shItems = ss.getSheetByName("uk_order_items");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  // --- Required cols (fail fast) ---
  const ordersRequired = [
    "order_id",
    "order_name",
    "creator_email",
    "creator_name",
    "creator_role",
    "creator_can_see_price_gbp",
    "status",
    "created_at",
    "updated_at"
  ];
  const itemsRequired = [
    "order_item_id",
    "item_sl",
    "order_id",
    "product_id",
    "ordered_quantity",
    "pricing_mode_id",
    "profit_rate",
    "offered_unit_gbp",
    "customer_unit_gbp",
    "final_unit_gbp",
    "offered_unit_bdt",
    "customer_unit_bdt",
    "final_unit_bdt",
    "buy_price_gbp",
    "allocated_qty_total",
    "shipped_qty_total",
    "remaining_qty",
    "item_status"
  ];

  const mOrders = UK_getMapStrict_(shOrders, ordersRequired);
  const mItems = UK_getMapStrict_(shItems, itemsRequired);

  // --- Build new order row ---
  const now = new Date();
  const order_id = UK_makeId_("ORD");
  const status = "submitted";

  const orderRow = new Array(shOrders.getLastColumn()).fill("");
  orderRow[mOrders.order_id] = order_id;
  orderRow[mOrders.order_name] = orderName;
  orderRow[mOrders.creator_email] = email;
  orderRow[mOrders.creator_name] = String(user.name || "").trim();
  orderRow[mOrders.creator_role] = String(user.role || "").trim();
  orderRow[mOrders.creator_can_see_price_gbp] = !!(user.creator_can_see_price_gbp);
  orderRow[mOrders.status] = status;
  orderRow[mOrders.created_at] = now;
  orderRow[mOrders.updated_at] = now;

  shOrders.appendRow(orderRow);

  // --- Pull cart items, dedupe by product_id, sum qty ---
  const cartItems = UK_getCartItemsForOrder_(email); // array of plain objects
  const dedup = {}; // product_id -> aggregated item
  cartItems.forEach(ci => {
    const pid = String(ci.product_id || "").trim();
    if (!pid) return;

    const qty = Number(ci.ordered_quantity ?? ci.quantity ?? 0) || 0;
    if (qty <= 0) return;

    if (!dedup[pid]) {
      dedup[pid] = Object.assign({}, ci);
      dedup[pid].ordered_quantity = qty;
    } else {
      dedup[pid].ordered_quantity += qty;
    }
  });

  const agg = Object.keys(dedup).map(pid => dedup[pid]);

  // --- Insert order_items rows (can be 0 rows; allowed in Step 3) ---
  if (agg.length) {
    const rows = [];
    for (let i = 0; i < agg.length; i++) {
      const item_sl = i + 1;
      const ci = agg[i];

      const orderedQty = Number(ci.ordered_quantity || 0) || 0;

      const row = new Array(shItems.getLastColumn()).fill("");
      row[mItems.order_item_id] = order_id + "-" + item_sl;
      row[mItems.item_sl] = item_sl;
      row[mItems.order_id] = order_id;
      row[mItems.product_id] = String(ci.product_id || "").trim();

      // Optional identity fields if they exist on your sheet (safe set if col is present)
      UK_setIfColExists_(mItems, row, "barcode", ci.barcode);
      UK_setIfColExists_(mItems, row, "brand", ci.brand);
      UK_setIfColExists_(mItems, row, "name", ci.name);
      UK_setIfColExists_(mItems, row, "image_url", ci.image_url);
      UK_setIfColExists_(mItems, row, "case_size", ci.case_size);

      row[mItems.ordered_quantity] = orderedQty;

      // Step 3: pricing not set yet; leave blank/0
      row[mItems.pricing_mode_id] = String(ci.pricing_mode_id || "").trim(); // optional
      row[mItems.profit_rate] = (ci.profit_rate === "" || ci.profit_rate === null || ci.profit_rate === undefined)
        ? ""
        : Number(ci.profit_rate);

      // negotiation unit fields blank
      row[mItems.offered_unit_gbp] = "";
      row[mItems.customer_unit_gbp] = "";
      row[mItems.final_unit_gbp] = "";
      row[mItems.offered_unit_bdt] = "";
      row[mItems.customer_unit_bdt] = "";
      row[mItems.final_unit_bdt] = "";

      // buy price (optional; if present in cart)
      row[mItems.buy_price_gbp] = (ci.buy_price_gbp === "" || ci.buy_price_gbp === null || ci.buy_price_gbp === undefined)
        ? ""
        : UK_roundGBP_(ci.buy_price_gbp);

      // tracking fields
      row[mItems.allocated_qty_total] = 0;
      row[mItems.shipped_qty_total] = 0;
      row[mItems.remaining_qty] = orderedQty;
      row[mItems.item_status] = "not_started";

      rows.push(row);
    }

    const startRow = shItems.getLastRow() + 1;
    shItems.getRange(startRow, 1, rows.length, shItems.getLastColumn()).setValues(rows);

    // Clear cart (only if we actually created items)
    UK_clearCartForEmail_(email);
  }

  // Step 3 exit criteria: BDT totals remain 0 until allocations exist
  // (If you have totals columns in uk_orders, keep them as formulas or leave blank here.)

  return {
    success: true,
    order_id: order_id,
    created_items: agg.length,
    status: status
  };
}

/**
 * Reads `uk_cart_items` for the email and returns array of objects.
 * Minimal required: product_id and quantity/ordered_quantity.
 * Everything else is optional and will be passed through if present.
 */
function UK_getCartItemsForOrder_(email) {
  const ss = ukOpenSS_();
  const shCart = ss.getSheetByName("uk_cart_items");
  if (!shCart) return [];

  const lastRow = shCart.getLastRow();
  const lastCol = shCart.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headers = shCart.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  const map = {};
  headers.forEach((h, i) => { if (h && map[h] === undefined) map[h] = i; });

  // Try common column names
  const colEmail = UK_firstExistingCol_(map, ["email", "user_email", "creator_email"]);
  const colPid = UK_firstExistingCol_(map, ["product_id", "pid"]);
  const colQty = UK_firstExistingCol_(map, ["ordered_quantity", "quantity", "qty"]);

  if (colEmail === null || colPid === null || colQty === null) {
    // Not throwing in Step 3; return empty so order can be created without items
    return [];
  }

  const values = shCart.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const out = [];
  const target = String(email).trim().toLowerCase();

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const rEmail = String(r[colEmail] || "").trim().toLowerCase();
    if (rEmail !== target) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = r[idx];
    });

    // normalize keys used by creator
    obj.product_id = r[colPid];
    obj.ordered_quantity = r[colQty];

    out.push(obj);
  }
  return out;
}

/** Removes all rows in `uk_cart_items` matching email (keeps header row). */
function UK_clearCartForEmail_(email) {
  const ss = ukOpenSS_();
  const shCart = ss.getSheetByName("uk_cart_items");
  if (!shCart) return;

  const lastRow = shCart.getLastRow();
  const lastCol = shCart.getLastColumn();
  if (lastRow < 2) return;

  const headers = shCart.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  const map = {};
  headers.forEach((h, i) => { if (h && map[h] === undefined) map[h] = i; });

  const colEmail = UK_firstExistingCol_(map, ["email", "user_email", "creator_email"]);
  if (colEmail === null) return;

  const values = shCart.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const target = String(email).trim().toLowerCase();

  // Collect sheet row numbers to delete (bottom-up)
  const toDelete = [];
  for (let i = 0; i < values.length; i++) {
    const rEmail = String(values[i][colEmail] || "").trim().toLowerCase();
    if (rEmail === target) toDelete.push(i + 2);
  }
  for (let i = toDelete.length - 1; i >= 0; i--) {
    shCart.deleteRow(toDelete[i]);
  }
}

/************** Small helpers **************/

function UK_makeId_(prefix) {
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss");
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
  return `${prefix}_${ts}_${rand}`;
}

function UK_firstExistingCol_(map, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const k = candidates[i];
    if (map[k] !== undefined) return map[k];
  }
  return null;
}

function UK_setIfColExists_(m, row, colName, value) {
  if (m[colName] === undefined) return;
  row[m[colName]] = value === undefined ? "" : value;
}