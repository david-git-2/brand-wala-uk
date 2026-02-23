/************** UK_Schema.gs **************/

function UK_requireColumns_(sheet, requiredCols) {
  if (!sheet) throw new Error("UK_requireColumns_: sheet is null");

  const sheetName = sheet.getName();
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error(`Sheet has no columns: ${sheetName}`);

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  const headerSet = {};
  headers.forEach(h => { if (h) headerSet[h] = true; });

  const missing = requiredCols.filter(c => !headerSet[c]);
  if (missing.length) {
    throw new Error(`Missing columns in ${sheetName}: ${missing.join(", ")}`);
  }
}

function UK_getMapStrict_(sheet, requiredCols) {
  UK_requireColumns_(sheet, requiredCols);

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());

  const map = {};
  headers.forEach((h, i) => {
    if (h && map[h] === undefined) map[h] = i; // 0-based
  });

  // sanity: required cols exist, but ensure map has them
  requiredCols.forEach(c => {
    if (map[c] === undefined) throw new Error(`Header map missing column: ${c}`);
  });

  return map;
}


/************** UK_Guards.gs **************/

function UK_roundGBP_(n) {
  if (n === "" || n === null || n === undefined) return "";
  const v = (typeof n === "string") ? n.trim() : n;
  if (v === "") return "";
  const num = Number(v);
  if (!isFinite(num)) return "";
  return Math.round(num * 100) / 100;
}

function UK_roundBDT_(n) {
  if (n === "" || n === null || n === undefined) return "";
  const v = (typeof n === "string") ? n.trim() : n;
  if (v === "") return "";
  const num = Number(v);
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

/**
 * Returns minimal order info for re-use:
 * { rowIndex: <sheetRowNumber>, order_id, status, creator_email }
 */
function UK_assertOrderExists_(order_id) {
  if (!order_id) throw new Error("order_id is required");

  const ss = ukOpenSS_();
  const sh = ss.getSheetByName("uk_orders");
  if (!sh) throw new Error("Missing sheet: uk_orders");

  const required = ["order_id", "status", "creator_email"];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Order not found: ${order_id}`);

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[m.order_id]) === String(order_id)) {
      return {
        rowIndex: i + 2, // sheet row number
        order_id: row[m.order_id],
        status: row[m.status],
        creator_email: row[m.creator_email]
      };
    }
  }
  throw new Error(`Order not found: ${order_id}`);
}

// Placeholder for Step 9 enforcement
function UK_assertNoOverShip_(order_item_id, shippedQtyDelta) {
  // Step 9 will implement full check against ordered_quantity and existing shipped totals.
  return true;
}