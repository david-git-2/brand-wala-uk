function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function s(v) {
  return String(v || "").trim();
}

function r2(v) {
  return Number(n(v, 0).toFixed(2));
}

function r0(v) {
  return Math.round(n(v, 0));
}

function asPct(v) {
  return n(v, 0) / 100;
}

export function validateOrderItemCalcInput(input = {}) {
  const reasons = [];
  const mode = s(input.offer_price_mode || "purchase").toLowerCase();
  const purchasePriceGbp = n(input.purchase_price_gbp, 0);
  const neededQty = n(input.needed_quantity, 0);
  const unitTotalWeightG = n(input.unit_total_weight_g, 0);
  const cargoCostPerKgGbp = n(input.cargo_cost_per_kg_gbp, 0);
  const gbpRateAvgBdt = n(input.gbp_rate_avg_bdt, 0);

  if (!(purchasePriceGbp > 0)) reasons.push("purchase_price_gbp must be > 0");
  if (!(neededQty > 0)) reasons.push("needed_quantity must be > 0");
  if (!(unitTotalWeightG > 0)) reasons.push("unit_total_weight_g must be > 0");
  if (!(cargoCostPerKgGbp > 0)) reasons.push("cargo_cost_per_kg_gbp must be > 0");
  if (!(gbpRateAvgBdt > 0)) reasons.push("gbp_rate_avg_bdt must be > 0");
  if (!["purchase", "total"].includes(mode)) reasons.push("offer_price_mode is invalid");

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function computeOrderItemOffer(input = {}) {
  const mode = s(input.offer_price_mode || "purchase").toLowerCase();
  const purchasePriceGbp = n(input.purchase_price_gbp, 0);
  const neededQty = n(input.needed_quantity, 0);
  const profitRatePct = n(input.profit_rate, 0);
  const unitTotalWeightG = n(input.unit_total_weight_g, 0);
  const cargoCostPerKgGbp = n(input.cargo_cost_per_kg_gbp, 0);
  const gbpRateAvgBdt = n(input.gbp_rate_avg_bdt, 0);

  const unitWeightKg = unitTotalWeightG / 1000;
  const cargoPerUnitGbp = r2(unitWeightKg * cargoCostPerKgGbp);
  const purchasePerUnitBdt = r0(purchasePriceGbp * gbpRateAvgBdt);
  const cargoPerUnitBdt = r0(cargoPerUnitGbp * gbpRateAvgBdt);

  let offeredProductUnitGbp = 0;
  let offeredTotalUnitGbp = 0;
  let offeredProductUnitBdt = 0;
  let offeredTotalUnitBdt = 0;

  if (mode === "purchase") {
    offeredProductUnitGbp = r2(purchasePriceGbp * (1 + asPct(profitRatePct)));
    offeredTotalUnitGbp = r2(offeredProductUnitGbp + cargoPerUnitGbp);
    offeredProductUnitBdt = r0(offeredProductUnitGbp * gbpRateAvgBdt);
    offeredTotalUnitBdt = r0(offeredProductUnitBdt + cargoPerUnitBdt);
  } else {
    const baseTotalUnitGbp = r2(purchasePriceGbp + cargoPerUnitGbp);
    offeredTotalUnitGbp = r2(baseTotalUnitGbp * (1 + asPct(profitRatePct)));
    offeredProductUnitGbp = r2(offeredTotalUnitGbp - cargoPerUnitGbp);
    offeredTotalUnitBdt = r0(offeredTotalUnitGbp * gbpRateAvgBdt);
    offeredProductUnitBdt = r0(offeredTotalUnitBdt - cargoPerUnitBdt);
  }

  const offeredTotalBdt = r0(offeredTotalUnitBdt * neededQty);
  const purchaseTotalBdt = r0((purchasePerUnitBdt + cargoPerUnitBdt) * neededQty);
  const profitBdt = r0(offeredTotalBdt - purchaseTotalBdt);
  const profitPctEffective = purchaseTotalBdt > 0 ? r2((profitBdt / purchaseTotalBdt) * 100) : 0;

  return {
    mode,
    unit_weight_kg: r2(unitWeightKg),
    cargo_per_unit_gbp: cargoPerUnitGbp,
    purchase_per_unit_bdt: purchasePerUnitBdt,
    cargo_per_unit_bdt: cargoPerUnitBdt,
    offered_product_unit_gbp: offeredProductUnitGbp,
    offered_total_unit_gbp: offeredTotalUnitGbp,
    offered_product_unit_bdt: offeredProductUnitBdt,
    offered_total_unit_bdt: offeredTotalUnitBdt,
    offered_total_bdt: offeredTotalBdt,
    purchase_total_bdt: purchaseTotalBdt,
    profit_bdt: profitBdt,
    profit_pct_effective: profitPctEffective,
  };
}

export function calculateOrderItemPricing(input = {}) {
  const validation = validateOrderItemCalcInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      reasons: validation.reasons,
      output: null,
    };
  }
  const output = computeOrderItemOffer(input);
  return {
    ok: true,
    reasons: [],
    output,
  };
}

