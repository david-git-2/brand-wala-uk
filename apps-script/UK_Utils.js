// ============================
// UK_Utils.gs
// Shared helpers for UK ordering system
// ============================

const UK_SPREADSHEET_ID = "10HdYWHgvYNoiYp9wusCKn-vlQFT8MtRnepqf_qd37pw";

function ukJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

let __UK_SS_CACHE = null;

function ukSpreadsheetId_() {
  const prop =
    PropertiesService.getScriptProperties().getProperty("UK_SPREADSHEET_ID") ||
    PropertiesService.getScriptProperties().getProperty("SS_ID");

  const id = String(prop || UK_SPREADSHEET_ID || "").trim();
  if (!id) throw new Error("Missing spreadsheet id. Set UK_SPREADSHEET_ID or SS_ID.");
  return id;
}

function ukOpenSS_() {
  if (__UK_SS_CACHE) return __UK_SS_CACHE;
  const id = ukSpreadsheetId_();
  try {
    __UK_SS_CACHE = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error("Failed to open spreadsheet by id: " + (e && e.message ? e.message : String(e)));
  }
  if (!__UK_SS_CACHE) throw new Error("SpreadsheetApp.openById returned null.");
  return __UK_SS_CACHE;
}

function ukGetSheet_(name) {
  const ss = ukOpenSS_();
  const sheetName = String(name || "").trim();
  if (!sheetName) throw new Error("Missing sheet name");
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error("Missing sheet: " + sheetName);
  return sh;
}

function UK_debugSpreadsheetAccess_() {
  const ss = ukOpenSS_();
  Logger.log("Spreadsheet OK: %s (%s)", ss.getName(), ukSpreadsheetId_());
  Logger.log("Sheets: %s", ss.getSheets().map((s) => s.getName()).join(", "));
}

function ukToIso_(d) {
  return d instanceof Date ? d.toISOString() : String(d || "");
}

function ukTruthy_(v) {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "true" || s === "ture" || s === "1" || s === "yes" || s === "y" || s === "active" || s === "enabled" || s === "on";
}

function ukToBool_(v) {
  if (v === true || v === false) return v;
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s) return false;
  if (s === "true" || s === "ture" || s === "yes" || s === "1" || s === "y" || s === "active" || s === "enabled" || s === "on") return true;
  if (s === "false" || s === "no" || s === "0" || s === "n" || s === "inactive" || s === "disabled" || s === "off") return false;
  const n = Number(s);
  return isFinite(n) ? n !== 0 : false;
}

function ukBool01_(v) {
  return ukToBool_(v) ? 1 : 0;
}

function ukNormKey_(k) {
  return String(k ?? "").trim().toLowerCase();
}

function ukGetHeader_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  const headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  return headerRow.map(ukNormKey_);
}

function ukHeaderMap_(sh) {
  const header = ukGetHeader_(sh);
  const map = {};
  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    if (!key) continue;
    if (map[key] == null) map[key] = i;
  }
  return map;
}

function ukReadObjects_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { header: [], map: {}, rows: [], dupes: [] };

  const rawHeader = ukGetHeader_(sh);
  const header = rawHeader.map((h) => String(h || "").trim());
  const map = {};
  const dupes = [];

  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    if (!key) continue;
    if (map[key] != null) {
      dupes.push({ key: key, firstIndex: map[key], dupIndex: i });
      continue;
    }
    map[key] = i;
  }

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const rows = values.map((arr, idx) => {
    const obj = { _row: idx + 2 };
    for (const key in map) obj[key] = arr[map[key]];
    return obj;
  });

  return { header: header, map: map, rows: rows, dupes: dupes };
}

function ukGetCellByKey_(sh, rowIndex1, key) {
  const map = ukHeaderMap_(sh);
  const col0 = map[ukNormKey_(key)];
  if (col0 == null) return null;
  return sh.getRange(rowIndex1, col0 + 1).getValue();
}

function ukSetCellByKey_(sh, rowIndex1, key, value) {
  const map = ukHeaderMap_(sh);
  const col0 = map[ukNormKey_(key)];
  if (col0 == null) throw new Error("Missing column: " + key);
  sh.getRange(rowIndex1, col0 + 1).setValue(value);
}

function ukSetRowByKeys_(sh, rowIndex1, updates, strict) {
  const map = ukHeaderMap_(sh);
  const isStrict = !!strict;
  Object.keys(updates || {}).forEach((k) => {
    const key = ukNormKey_(k);
    const col0 = map[key];
    if (col0 == null) {
      if (isStrict) throw new Error("Missing column: " + k);
      return;
    }
    sh.getRange(rowIndex1, col0 + 1).setValue(updates[k]);
  });
}

function ukNum_(v, fallback) {
  const fb = fallback == null ? 0 : fallback;
  if (v === "" || v === null || v === undefined) return fb;
  const n = Number(String(v).trim());
  return isFinite(n) ? n : fb;
}

function ukNumOrBlank_(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(String(v).trim());
  return isFinite(n) ? n : "";
}

function ukMakeId_(prefix) {
  const tz = Session.getScriptTimeZone();
  const ts = Utilities.formatDate(new Date(), tz, "yyyyMMddHHmmss");
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
  return String(prefix || "ID") + "_" + ts + "_" + rand;
}

function ukFindRowIndexById_(sheet, idColIdx0, idVal) {
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

function ukFindRowById_(sheet, idColIdx0, idVal) {
  const f = ukFindRowIndexById_(sheet, idColIdx0, idVal);
  return f.row;
}

function ukRequireFields_(obj, fields) {
  (fields || []).forEach((f) => {
    const v = obj ? obj[f] : null;
    if (v === null || v === undefined || String(v).trim() === "") {
      throw new Error(f + " is required");
    }
  });
}
