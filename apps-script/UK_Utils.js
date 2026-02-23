// ============================
// UK_Utils.gs  (FIXED - HEADER/NAME BASED)
// Shared helpers for UK ordering system
// - Spreadsheet cached per execution
// - Header -> index map helpers (NO column numbers needed)
// - Robust spreadsheet/sheet access (no silent nulls)
// ============================

// Prefer Script Property "UK_SPREADSHEET_ID" if set.
// Fallback to constant for convenience during dev.
const UK_SPREADSHEET_ID = "10HdYWHgvYNoiYp9wusCKn-vlQFT8MtRnepqf_qd37pw";

// ----------------------------
// Response
// ----------------------------
function ukJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------
// Spreadsheet access (cached)
// ----------------------------
let __UK_SS_CACHE = null;

function ukSpreadsheetId_() {
  // ✅ Use Script Properties if available (best for deployments)
  const prop =
    PropertiesService.getScriptProperties().getProperty("UK_SPREADSHEET_ID") ||
    PropertiesService.getScriptProperties().getProperty("SS_ID");

  const id = String(prop || UK_SPREADSHEET_ID || "").trim();
  if (!id) {
    throw new Error("Missing spreadsheet id. Set Script Property UK_SPREADSHEET_ID (or SS_ID).");
  }
  return id;
}

function ukOpenSS_() {
  if (__UK_SS_CACHE) return __UK_SS_CACHE;

  const id = ukSpreadsheetId_();

  try {
    __UK_SS_CACHE = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(
      "Failed to open spreadsheet by id. Check permissions + deployment identity. " +
        (e?.message || String(e))
    );
  }

  if (!__UK_SS_CACHE) {
    throw new Error("SpreadsheetApp.openById returned null. Check permissions/deployment identity.");
  }

  return __UK_SS_CACHE;
}

function ukGetSheet_(name) {
  const ss = ukOpenSS_(); // will throw if access is broken
  const sheetName = String(name || "").trim();
  if (!sheetName) throw new Error("Missing sheet name");

  const sh = ss.getSheetByName(sheetName);
  if (!sh) {
    // ✅ Fail loudly so you instantly know the sheet name mismatch
    throw new Error("Missing sheet: " + sheetName);
  }
  return sh;
}

// ----------------------------
// Debug helper (optional)
// Call this in Apps Script editor to verify access works.
// ----------------------------
function UK_debugSpreadsheetAccess_() {
  const ss = ukOpenSS_();
  Logger.log("Spreadsheet OK: %s (%s)", ss.getName(), ukSpreadsheetId_());
  Logger.log("Sheets: %s", ss.getSheets().map((s) => s.getName()).join(", "));
}

// ----------------------------
// Common helpers
// ----------------------------
function ukToIso_(d) {
  return (d instanceof Date) ? d.toISOString() : String(d || "");
}

function ukTruthy_(v) {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

// Normalize header key (trim + lowercase)
function ukNormKey_(k) {
  return String(k ?? "").trim().toLowerCase();
}

// ----------------------------
// Header-based utilities
// ----------------------------

/**
 * Returns header array (row 1) as normalized keys.
 * Example: ["order_id", "status", ...]
 */
function ukGetHeader_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  const headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  return headerRow.map(ukNormKey_);
}

/**
 * Returns a map {headerKey: index0Based}
 * Example: map["order_id"] = 1 (if column B)
 */
function ukHeaderMap_(sh) {
  const header = ukGetHeader_(sh);
  const map = {};
  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    if (!key) continue;
    if (map[key] == null) map[key] = i; // keep first
  }
  return map;
}

/**
 * Read all rows (excluding header) as objects keyed by header names.
 * Returns: { header, map, rows, dupes }
 * rows: [{_row: 2, order_id: "...", status: "..."}]
 */
function ukReadObjects_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { header: [], map: {}, rows: [], dupes: [] };
  }

  const rawHeader = ukGetHeader_(sh);
  const header = rawHeader.map((h) => String(h || "").trim());

  // keep FIRST occurrence only
  const map = {};
  const dupes = [];
  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    if (!key) continue;

    if (map[key] != null) {
      dupes.push({ key, firstIndex: map[key], dupIndex: i });
      continue;
    }
    map[key] = i;
  }

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const rows = values.map((arr, idx) => {
    const obj = { _row: idx + 2 };
    for (const key in map) {
      obj[key] = arr[map[key]];
    }
    return obj;
  });

  return { header, map, rows, dupes };
}

/**
 * Get a single cell value by header key.
 */
function ukGetCellByKey_(sh, rowIndex1, key) {
  const map = ukHeaderMap_(sh);
  const col0 = map[ukNormKey_(key)];
  if (col0 == null) return null;
  return sh.getRange(rowIndex1, col0 + 1).getValue();
}

/**
 * Set a single cell value by header key.
 */
function ukSetCellByKey_(sh, rowIndex1, key, value) {
  const map = ukHeaderMap_(sh);
  const col0 = map[ukNormKey_(key)];
  if (col0 == null) throw new Error("Missing column: " + key);
  sh.getRange(rowIndex1, col0 + 1).setValue(value);
}

/**
 * Set multiple fields on a row by header keys.
 * updates: { status: "draft", updated_at: "..." }
 * Unknown keys are ignored unless strict=true.
 */
function ukSetRowByKeys_(sh, rowIndex1, updates, strict = false) {
  const map = ukHeaderMap_(sh);

  Object.keys(updates || {}).forEach((k) => {
    const key = ukNormKey_(k);
    const col0 = map[key];
    if (col0 == null) {
      if (strict) throw new Error("Missing column: " + k);
      return;
    }
    sh.getRange(rowIndex1, col0 + 1).setValue(updates[k]);
  });
}