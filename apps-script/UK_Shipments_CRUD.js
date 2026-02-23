/************** UK_Shipments_CRUD.gs **************/

function UK_handleShipmentCreate(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const sh = ukGetSheet_("uk_shipments");
  const m = UK_getMapStrict_(sh, [
    "shipment_id", "name", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo",
    "cargo_cost_per_kg", "created_at", "updated_at"
  ]);

  const shipment_id = String(body.shipment_id || ukMakeId_("SHP")).trim();
  const name = String(body.name || "").trim();
  if (!name) throw new Error("name is required");

  if (ukFindRowById_(sh, m.shipment_id, shipment_id)) {
    throw new Error("Duplicate shipment_id: " + shipment_id);
  }

  const row = new Array(sh.getLastColumn()).fill("");
  row[m.shipment_id] = shipment_id;
  row[m.name] = name;
  row[m.gbp_avg_rate] = UK_roundGBP_(ukNum_(body.gbp_avg_rate, 0));
  row[m.gbp_rate_product] = UK_roundGBP_(ukNum_(body.gbp_rate_product, 0));
  row[m.gbp_rate_cargo] = UK_roundGBP_(ukNum_(body.gbp_rate_cargo, 0));
  row[m.cargo_cost_per_kg] = UK_roundGBP_(ukNum_(body.cargo_cost_per_kg, 0));
  row[m.created_at] = new Date();
  row[m.updated_at] = new Date();

  const hdr = ukHeaderMap_(sh);
  if (hdr.status != null) row[hdr.status] = String(body.status || "draft").toLowerCase();

  sh.appendRow(row);
  return { success: true, shipment_id: shipment_id };
}

function UK_handleShipmentGetAll(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const sh = ukGetSheet_("uk_shipments");
  UK_getMapStrict_(sh, [
    "shipment_id", "name", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo",
    "cargo_cost_per_kg", "created_at", "updated_at"
  ]);

  const rows = ukReadObjects_(sh).rows.map(function(r) {
    return {
      shipment_id: r.shipment_id,
      name: r.name,
      gbp_avg_rate: r.gbp_avg_rate,
      gbp_rate_product: r.gbp_rate_product,
      gbp_rate_cargo: r.gbp_rate_cargo,
      cargo_cost_per_kg: r.cargo_cost_per_kg,
      created_at: r.created_at,
      updated_at: r.updated_at,
      status: r.status,
    };
  });

  rows.sort(function(a, b) {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return { success: true, shipments: rows };
}

function UK_handleShipmentGetOne(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  const sh = ukGetSheet_("uk_shipments");
  const m = UK_getMapStrict_(sh, [
    "shipment_id", "name", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo",
    "cargo_cost_per_kg", "created_at", "updated_at"
  ]);

  const row = ukFindRowById_(sh, m.shipment_id, shipment_id);
  if (!row) throw new Error("Shipment not found: " + shipment_id);

  const out = {
    shipment_id: row[m.shipment_id],
    name: row[m.name],
    gbp_avg_rate: row[m.gbp_avg_rate],
    gbp_rate_product: row[m.gbp_rate_product],
    gbp_rate_cargo: row[m.gbp_rate_cargo],
    cargo_cost_per_kg: row[m.cargo_cost_per_kg],
    created_at: row[m.created_at],
    updated_at: row[m.updated_at],
  };

  const hdr = ukHeaderMap_(sh);
  if (hdr.status != null) out.status = row[hdr.status];

  return { success: true, shipment: out };
}

function UK_handleShipmentUpdate(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  const sh = ukGetSheet_("uk_shipments");
  const m = UK_getMapStrict_(sh, [
    "shipment_id", "name", "gbp_avg_rate", "gbp_rate_product", "gbp_rate_cargo",
    "cargo_cost_per_kg", "updated_at"
  ]);

  const found = ukFindRowIndexById_(sh, m.shipment_id, shipment_id);
  if (found.rowIndex < 0) throw new Error("Shipment not found: " + shipment_id);

  if (body.name !== undefined) sh.getRange(found.rowIndex, m.name + 1).setValue(String(body.name || "").trim());
  if (body.gbp_avg_rate !== undefined) sh.getRange(found.rowIndex, m.gbp_avg_rate + 1).setValue(UK_roundGBP_(ukNum_(body.gbp_avg_rate, 0)));
  if (body.gbp_rate_product !== undefined) sh.getRange(found.rowIndex, m.gbp_rate_product + 1).setValue(UK_roundGBP_(ukNum_(body.gbp_rate_product, 0)));
  if (body.gbp_rate_cargo !== undefined) sh.getRange(found.rowIndex, m.gbp_rate_cargo + 1).setValue(UK_roundGBP_(ukNum_(body.gbp_rate_cargo, 0)));
  if (body.cargo_cost_per_kg !== undefined) sh.getRange(found.rowIndex, m.cargo_cost_per_kg + 1).setValue(UK_roundGBP_(ukNum_(body.cargo_cost_per_kg, 0)));

  const hdr = ukHeaderMap_(sh);
  if (body.status !== undefined && hdr.status != null) {
    sh.getRange(found.rowIndex, hdr.status + 1).setValue(String(body.status || "").toLowerCase());
  }

  sh.getRange(found.rowIndex, m.updated_at + 1).setValue(new Date());
  return { success: true, shipment_id: shipment_id };
}

function UK_handleShipmentDelete(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const shipment_id = String(body.shipment_id || "").trim();
  if (!shipment_id) throw new Error("shipment_id is required");

  const sh = ukGetSheet_("uk_shipments");
  const m = UK_getMapStrict_(sh, ["shipment_id"]);
  const found = ukFindRowIndexById_(sh, m.shipment_id, shipment_id);
  if (found.rowIndex < 0) throw new Error("Shipment not found: " + shipment_id);

  const shAlloc = ukGetSheet_("uk_shipment_allocation");
  const mA = UK_getMapStrict_(shAlloc, ["shipment_id"]);
  const rows = ukReadObjects_(shAlloc).rows;
  const hasAlloc = rows.some(function(r) { return String(r.shipment_id || "") === shipment_id; });
  if (hasAlloc) throw new Error("Cannot delete shipment with allocations. Delete allocations first.");

  sh.deleteRow(found.rowIndex);
  return { success: true, shipment_id: shipment_id };
}
