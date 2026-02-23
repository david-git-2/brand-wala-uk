/************** UK_PricingModes.gs **************
Step 6 — Pricing Modes CRUD (admin)

Minimum required for Step 6:
- UK_handlePricingModeGetAll(body)  -> returns active pricing modes (or all if include_inactive=true)

Optional (included here because you’ll need soon anyway):
- UK_handlePricingModeCreate(body)
- UK_handlePricingModeUpdate(body)
- UK_handlePricingModeDelete(body)  -> soft delete by setting active=FALSE (recommended)

Rules:
- Admin only

Depends on Step 2:
- UK_getMapStrict_(sheet, requiredCols)
- UK_assertAdmin_(user)
**************************************************/

function UK_handlePricingModeGetAll(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const includeInactive = !!body.include_inactive;

  const sh = ss.getSheetByName("uk_pricing_modes");
  if (!sh) throw new Error("Missing sheet: uk_pricing_modes");

  const required = [
    "pricing_mode_id",
    "name",
    "version",
    "currency",
    "profit_base",
    "cargo_charge",
    "conversion_rule",
    "rate_source_revenue",
    "active",
    "notes"
  ];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: true, pricing_modes: [] };

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  const out = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const active = _toBool_(r[m.active]);

    if (!includeInactive && !active) continue;

    out.push({
      pricing_mode_id: r[m.pricing_mode_id],
      name: r[m.name],
      version: r[m.version],
      currency: r[m.currency],
      profit_base: r[m.profit_base],
      cargo_charge: r[m.cargo_charge],
      conversion_rule: r[m.conversion_rule],
      rate_source_revenue: r[m.rate_source_revenue],
      active: active,
      notes: r[m.notes]
    });
  }

  // Sort: active first, then id
  out.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return String(a.pricing_mode_id).localeCompare(String(b.pricing_mode_id));
  });

  return { success: true, pricing_modes: out };
}

function UK_handlePricingModeCreate(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const sh = ss.getSheetByName("uk_pricing_modes");
  if (!sh) throw new Error("Missing sheet: uk_pricing_modes");

  const required = [
    "pricing_mode_id",
    "name",
    "version",
    "currency",
    "profit_base",
    "cargo_charge",
    "conversion_rule",
    "rate_source_revenue",
    "active",
    "notes"
  ];
  const m = UK_getMapStrict_(sh, required);

  const pricing_mode_id = String(body.pricing_mode_id || "").trim();
  if (!pricing_mode_id) throw new Error("pricing_mode_id is required");

  // Uniqueness check
  _assertUniqueId_(sh, m.pricing_mode_id, pricing_mode_id);

  const row = new Array(sh.getLastColumn()).fill("");
  row[m.pricing_mode_id] = pricing_mode_id;
  row[m.name] = String(body.name || "").trim();
  row[m.version] = String(body.version || "").trim();
  row[m.currency] = String(body.currency || "").trim(); // GBP / BDT
  row[m.profit_base] = String(body.profit_base || "").trim(); // PRODUCT_ONLY / PRODUCT_PLUS_CARGO
  row[m.cargo_charge] = String(body.cargo_charge || "").trim(); // PASS_THROUGH / INCLUDED_IN_PRICE
  row[m.conversion_rule] = String(body.conversion_rule || "").trim(); // SEPARATE_RATES / AVG_RATE
  row[m.rate_source_revenue] = String(body.rate_source_revenue || "").trim(); // avg/product/cargo (optional)
  row[m.active] = (body.active === undefined) ? true : _toBool_(body.active);
  row[m.notes] = String(body.notes || "").trim();

  sh.appendRow(row);

  return { success: true, pricing_mode_id };
}

function UK_handlePricingModeUpdate(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const pricing_mode_id = String(body.pricing_mode_id || "").trim();
  if (!pricing_mode_id) throw new Error("pricing_mode_id is required");

  const sh = ss.getSheetByName("uk_pricing_modes");
  if (!sh) throw new Error("Missing sheet: uk_pricing_modes");

  const required = [
    "pricing_mode_id",
    "name",
    "version",
    "currency",
    "profit_base",
    "cargo_charge",
    "conversion_rule",
    "rate_source_revenue",
    "active",
    "notes"
  ];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Pricing mode not found: ${pricing_mode_id}`);

  const range = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
  const data = range.getValues();

  let idx = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][m.pricing_mode_id]) === pricing_mode_id) { idx = i; break; }
  }
  if (idx === -1) throw new Error(`Pricing mode not found: ${pricing_mode_id}`);

  const row = data[idx];

  if (body.name !== undefined) row[m.name] = String(body.name || "").trim();
  if (body.version !== undefined) row[m.version] = String(body.version || "").trim();
  if (body.currency !== undefined) row[m.currency] = String(body.currency || "").trim();
  if (body.profit_base !== undefined) row[m.profit_base] = String(body.profit_base || "").trim();
  if (body.cargo_charge !== undefined) row[m.cargo_charge] = String(body.cargo_charge || "").trim();
  if (body.conversion_rule !== undefined) row[m.conversion_rule] = String(body.conversion_rule || "").trim();
  if (body.rate_source_revenue !== undefined) row[m.rate_source_revenue] = String(body.rate_source_revenue || "").trim();
  if (body.active !== undefined) row[m.active] = _toBool_(body.active);
  if (body.notes !== undefined) row[m.notes] = String(body.notes || "").trim();

  data[idx] = row;
  range.setValues(data);

  return { success: true, pricing_mode_id };
}

/**
 * Recommended: soft delete by setting active = FALSE.
 * If you truly want hard delete, replace logic with deleteRow like shipments.
 */
function UK_handlePricingModeDelete(body) {
  body = body || {};
  const ss = ukOpenSS_();

  const user = (typeof ukRequireActiveUser_ === "function")
    ? ukRequireActiveUser_(body)
    : { email: String(body.email || "").trim(), role: String(body.role || "").trim() };
  UK_assertAdmin_(user);

  const pricing_mode_id = String(body.pricing_mode_id || "").trim();
  if (!pricing_mode_id) throw new Error("pricing_mode_id is required");

  const sh = ss.getSheetByName("uk_pricing_modes");
  if (!sh) throw new Error("Missing sheet: uk_pricing_modes");

  const required = ["pricing_mode_id", "active"];
  const m = UK_getMapStrict_(sh, required);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error(`Pricing mode not found: ${pricing_mode_id}`);

  const range = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
  const data = range.getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][m.pricing_mode_id]) === pricing_mode_id) {
      data[i][m.active] = false;
      range.setValues(data);
      return { success: true, pricing_mode_id, deactivated: true };
    }
  }
  throw new Error(`Pricing mode not found: ${pricing_mode_id}`);
}

/************** helpers **************/

function _toBool_(v) {
  if (v === true || v === false) return v;
  const s = String(v || "").trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  // default: treat blanks as false ONLY when explicitly blank; otherwise truthy numbers
  if (s === "") return false;
  const n = Number(s);
  if (isFinite(n)) return n !== 0;
  return false;
}

function _assertUniqueId_(sheet, colIdx0, idVal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][colIdx0]) === String(idVal)) {
      throw new Error(`Duplicate pricing_mode_id: ${idVal}`);
    }
  }
}