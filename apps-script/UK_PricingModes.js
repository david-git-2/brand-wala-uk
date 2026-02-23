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

  const id = UK_pmGenerateId_(sh, m, body);
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
  row[m.active] = body.active === undefined ? 1 : ukBool01_(body.active);
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
  if (body.active !== undefined) sh.getRange(found.rowIndex, m.active + 1).setValue(ukBool01_(body.active));
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
  const m = UK_getMapStrict_(sh, ["pricing_mode_id"]);
  const found = ukFindRowIndexById_(sh, m.pricing_mode_id, id);
  if (found.rowIndex < 0) throw new Error("Pricing mode not found: " + id);

  // Safety: do not allow hard delete when mode is already used by any order item.
  const shItems = ukGetSheet_("uk_order_items");
  const mI = UK_getMapStrict_(shItems, ["pricing_mode_id"]);
  const itemsLastRow = shItems.getLastRow();
  if (itemsLastRow >= 2) {
    const data = shItems.getRange(2, 1, itemsLastRow - 1, shItems.getLastColumn()).getValues();
    let used = 0;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][mI.pricing_mode_id] || "").trim() === id) used += 1;
    }
    if (used > 0) {
      throw new Error(
        "Cannot delete pricing mode '" + id + "' because it is used in " + used +
        " order item(s). Set active=0 to deactivate instead."
      );
    }
  }

  sh.deleteRow(found.rowIndex);
  return { success: true, pricing_mode_id: id, deleted: true };
}

function UK_handlePricingModeSeedDefaults(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const result = UK_pricingModesEnsureDefaults_();
  return {
    success: true,
    created: result.created,
    skipped_existing: result.skipped,
    pricing_mode_ids: result.ids,
  };
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

function UK_pmGenerateId_(sheet, map, body) {
  const currency = String(body.currency || "GBP").trim().toUpperCase();
  const profitBase = String(body.profit_base || "PRODUCT_ONLY").trim().toUpperCase();
  const cargoCharge = String(body.cargo_charge || "").trim().toUpperCase();
  const versionRaw = String(body.version || "v1").trim().toUpperCase();

  const v = versionRaw.startsWith("V") ? versionRaw : ("V" + versionRaw);

  let baseTag = "MODE";
  if (profitBase === "PRODUCT_ONLY") baseTag = "PROD";
  else if (profitBase === "PRODUCT_PLUS_CARGO") baseTag = "LANDED";
  if (profitBase === "PRODUCT_PLUS_CARGO" && cargoCharge === "PASS_THROUGH") baseTag = "LANDED";

  const base = "PM_" + currency + "_" + baseTag + "_" + v;
  let candidate = base;
  let n = 2;
  while (ukFindRowById_(sheet, map.pricing_mode_id, candidate)) {
    candidate = base + "_" + n;
    n += 1;
  }
  return candidate;
}

function UK_pricingModesEnsureDefaults_() {
  const sh = ukGetSheet_("uk_pricing_modes");
  const m = UK_getMapStrict_(sh, [
    "pricing_mode_id", "name", "version", "currency", "profit_base", "cargo_charge",
    "conversion_rule", "rate_source_revenue", "active", "notes"
  ]);

  const defaults = [
    {
      pricing_mode_id: "PM_GBP_PROD_V1",
      name: "GBP Product Profit",
      version: "v1",
      currency: "GBP",
      profit_base: "PRODUCT_ONLY",
      cargo_charge: "PASS_THROUGH",
      conversion_rule: "SEPARATE_RATES",
      rate_source_revenue: "avg",
      active: 1,
      notes: "Profit on product only in GBP; cargo passed through separately."
    },
    {
      pricing_mode_id: "PM_BDT_LANDED_V1",
      name: "BDT Landed Profit",
      version: "v1",
      currency: "BDT",
      profit_base: "PRODUCT_PLUS_CARGO",
      cargo_charge: "INCLUDED_IN_PRICE",
      conversion_rule: "SEPARATE_RATES",
      rate_source_revenue: "avg",
      active: 1,
      notes: "Profit on full landed cost (product + cargo) in BDT."
    }
  ];

  let created = 0;
  let skipped = 0;
  const ids = [];

  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
    ids.push(d.pricing_mode_id);
    const existing = ukFindRowById_(sh, m.pricing_mode_id, d.pricing_mode_id);
    if (existing) {
      skipped += 1;
      continue;
    }

    const row = new Array(sh.getLastColumn()).fill("");
    row[m.pricing_mode_id] = d.pricing_mode_id;
    row[m.name] = d.name;
    row[m.version] = d.version;
    row[m.currency] = d.currency;
    row[m.profit_base] = d.profit_base;
    row[m.cargo_charge] = d.cargo_charge;
    row[m.conversion_rule] = d.conversion_rule;
    row[m.rate_source_revenue] = d.rate_source_revenue;
    row[m.active] = d.active;
    row[m.notes] = d.notes;
    sh.appendRow(row);
    created += 1;
  }

  return { created: created, skipped: skipped, ids: ids };
}
