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

function normalizeCreateInput(input = {}) {
  const txn_id = s(input.txn_id);
  if (!txn_id) throw new Error("txn_id is required");
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
    fiscal_year: ni(input.fiscal_year, 0),
    fiscal_month: Math.min(12, Math.max(1, ni(input.fiscal_month, 1))),
    period_key: s(input.period_key),
    ref_no: s(input.ref_no),
    note: s(input.note),
    txn_at: input.txn_at || null,
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
      return repo.create(normalizeCreateInput(input));
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
