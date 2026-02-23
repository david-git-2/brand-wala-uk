/************** UK_Orders_Read.gs **************
Step 4 — Orders Read

Implements:
- UK_handleGetOrders(body)
- UK_handleGetOrderItems(body)

Rules:
- Customer sees only their orders
- Admin sees all orders
- Respect creator_can_see_price_gbp: if false, hide GBP money fields from item payload

Depends on:
- UK_getMapStrict_(sheet, requiredCols)
- (existing) ukRequireActiveUser_()
**************************************************/

function UK_handleGetOrders(body) {
  body = body || {};
  const ss = ukOpenSS_();

  // Auth
  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : {
        email: String(body.email || "").trim(),
        role: String(body.role || "customer").trim()
      };

  const email = String(body.email || user.email || "").trim();
  if (!email) throw new Error("email is required");

  const role = String(user.role || "customer").toLowerCase();

  const sh = ss.getSheetByName("uk_orders");
  if (!sh) throw new Error("Missing sheet: uk_orders");

  const required = [
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

  // Optional totals (if present, we’ll include them)
  const optionalTotals = [
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

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  const headerSet = {};
  headers.forEach(h => { if (h) headerSet[h] = true; });

  // Required strict
  const m = UK_getMapStrict_(sh, required);

  // Optional map (only those that exist)
  const optCols = optionalTotals.filter(c => headerSet[c]);
  const mOpt = {};
  optCols.forEach(c => { mOpt[c] = headers.indexOf(c); });

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: true, orders: [] };

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const out = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];

    const creatorEmail = String(r[m.creator_email] || "").trim().toLowerCase();
    if (role !== "admin" && creatorEmail !== email.toLowerCase()) continue;

    const obj = {
      order_id: r[m.order_id],
      order_name: r[m.order_name],
      creator_email: r[m.creator_email],
      creator_name: r[m.creator_name],
      creator_role: r[m.creator_role],
      creator_can_see_price_gbp: !!r[m.creator_can_see_price_gbp],
      status: r[m.status],
      created_at: r[m.created_at],
      updated_at: r[m.updated_at]
    };

    // Include optional totals if present on the sheet
    optCols.forEach(c => { obj[c] = r[mOpt[c]]; });

    out.push(obj);
  }

  // Sort newest first (by created_at if present)
  out.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return { success: true, orders: out };
}


function UK_handleGetOrderItems(body) {
  body = body || {};
  const ss = ukOpenSS_();

  // Auth
  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : {
        email: String(body.email || "").trim(),
        role: String(body.role || "customer").trim()
      };

  const email = String(body.email || user.email || "").trim();
  if (!email) throw new Error("email is required");

  const role = String(user.role || "customer").toLowerCase();

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const shOrders = ss.getSheetByName("uk_orders");
  const shItems = ss.getSheetByName("uk_order_items");
  if (!shOrders) throw new Error("Missing sheet: uk_orders");
  if (!shItems) throw new Error("Missing sheet: uk_order_items");

  // Orders: verify access and read creator_can_see_price_gbp
  const ordersReq = ["order_id", "creator_email", "creator_can_see_price_gbp"];
  const mO = UK_getMapStrict_(shOrders, ordersReq);

  const ordersLastRow = shOrders.getLastRow();
  if (ordersLastRow < 2) throw new Error(`Order not found: ${order_id}`);

  const ordersData = shOrders.getRange(2, 1, ordersLastRow - 1, shOrders.getLastColumn()).getValues();

  let orderRow = null;
  for (let i = 0; i < ordersData.length; i++) {
    if (String(ordersData[i][mO.order_id]) === order_id) {
      orderRow = ordersData[i];
      break;
    }
  }
  if (!orderRow) throw new Error(`Order not found: ${order_id}`);

  const creatorEmail = String(orderRow[mO.creator_email] || "").trim().toLowerCase();
  const canSeeGBP = !!orderRow[mO.creator_can_see_price_gbp];

  if (role !== "admin" && creatorEmail !== email.toLowerCase()) {
    throw new Error("Forbidden: you do not have access to this order");
  }

  // Items: fetch rows for order_id
  const itemsReq = [
    "order_item_id",
    "item_sl",
    "order_id",
    "product_id",
    "barcode",
    "brand",
    "name",
    "image_url",
    "case_size",
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

  const mI = UK_getMapStrict_(shItems, itemsReq);

  const itemsLastRow = shItems.getLastRow();
  if (itemsLastRow < 2) return { success: true, order_id, items: [] };

  const itemsData = shItems.getRange(2, 1, itemsLastRow - 1, shItems.getLastColumn()).getValues();

  const out = [];
  for (let i = 0; i < itemsData.length; i++) {
    const r = itemsData[i];
    if (String(r[mI.order_id]) !== order_id) continue;

    const obj = {
      order_item_id: r[mI.order_item_id],
      item_sl: r[mI.item_sl],
      order_id: r[mI.order_id],
      product_id: r[mI.product_id],
      barcode: r[mI.barcode],
      brand: r[mI.brand],
      name: r[mI.name],
      image_url: r[mI.image_url],
      case_size: r[mI.case_size],
      ordered_quantity: r[mI.ordered_quantity],
      pricing_mode_id: r[mI.pricing_mode_id],
      profit_rate: r[mI.profit_rate],

      // Negotiation (unit prices)
      offered_unit_gbp: r[mI.offered_unit_gbp],
      customer_unit_gbp: r[mI.customer_unit_gbp],
      final_unit_gbp: r[mI.final_unit_gbp],
      offered_unit_bdt: r[mI.offered_unit_bdt],
      customer_unit_bdt: r[mI.customer_unit_bdt],
      final_unit_bdt: r[mI.final_unit_bdt],

      // Buy
      buy_price_gbp: r[mI.buy_price_gbp],

      // Tracking
      allocated_qty_total: r[mI.allocated_qty_total],
      shipped_qty_total: r[mI.shipped_qty_total],
      remaining_qty: r[mI.remaining_qty],
      item_status: r[mI.item_status]
    };

    // Hide GBP prices for customers if creator_can_see_price_gbp is FALSE
    if (role !== "admin" && !canSeeGBP) {
      delete obj.offered_unit_gbp;
      delete obj.customer_unit_gbp;
      delete obj.final_unit_gbp;
      delete obj.buy_price_gbp; // often considered sensitive if GBP hidden
    }

    out.push(obj);
  }

  // Sort by item_sl
  out.sort((a, b) => Number(a.item_sl || 0) - Number(b.item_sl || 0));

  return {
    success: true,
    order_id: order_id,
    creator_can_see_price_gbp: canSeeGBP,
    items: out
  };
}