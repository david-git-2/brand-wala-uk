import { investorRepo as defaultRepo } from "@/infra/firebase/repos/investorRepo";

function s(v) {
  return String(v || "").trim();
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function normalizeCreateInput(input = {}) {
  const investor_id = s(input.investor_id);
  if (!investor_id) throw new Error("investor_id is required");
  return {
    investor_id,
    name: s(input.name),
    phone: s(input.phone),
    email: s(input.email).toLowerCase(),
    status: s(input.status || "active").toLowerCase(),
    default_share_pct: n(input.default_share_pct, 0),
    opening_balance_bdt: n(input.opening_balance_bdt, 0),
    current_balance_bdt: n(input.current_balance_bdt, 0),
    notes: s(input.notes),
  };
}

function normalizePatch(patch = {}) {
  const out = {};
  const strFields = ["name", "phone", "email", "status", "notes"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = f === "email" ? s(patch[f]).toLowerCase() : s(patch[f]);
  });
  const numFields = ["default_share_pct", "opening_balance_bdt", "current_balance_bdt"];
  numFields.forEach((f) => {
    if (f in patch) out[f] = n(patch[f], 0);
  });
  return out;
}

export function createInvestorService(repo = defaultRepo) {
  return {
    async getInvestorById(investorId) {
      return repo.getById(s(investorId));
    },

    async listInvestors() {
      return repo.list();
    },

    async createInvestor(input) {
      return repo.create(normalizeCreateInput(input));
    },

    async updateInvestor(investorId, patch) {
      const id = s(investorId);
      if (!id) throw new Error("investor_id is required");
      return repo.update(id, normalizePatch(patch));
    },

    async removeInvestor(investorId) {
      const id = s(investorId);
      if (!id) throw new Error("investor_id is required");
      return repo.remove(id);
    },
  };
}

export const investorService = createInvestorService();
