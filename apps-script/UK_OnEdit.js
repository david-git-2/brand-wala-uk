/************** UK_OnEdit.gs **************/

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    const sheetName = sh.getName();
    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row < 2) return;

    const header = String(sh.getRange(1, col).getValue() || "").trim().toLowerCase();
    if (!header) return;

    if (header.indexOf("_gbp") >= 0) {
      const v = UK_roundGBP_(e.range.getValue());
      if (v !== "") e.range.setValue(v);
    }

    if (header.indexOf("_bdt") >= 0) {
      const v = UK_roundBDT_(e.range.getValue());
      if (v !== "") e.range.setValue(v);
    }

    if (sheetName === "uk_shipment_allocation" && header === "shipped_qty") {
      const m = UK_getMapStrict_(sh, ["allocation_id", "order_item_id", "shipped_qty"]);
      const order_item_id = String(sh.getRange(row, m.order_item_id + 1).getValue() || "").trim();
      const allocation_id = String(sh.getRange(row, m.allocation_id + 1).getValue() || "").trim();
      const newShipped = ukNum_(sh.getRange(row, m.shipped_qty + 1).getValue(), 0);
      UK_assertNoOverShip_(order_item_id, newShipped, allocation_id);
    }
  } catch (err) {
    if (e && e.range) {
      // Revert on validation failure when possible
      if (Object.prototype.hasOwnProperty.call(e, "oldValue")) {
        e.range.setValue(e.oldValue);
      }
    }
    throw err;
  }
}
