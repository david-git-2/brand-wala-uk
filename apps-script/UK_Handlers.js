// ============================
// UK_Handlers.gs  (UPDATED - HEADER/NAME BASED)
// - Uses UK_AuthChecks + UK_Utils
// - No column numbers used here (auth layer already header-based)
// ============================

function UK_handleLogin(body) {
  const email = String(body.email || "").trim();
  if (!email) return ukJson_({ success: false, error: "Missing email" });

  const auth = ukRequireActiveUser_(email);
  if (!auth.ok) return ukJson_({ success: false, error: auth.error });

  const user = auth.user;

  return ukJson_({
    success: true,
    email: String(user.email || "").trim(),
    name: String(user.name || "").trim(),
    role: String(user.role || "customer").toLowerCase().trim(),
    can_see_price_gbp: ukCanSeePriceGBP_(user)
  });
}

function UK_handleCheckAccess(body) {
  const email = String(body.email || "").trim();
  if (!email) return ukJson_({ success: false, error: "Missing email" });

  const auth = ukRequireActiveUser_(email);
  if (!auth.ok) return ukJson_({ success: false, error: auth.error });

  const user = auth.user;

  return ukJson_({
    success: true,
    email: String(user.email || "").trim(),
    role: String(user.role || "customer").toLowerCase().trim(),
    is_admin: ukIsAdmin_(user),
    can_see_price_gbp: ukCanSeePriceGBP_(user)
  });
}
