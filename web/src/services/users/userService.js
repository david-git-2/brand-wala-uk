import { userRepo as defaultUserRepo } from "@/infra/firebase/repos/userRepo";
import { USER_ROLES } from "@/domain/users/types";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return USER_ROLES.includes(r) ? r : "customer";
}

function to01(v, fallback = 0) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "no") return 0;
  if (typeof v === "number") return v === 1 ? 1 : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  return fallback;
}

function normalizeCreateInput(input = {}) {
  const email = normalizeEmail(input.email || input.user_email);
  if (!email) throw new Error("Email is required");
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Name is required");
  return {
    email,
    name,
    role: normalizeRole(input.role),
    active: to01(input.active, 1),
    can_see_price_gbp: to01(input.can_see_price_gbp, 0),
    can_use_cart: to01(input.can_use_cart, 1),
  };
}

function normalizeUpdatePatch(patch = {}) {
  const out = {};
  if ("name" in patch) out.name = String(patch.name || "").trim();
  if ("role" in patch) out.role = normalizeRole(patch.role);
  if ("active" in patch) out.active = to01(patch.active, 1);
  if ("can_see_price_gbp" in patch) out.can_see_price_gbp = to01(patch.can_see_price_gbp, 0);
  if ("can_use_cart" in patch) out.can_use_cart = to01(patch.can_use_cart, 1);
  return out;
}

export function createUserService(repo = defaultUserRepo) {
  return {
    async getUserByEmail(email) {
      return repo.getByEmail(email);
    },
    async listUsers() {
      return repo.list();
    },
    async createUser(input) {
      return repo.create(normalizeCreateInput(input));
    },
    async updateUser(email, patch) {
      const normEmail = normalizeEmail(email);
      if (!normEmail) throw new Error("User email is required");
      return repo.update(normEmail, normalizeUpdatePatch(patch));
    },
    async removeUser(email) {
      const normEmail = normalizeEmail(email);
      if (!normEmail) throw new Error("User email is required");
      return repo.remove(normEmail);
    },
  };
}

export const userService = createUserService();
