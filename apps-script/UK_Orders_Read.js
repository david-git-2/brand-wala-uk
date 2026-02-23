/************** UK_Orders_Read.gs **************/

function UK_handleGetOrders(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const role = String(user.role || "customer").toLowerCase();

  const sh = ukGetSheet_("uk_orders");
  if (typeof UK_ensureOrderSerials_ === "function") UK_ensureOrderSerials_(sh);
  const m = UK_getMapStrict_(sh, [
    "order_id", "order_name", "creator_email", "creator_name", "creator_role",
    "creator_can_see_price_gbp", "status", "created_at", "updated_at"
  ]);

  const rows = ukReadObjects_(sh).rows;
  const me = String(user.email || "").trim().toLowerCase();

  const out = rows
    .filter(function(r) {
      if (role === "admin") return true;
      return String(r.creator_email || "").trim().toLowerCase() === me;
    })
    .map(function(r) {
      const obj = {
        order_id: r.order_id,
        order_sl: r.order_sl === undefined || r.order_sl === "" ? "" : Number(r.order_sl),
        order_name: r.order_name,
        creator_email: r.creator_email,
        creator_name: r.creator_name,
        creator_role: r.creator_role,
        creator_can_see_price_gbp: ukToBool_(r.creator_can_see_price_gbp),
        status: r.status,
        counter_enabled: r.counter_enabled === undefined ? true : ukToBool_(r.counter_enabled),
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
      const totals = [
        "total_order_qty", "total_allocated_qty", "total_shipped_qty", "total_remaining_qty",
        "total_revenue_bdt", "total_product_cost_bdt", "total_cargo_cost_bdt", "total_total_cost_bdt", "total_profit_bdt"
      ];
      for (let i = 0; i < totals.length; i++) {
        const k = totals[i];
        if (r[k] !== undefined) obj[k] = r[k];
      }
      return obj;
    });

  out.sort(function(a, b) {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return { success: true, orders: out };
}

function UK_handleGetOrderItems(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  const role = String(user.role || "customer").toLowerCase();
  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const shOrders = ukGetSheet_("uk_orders");
  const shItems = ukGetSheet_("uk_order_items");

  const mO = UK_getMapStrict_(shOrders, ["order_id", "creator_email", "creator_can_see_price_gbp"]);
  const orderRow = ukFindRowById_(shOrders, mO.order_id, order_id);
  if (!orderRow) throw new Error("Order not found: " + order_id);

  const creatorEmail = String(orderRow[mO.creator_email] || "").trim().toLowerCase();
  if (role !== "admin" && creatorEmail !== String(user.email || "").trim().toLowerCase()) {
    throw new Error("Forbidden: you do not have access to this order");
  }
  const canSeeGBP = ukToBool_(orderRow[mO.creator_can_see_price_gbp]);

  UK_getMapStrict_(shItems, [
    "order_item_id", "item_sl", "order_id", "product_id", "ordered_quantity", "pricing_mode_id", "profit_rate",
    "offered_unit_gbp", "customer_unit_gbp", "final_unit_gbp", "offered_unit_bdt", "customer_unit_bdt", "final_unit_bdt",
    "buy_price_gbp", "allocated_qty_total", "shipped_qty_total", "remaining_qty", "item_status"
  ]);

  const rows = ukReadObjects_(shItems).rows.filter(function(r) {
    return String(r.order_id || "") === order_id;
  });

  const out = rows.map(function(r) {
    const obj = {
      order_item_id: r.order_item_id,
      item_sl: r.item_sl,
      order_id: r.order_id,
      product_id: r.product_id,
      barcode: r.barcode,
      brand: r.brand,
      name: r.name,
      image_url: r.image_url,
      case_size: r.case_size,
      ordered_quantity: r.ordered_quantity,
      pricing_mode_id: r.pricing_mode_id,
      profit_rate: r.profit_rate,
      offered_unit_gbp: r.offered_unit_gbp,
      customer_unit_gbp: r.customer_unit_gbp,
      final_unit_gbp: r.final_unit_gbp,
      offered_unit_bdt: r.offered_unit_bdt,
      customer_unit_bdt: r.customer_unit_bdt,
      final_unit_bdt: r.final_unit_bdt,
      buy_price_gbp: r.buy_price_gbp,
      allocated_qty_total: r.allocated_qty_total,
      shipped_qty_total: r.shipped_qty_total,
      remaining_qty: r.remaining_qty,
      item_status: r.item_status,
    };

    if (role !== "admin" && !canSeeGBP) {
      delete obj.offered_unit_gbp;
      delete obj.customer_unit_gbp;
      delete obj.final_unit_gbp;
      delete obj.buy_price_gbp;
    }
    return obj;
  });

  out.sort(function(a, b) { return ukNum_(a.item_sl, 0) - ukNum_(b.item_sl, 0); });

  return {
    success: true,
    order_id: order_id,
    creator_can_see_price_gbp: canSeeGBP,
    items: out,
  };
}
