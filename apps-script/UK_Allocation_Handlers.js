/************** UK_Allocation_Handlers.gs **************
Step 7 — Allocation Create/Update/Delete/Get (admin)

Implements:
- UK_handleAllocationCreate(body)
- UK_handleAllocationUpdate(body)
- UK_handleAllocationDelete(body)
- UK_handleAllocationGetForShipment(body)
- UK_handleAllocationGetForOrder(body)

Rules:
- Admin only
- Allocation requires: shipment_id, order_id OR order_item_id, allocated_qty
- shipped_qty defaults to 0 on create
- weights editable here (unit_product_weight, unit_package_weight)
- Prevent allocating more than remaining is OPTIONAL here (Step 9 enforces over-ship strictly)

Depends on Step 2:
- UK_getMapStrict_(sheet, requiredCols)
- UK_assertAdmin_(user)

And Step 2/3 helper:
- UK_makeId_(prefix)  (defined in Step 3 code; keep it in a shared utils file if needed)
**************************************************/

function UK_handleAllocationCreate(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const sh = ss.getSheetByName("uk_shipment_allocation");
  if (!sh) throw new Error("Missing sheet: uk_shipment_allocation");

  const required = [
    "allocation_id",
    "shipment_id",
    "order_id",
    "order_item_id",
    "product_id",
    "allocated_qty",
    "shipped_qty",
    "unit_product_weight",
    "unit_package_weight",
    "unit_total_weight",
    "allocated_weight",
    "shipped_weight",
    "pricing_mode_id",
    "buy_price_gbp",
    "product_cost_gbp",
    "product_cost_bdt",
    "cargo_cost_gbp",
    "cargo_cost_bdt",
    "revenue_bdt",
    "profit_bdt",
    "total_cost_bdt"
  ];
  const m = UK_getMapStrict_(sh, required);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  // Accept either order_item_id (preferred) OR (order_id + item_sl) resolution externally
  const order_item_id = String(body.order_item_id || "").trim();
  if (!order_item_id) throw new Error("order_item_id is required");

  const order_id = String(body.order_id || "").trim() || order_item_id.split("-")[0]; // safe fallback
  if (!order_id) throw new Error("order_id is required (or order_item_id like ORD_xxx-1)");

  const allocated_qty = _numOrZero_(body.allocated_qty);
  if (allocated_qty <= 0) throw new Error("allocated_qty must be > 0");

  const unit_product_weight = _numOrBlank_(body.unit_product_weight);
  const unit_package_weight = _numOrBlank_(body.unit_package_weight);

  const shipped_qty = (body.shipped_qty === undefined || body.shipped_qty === null || body.shipped_qty === "")
    ? 0
    : _numOrZero_(body.shipped_qty);

  const allocation_id = UK_makeId_("ALC");

  // product_id can be passed or derived later during recompute (Step 8)
  const product_id = String(body.product_id || "").trim();

  const row = new Array(sh.getLastColumn()).fill("");
  row[m.allocation_id] = allocation_id;
  row[m.shipment_id] = shipment_id;
  row[m.order_id] = order_id;
  row[m.order_item_id] = order_item_id;
  row[m.product_id] = product_id;

  row[m.allocated_qty] = allocated_qty;
  row[m.shipped_qty] = shipped_qty;

  row[m.unit_product_weight] = unit_product_weight;
  row[m.unit_package_weight] = unit_package_weight;

  // derived weights (keep simple here; Step 8 recompute will re-derive anyway)
  const unit_total_weight =
    (_numOrZero_(unit_product_weight) + _numOrZero_(unit_package_weight));
  row[m.unit_total_weight] = unit_total_weight;

  row[m.allocated_weight] = allocated_qty * unit_total_weight;
  row[m.shipped_weight] = shipped_qty * unit_total_weight;

  // finance fields remain blank until recompute_shipment (Step 8)
  row[m.pricing_mode_id] = "";
  row[m.buy_price_gbp] = "";
  row[m.product_cost_gbp] = "";
  row[m.product_cost_bdt] = "";
  row[m.cargo_cost_gbp] = "";
  row[m.cargo_cost_bdt] = "";
  row[m.revenue_bdt] = "";
  row[m.profit_bdt] = "";
  row[m.total_cost_bdt] = "";

  sh.appendRow(row);

  return { success: true, allocation_id };
}

function UK_handleAllocationUpdate(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const allocation_id = String(body.allocation_id || "").trim();
  if (!allocation_id) throw new Error("allocation_id is required");

  const sh = ss.getSheetByName("uk_shipment_allocation");
  if (!sh) throw new Error("Missing sheet: uk_shipment_allocation");

  const required = [
    "allocation_id",
    "shipment_id",
    "order_id",
    "order_item_id",
    "product_id",
    "allocated_qty",
    "shipped_qty",
    "unit_product_weight",
    "unit_package_weight",
    "unit_total_weight",
    "allocated_weight",
    "shipped_weight"
  ];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Allocation not found: ${allocation_id}`);

  const range = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
  const data = range.getValues();

  let idx = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][m.allocation_id]) === allocation_id) { idx = i; break; }
  }
  if (idx === -1) throw new Error(`Allocation not found: ${allocation_id}`);

  const row = data[idx];

  // Patch allowed fields
  if (body.shipment_id !== undefined) row[m.shipment_id] = String(body.shipment_id || "").trim();
  if (body.order_id !== undefined) row[m.order_id] = String(body.order_id || "").trim();
  if (body.order_item_id !== undefined) row[m.order_item_id] = String(body.order_item_id || "").trim();
  if (body.product_id !== undefined) row[m.product_id] = String(body.product_id || "").trim();

  if (body.allocated_qty !== undefined) {
    const aq = _numOrZero_(body.allocated_qty);
    if (aq < 0) throw new Error("allocated_qty cannot be negative");
    row[m.allocated_qty] = aq;
  }

  if (body.shipped_qty !== undefined) {
    const sq = _numOrZero_(body.shipped_qty);
    if (sq < 0) throw new Error("shipped_qty cannot be negative");
    row[m.shipped_qty] = sq;
  }

  if (body.unit_product_weight !== undefined) row[m.unit_product_weight] = _numOrBlank_(body.unit_product_weight);
  if (body.unit_package_weight !== undefined) row[m.unit_package_weight] = _numOrBlank_(body.unit_package_weight);

  // Re-derive weights immediately
  const unit_total_weight =
    _numOrZero_(row[m.unit_product_weight]) + _numOrZero_(row[m.unit_package_weight]);
  row[m.unit_total_weight] = unit_total_weight;

  row[m.allocated_weight] = _numOrZero_(row[m.allocated_qty]) * unit_total_weight;
  row[m.shipped_weight] = _numOrZero_(row[m.shipped_qty]) * unit_total_weight;

  data[idx] = row;
  range.setValues(data);

  return { success: true, allocation_id };
}

function UK_handleAllocationDelete(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const allocation_id = String(body.allocation_id || "").trim();
  if (!allocation_id) throw new Error("allocation_id is required");

  const sh = ss.getSheetByName("uk_shipment_allocation");
  if (!sh) throw new Error("Missing sheet: uk_shipment_allocation");

  const required = ["allocation_id"];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Allocation not found: ${allocation_id}`);

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][m.allocation_id]) === allocation_id) {
      sh.deleteRow(i + 2);
      return { success: true, allocation_id };
    }
  }
  throw new Error(`Allocation not found: ${allocation_id}`);
}

function UK_handleAllocationGetForShipment(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  const sh = ss.getSheetByName("uk_shipment_allocation");
  if (!sh) throw new Error("Missing sheet: uk_shipment_allocation");

  const required = [
    "allocation_id",
    "shipment_id",
    "order_id",
    "order_item_id",
    "product_id",
    "allocated_qty",
    "shipped_qty",
    "unit_product_weight",
    "unit_package_weight",
    "unit_total_weight",
    "allocated_weight",
    "shipped_weight",
    "pricing_mode_id",
    "buy_price_gbp",
    "product_cost_gbp",
    "product_cost_bdt",
    "cargo_cost_gbp",
    "cargo_cost_bdt",
    "revenue_bdt",
    "profit_bdt",
    "total_cost_bdt"
  ];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: true, shipment_id, allocations: [] };

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  const out = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[m.shipment_id]) !== shipment_id) continue;

    out.push(_allocToObj_(r, m));
  }

  return { success: true, shipment_id, allocations: out };
}

function UK_handleAllocationGetForOrder(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const order_id = String(body.order_id || "").trim();
  if (!order_id) throw new Error("order_id is required");

  const sh = ss.getSheetByName("uk_shipment_allocation");
  if (!sh) throw new Error("Missing sheet: uk_shipment_allocation");

  const required = [
    "allocation_id",
    "shipment_id",
    "order_id",
    "order_item_id",
    "product_id",
    "allocated_qty",
    "shipped_qty",
    "unit_product_weight",
    "unit_package_weight",
    "unit_total_weight",
    "allocated_weight",
    "shipped_weight",
    "pricing_mode_id",
    "buy_price_gbp",
    "product_cost_gbp",
    "product_cost_bdt",
    "cargo_cost_gbp",
    "cargo_cost_bdt",
    "revenue_bdt",
    "profit_bdt",
    "total_cost_bdt"
  ];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: true, order_id, allocations: [] };

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  const out = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[m.order_id]) !== order_id) continue;

    out.push(_allocToObj_(r, m));
  }

  return { success: true, order_id, allocations: out };
}

/************** helpers **************/

function _allocToObj_(r, m) {
  return {
    allocation_id: r[m.allocation_id],
    shipment_id: r[m.shipment_id],
    order_id: r[m.order_id],
    order_item_id: r[m.order_item_id],
    product_id: r[m.product_id],

    allocated_qty: r[m.allocated_qty],
    shipped_qty: r[m.shipped_qty],

    unit_product_weight: r[m.unit_product_weight],
    unit_package_weight: r[m.unit_package_weight],
    unit_total_weight: r[m.unit_total_weight],
    allocated_weight: r[m.allocated_weight],
    shipped_weight: r[m.shipped_weight],

    pricing_mode_id: r[m.pricing_mode_id],
    buy_price_gbp: r[m.buy_price_gbp],
    product_cost_gbp: r[m.product_cost_gbp],
    product_cost_bdt: r[m.product_cost_bdt],
    cargo_cost_gbp: r[m.cargo_cost_gbp],
    cargo_cost_bdt: r[m.cargo_cost_bdt],
    revenue_bdt: r[m.revenue_bdt],
    profit_bdt: r[m.profit_bdt],
    total_cost_bdt: r[m.total_cost_bdt]
  };
}

function _numOrBlank_(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(String(v).trim());
  if (!isFinite(n)) return "";
  return n;
}

function _numOrZero_(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).trim());
  if (!isFinite(n)) return 0;
  return n;
}