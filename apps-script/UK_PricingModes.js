/************** UK_PricingModes.gs **************/

function UK_handlePricingModeGetAll(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const includeInactive = ukToBool_(body.include_inactive);
  const sh = ukGetSheet_("uk_pricing_modes");
  const m = UK_getMapStrict_(sh, [
    "pricing_mode_id", "name", "version", "currency", "profit_base", "cargo_charge",
    "conversion_rule", "rate_source_revenue", "active", "notes"
  ]);

  const out = ukReadObjects_(sh).rows
    .filter(function(r) { return includeInactive || ukToBool_(r.active); })
    .map(function(r) {
      return {
        pricing_mode_id: r.pricing_mode_id,
        name: r.name,
        version: r.version,
        currency: r.currency,
        profit_base: r.profit_base,
        cargo_charge: r.cargo_charge,
        conversion_rule: r.conversion_rule,
        rate_source_revenue: r.rate_source_revenue,
        active: ukToBool_(r.active),
        notes: r.notes,
      };
    });

  out.sort(function(a, b) {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return String(a.pricing_mode_id).localeCompare(String(b.pricing_mode_id));
  });

  return { success: true, pricing_modes: out };
}

function UK_handlePricingModeCreate(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const sh = ukGetSheet_("uk_pricing_modes");
  const m = UK_getMapStrict_(sh, [
    "pricing_mode_id", "name", "version", "currency", "profit_base", "cargo_charge",
    "conversion_rule", "rate_source_revenue", "active", "notes"
  ]);

  const id = String(body.pricing_mode_id || "").trim();
  if (!id) throw new Error("pricing_mode_id is required");
  UK_pmAssertUniqueId_(sh, m.pricing_mode_id, id);

  const row = new Array(sh.getLastColumn()).fill("");
  row[m.pricing_mode_id] = id;
  row[m.name] = String(body.name || "").trim();
  row[m.version] = String(body.version || "").trim();
  row[m.currency] = String(body.currency || "").trim().toUpperCase();
  row[m.profit_base] = String(body.profit_base || "").trim();
  row[m.cargo_charge] = String(body.cargo_charge || "").trim();
  row[m.conversion_rule] = String(body.conversion_rule || "").trim();
  row[m.rate_source_revenue] = String(body.rate_source_revenue || "").trim();
  row[m.active] = body.active === undefined ? true : ukToBool_(body.active);
  row[m.notes] = String(body.notes || "").trim();

  sh.appendRow(row);
  return { success: true, pricing_mode_id: id };
}

function UK_handlePricingModeUpdate(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const id = String(body.pricing_mode_id || "").trim();
  if (!id) throw new Error("pricing_mode_id is required");

  const sh = ukGetSheet_("uk_pricing_modes");
  const m = UK_getMapStrict_(sh, [
    "pricing_mode_id", "name", "version", "currency", "profit_base", "cargo_charge",
    "conversion_rule", "rate_source_revenue", "active", "notes"
  ]);

  const found = ukFindRowIndexById_(sh, m.pricing_mode_id, id);
  if (found.rowIndex < 0) throw new Error("Pricing mode not found: " + id);

  if (body.name !== undefined) sh.getRange(found.rowIndex, m.name + 1).setValue(String(body.name || "").trim());
  if (body.version !== undefined) sh.getRange(found.rowIndex, m.version + 1).setValue(String(body.version || "").trim());
  if (body.currency !== undefined) sh.getRange(found.rowIndex, m.currency + 1).setValue(String(body.currency || "").trim().toUpperCase());
  if (body.profit_base !== undefined) sh.getRange(found.rowIndex, m.profit_base + 1).setValue(String(body.profit_base || "").trim());
  if (body.cargo_charge !== undefined) sh.getRange(found.rowIndex, m.cargo_charge + 1).setValue(String(body.cargo_charge || "").trim());
  if (body.conversion_rule !== undefined) sh.getRange(found.rowIndex, m.conversion_rule + 1).setValue(String(body.conversion_rule || "").trim());
  if (body.rate_source_revenue !== undefined) sh.getRange(found.rowIndex, m.rate_source_revenue + 1).setValue(String(body.rate_source_revenue || "").trim());
  if (body.active !== undefined) sh.getRange(found.rowIndex, m.active + 1).setValue(ukToBool_(body.active));
  if (body.notes !== undefined) sh.getRange(found.rowIndex, m.notes + 1).setValue(String(body.notes || "").trim());

  return { success: true, pricing_mode_id: id };
}

function UK_handlePricingModeDelete(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const id = String(body.pricing_mode_id || "").trim();
  if (!id) throw new Error("pricing_mode_id is required");

  const sh = ukGetSheet_("uk_pricing_modes");
  const m = UK_getMapStrict_(sh, ["pricing_mode_id", "active"]);
  const found = ukFindRowIndexById_(sh, m.pricing_mode_id, id);
  if (found.rowIndex < 0) throw new Error("Pricing mode not found: " + id);

  sh.getRange(found.rowIndex, m.active + 1).setValue(false);
  return { success: true, pricing_mode_id: id, deactivated: true };
}

function UK_pmAssertUniqueId_(sheet, idCol0, idVal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][idCol0]) === String(idVal)) {
      throw new Error("Duplicate pricing_mode_id: " + idVal);
    }
  }
}
