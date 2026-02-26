import { productWeightRepo as defaultRepo } from "@/infra/firebase/repos/productWeightRepo";

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

function normalizeCreateInput(input = {}) {
  const weight_key = s(input.weight_key || input.id);
  const product_id = s(input.product_id);
  const barcode = s(input.barcode);
  if (!weight_key && !product_id) throw new Error("weight_key or product_id is required");
  const unit_product_weight_g = ni(input.unit_product_weight_g, 0);
  const unit_package_weight_g = ni(input.unit_package_weight_g, 0);
  return {
    weight_key,
    product_id,
    product_code: s(input.product_code),
    barcode,
    name: s(input.name),
    unit_product_weight_g,
    unit_package_weight_g,
    unit_total_weight_g: ni(input.unit_total_weight_g, unit_product_weight_g + unit_package_weight_g),
    source: s(input.source || "manual"),
    actor_email: s(input.actor_email),
  };
}

function normalizePatch(patch = {}) {
  const out = {};
  const strFields = ["product_id", "product_code", "barcode", "name", "source", "actor_email"];
  strFields.forEach((f) => {
    if (f in patch) out[f] = s(patch[f]);
  });
  const intFields = ["unit_product_weight_g", "unit_package_weight_g", "unit_total_weight_g"];
  intFields.forEach((f) => {
    if (f in patch) out[f] = ni(patch[f], 0);
  });
  return out;
}

export function createProductWeightService(repo = defaultRepo) {
  return {
    async getById(weightKey) {
      return repo.getById(s(weightKey));
    },

    async getByProductId(productId) {
      return repo.getByProductId(s(productId));
    },

    async listWeights() {
      return repo.list();
    },

    async createWeight(input) {
      return repo.create(normalizeCreateInput(input));
    },

    async updateWeight(weightKey, patch) {
      const key = s(weightKey);
      if (!key) throw new Error("weight_key is required");
      return repo.update(key, normalizePatch(patch));
    },

    async removeWeight(weightKey, meta = {}) {
      const key = s(weightKey);
      if (!key) throw new Error("weight_key is required");
      return repo.remove(key, {
        actor_email: s(meta.actor_email),
        source: s(meta.source || "manual"),
      });
    },
  };
}

export const productWeightService = createProductWeightService();
