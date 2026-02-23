/************** UK_Schema.gs **************/

function UK_requireColumns_(sheet, requiredCols) {
  if (!sheet) throw new Error("UK_requireColumns_: sheet is null");

  const sheetName = sheet.getName();
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error("Sheet has no columns: " + sheetName);

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });

  const headerSet = {};
  headers.forEach(function(h) { if (h) headerSet[h] = true; });

  const missing = (requiredCols || []).filter(function(c) { return !headerSet[c]; });
  if (missing.length) {
    throw new Error("Missing columns in " + sheetName + ": " + missing.join(", "));
  }
}

function UK_getMapStrict_(sheet, requiredCols) {
  UK_requireColumns_(sheet, requiredCols);

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });

  const map = {};
  headers.forEach(function(h, i) {
    if (h && map[h] === undefined) map[h] = i;
  });

  (requiredCols || []).forEach(function(c) {
    if (map[c] === undefined) throw new Error("Header map missing column: " + c);
  });

  return map;
}
