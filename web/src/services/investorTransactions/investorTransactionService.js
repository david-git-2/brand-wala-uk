import { investorTransactionRepo as defaultRepo } from "@/infra/firebase/repos/investorTransactionRepo";

function s(v) {
  return String(v || "").trim();
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function ni(v, d = 0) {
  return Math.max(0, Math.round(n(v, d)));
}

function to01(v, fallback = 0) {
  const x = Number(v);
  if (Number.isFinite(x)) return x === 1 ? 1 : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const t = s(v).toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return 1;
  if (t === "0" || t === "false" || t === "no") return 0;
  return fallback;
}

function txnId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `ITX_${ts}_${rnd}`;
}

function periodKeyFromDate(isoDate) {
  const dt = isoDate ? new Date(isoDate) : new Date();
  if (Number.isNaN(dt.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function signedAmount(direction, amount) {
  const dir = s(direction).toLowerCase();
  const a = Math.abs(n(amount, 0));
  return dir === "out" || dir === "debit" ? -a : a;
}

function normalizeCreateInput(input = {}) {
  const txn_id = s(input.txn_id) || txnId();
  const txn_at = input.txn_at || new Date().toISOString();
  const period_key = s(input.period_key) || periodKeyFromDate(txn_at);
  const fy = Number(period_key.slice(0, 4));
  const fm = Number(period_key.slice(5, 7));
  return {
    txn_id,
    investor_id: s(input.investor_id),
    type: s(input.type),
    direction: s(input.direction),
    amount_bdt: n(input.amount_bdt, 0),
    running_balance_bdt: n(input.running_balance_bdt, 0),
    is_shipment_linked: to01(input.is_shipment_linked, 0),
    shipment_id: s(input.shipment_id),
    shipment_accounting_id: s(input.shipment_accounting_id),
    fiscal_year: Number.isFinite(fy) ? fy : ni(input.fiscal_year, 0),
    fiscal_month: Number.isFinite(fm) ? Math.min(12, Math.max(1, fm)) : Math.min(12, Math.max(1, ni(input.fiscal_month, 1))),
    period_key,
    ref_no: s(input.ref_no),
    note: s(input.note),
    txn_at,
    created_by: s(input.created_by).toLowerCase(),
  };
}

function normalizePatch(patch = {}) {
  const out = {};
  const strFields = [
    "investor_id",
    "type",
    "direction",
    "shipment_id",
    "shipment_accounting_id",
    "period_key",
    "ref_no",
    "note",
    "created_by",
  ];
  strFields.forEach((f) => {
    if (f in patch) out[f] = f === "created_by" ? s(patch[f]).toLowerCase() : s(patch[f]);
  });
  if ("amount_bdt" in patch) out.amount_bdt = n(patch.amount_bdt, 0);
  if ("running_balance_bdt" in patch) out.running_balance_bdt = n(patch.running_balance_bdt, 0);
  if ("is_shipment_linked" in patch) out.is_shipment_linked = to01(patch.is_shipment_linked, 0);
  if ("fiscal_year" in patch) out.fiscal_year = ni(patch.fiscal_year, 0);
  if ("fiscal_month" in patch) out.fiscal_month = Math.min(12, Math.max(1, ni(patch.fiscal_month, 1)));
  if ("txn_at" in patch) out.txn_at = patch.txn_at || null;
  return out;
}

export function createInvestorTransactionService(repo = defaultRepo) {
  return {
    async getTransactionById(txnId) {
      return repo.getById(s(txnId));
    },

    async listByInvestorId(investorId) {
      return repo.listByInvestorId(s(investorId));
    },

    async listByPeriod(periodKey) {
      return repo.listByPeriod(s(periodKey));
    },

    async createTransaction(input) {
      const normalized = normalizeCreateInput(input);
      const investorId = s(normalized.investor_id);
      if (!investorId) throw new Error("investor_id is required");
      const rows = await repo.listByInvestorId(investorId);
      const prevBalance = rows.length ? n(rows[0].running_balance_bdt, 0) : 0;
      const delta = signedAmount(normalized.direction, normalized.amount_bdt);
      normalized.running_balance_bdt = prevBalance + delta;
      return repo.create(normalized);
    },

    async updateTransaction(txnId, patch) {
      const id = s(txnId);
      if (!id) throw new Error("txn_id is required");
      return repo.update(id, normalizePatch(patch));
    },

    async removeTransaction(txnId) {
      const id = s(txnId);
      if (!id) throw new Error("txn_id is required");
      return repo.remove(id);
    },
  };
}

export const investorTransactionService = createInvestorTransactionService();
