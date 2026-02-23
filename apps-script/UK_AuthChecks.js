// ============================
// UK_AuthChecks.gs  (UPDATED - HEADER/NAME BASED)
// - checks if admin or not
// - checks if price is visible to user
//
// Reads from sheet: Users
// Expected headers (snake_case):
// email	active	role	can_see_price_gbp	name
// ============================

function ukGetUserByEmail_(email) {
  email = String(email || "").trim();
  if (!email) return null;

  const sh = ukGetSheet_("users");
  if (!sh) return null;

  // Read rows as objects by header name (no column numbers)
  const { rows } = ukReadObjects_(sh);

  for (const r of rows) {
    const rowEmail = String(r.email || "").trim();
    if (rowEmail !== email) continue;

    const active = ukTruthy_(r.active);
    const role = String(r.role || "").toLowerCase().trim() || "customer";
    const canSee = ukTruthy_(r.can_see_price_gbp);
    const name = String(r.name || "").trim();

    return {
      email: rowEmail,
      active,
      role,
      can_see_price_gbp: canSee,
      name
    };
  }
  return null;
}

function ukRequireActiveUser_(email) {
  const user = ukGetUserByEmail_(email);
  if (!user || !user.active) return { ok: false, error: "Not authorized" };
  return { ok: true, user };
}

// ✅ 1) Check if admin
function ukIsAdmin_(user) {
  return String(user?.role || "").toLowerCase().trim() === "admin";
}

// ✅ 2) Check if GBP price is visible
function ukCanSeePriceGBP_(user) {
  if (!user) return false;
  if (ukIsAdmin_(user)) return true;
  return ukTruthy_(user.can_see_price_gbp);
}
