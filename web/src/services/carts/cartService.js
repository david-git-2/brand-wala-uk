import { cartRepo as defaultCartRepo } from "@/infra/firebase/repos/cartRepo";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeProductId(productId) {
  return String(productId || "").trim();
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function minStep(caseSize) {
  return Math.max(6, Math.round(n(caseSize, 0)));
}

function roundUpToStep(qty, step) {
  const s = Math.max(1, Math.round(n(step, 1)));
  const q = Math.max(0, Math.round(n(qty, 0)));
  if (q === 0) return 0;
  return Math.max(s, Math.ceil(q / s) * s);
}

function normalizeCartItemInput(item = {}) {
  const product_id = normalizeProductId(item.product_id);
  if (!product_id) throw new Error("Missing product_id");
  const case_size = n(item.case_size, 0);
  const qty_step = minStep(case_size);
  const quantity = roundUpToStep(n(item.quantity, qty_step), qty_step);
  const unit_price_gbp = n(item.unit_price_gbp, n(item.price_gbp, 0));
  return {
    product_id,
    product_code: String(item.product_code || "").trim(),
    barcode: String(item.barcode || "").trim(),
    name: String(item.name || "").trim(),
    brand: String(item.brand || "").trim(),
    image_url: String(item.image_url || item.imageUrl || "").trim(),
    price_gbp: unit_price_gbp,
    unit_price_gbp,
    case_size,
    qty_step,
    country_of_origin: String(item.country_of_origin || "").trim(),
    quantity,
    line_total_gbp: Number((unit_price_gbp * quantity).toFixed(2)),
  };
}

function normalizeCartItemOutput(item = {}) {
  const quantity = Math.max(0, Math.round(n(item.quantity, 0)));
  const unit_price_gbp = n(item.unit_price_gbp, n(item.price_gbp, 0));
  return {
    product_id: normalizeProductId(item.product_id),
    product_code: String(item.product_code || "").trim(),
    barcode: String(item.barcode || "").trim(),
    name: String(item.name || "").trim(),
    brand: String(item.brand || "").trim(),
    image_url: String(item.image_url || item.imageUrl || "").trim(),
    unit_price_gbp,
    qty_step: minStep(item.qty_step ?? item.case_size),
    quantity,
    line_total_gbp: Number((unit_price_gbp * quantity).toFixed(2)),
  };
}

export function createCartService(repo = defaultCartRepo) {
  return {
    async getCart(email) {
      const e = normalizeEmail(email);
      if (!e) throw new Error("Missing email");
      const res = await repo.getByUser(e);
      const items = Array.isArray(res?.items) ? res.items.map(normalizeCartItemOutput) : [];
      return { items };
    },

    async addItem(email, item) {
      const e = normalizeEmail(email);
      if (!e) throw new Error("Missing email");
      const payload = normalizeCartItemInput(item);
      await repo.addItem(e, payload);
      return this.getCart(e);
    },

    async updateItemQuantity(email, productId, quantity) {
      const e = normalizeEmail(email);
      const pid = normalizeProductId(productId);
      if (!e) throw new Error("Missing email");
      if (!pid) throw new Error("Missing product_id");
      const qty = Math.max(0, Math.round(n(quantity, 0)));
      if (qty === 0) {
        await repo.removeItem(e, pid);
      } else {
        const current = await repo.getByUser(e);
        const currentItem = Array.isArray(current?.items)
          ? current.items.find((it) => normalizeProductId(it.product_id) === pid)
          : null;
        const step = minStep(currentItem?.qty_step ?? currentItem?.case_size ?? 0);
        const safeQty = roundUpToStep(qty, step);
        await repo.updateItemQuantity(e, pid, safeQty, {
          qty_step: step,
          unit_price_gbp: n(currentItem?.unit_price_gbp, n(currentItem?.price_gbp, 0)),
        });
      }
      return this.getCart(e);
    },

    async removeItem(email, productId) {
      const e = normalizeEmail(email);
      const pid = normalizeProductId(productId);
      if (!e) throw new Error("Missing email");
      if (!pid) throw new Error("Missing product_id");
      await repo.removeItem(e, pid);
      return this.getCart(e);
    },

    async clearCart(email) {
      const e = normalizeEmail(email);
      if (!e) throw new Error("Missing email");
      await repo.clear(e);
      return { items: [] };
    },
  };
}

export const cartService = createCartService();
