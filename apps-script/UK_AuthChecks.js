// ============================
// UK_AuthChecks.gs
// ============================

function ukGetUserByEmail_(email) {
  const em = String(email || "").trim();
  if (!em) return null;

  const sh = ukGetSheet_("users");
  const rows = ukReadObjects_(sh).rows;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowEmail = String(r.email || "").trim();
    if (rowEmail !== em) continue;

    return {
      email: rowEmail,
      active: ukTruthy_(r.active),
      role: String(r.role || "customer").toLowerCase().trim() || "customer",
      can_see_price_gbp: ukTruthy_(r.can_see_price_gbp),
      name: String(r.name || "").trim(),
    };
  }
  return null;
}

function ukRequireActiveUser_(email) {
  const user = ukGetUserByEmail_(email);
  if (!user || !user.active) return { ok: false, error: "Not authorized" };
  return { ok: true, user: user };
}

function ukResolveEmail_(input) {
  if (typeof input === "string") return String(input || "").trim();
  if (!input || typeof input !== "object") return "";
  return String(input.email || input.user_email || "").trim();
}

function ukRequireActiveUserOrThrow_(input) {
  const email = ukResolveEmail_(input);
  if (!email) throw new Error("email is required");
  const auth = ukRequireActiveUser_(email);
  if (!auth.ok) throw new Error(auth.error || "Not authorized");
  return auth.user;
}

function ukIsAdmin_(user) {
  return String((user && user.role) || "").toLowerCase().trim() === "admin";
}

function ukCanSeePriceGBP_(user) {
  if (!user) return false;
  if (ukIsAdmin_(user)) return true;
  return ukTruthy_(user.can_see_price_gbp);
}
