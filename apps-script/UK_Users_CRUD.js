/************** UK_Users_CRUD.gs **************/

function UK_handleUserGetAll(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const sh = ukGetSheet_("users");
  UK_getMapStrict_(sh, ["email", "active", "role", "can_see_price_gbp", "name"]);

  const rows = ukReadObjects_(sh).rows.map(function(r) {
    return {
      email: String(r.email || "").trim(),
      active: ukBool01_(r.active),
      role: String(r.role || "customer").toLowerCase().trim() || "customer",
      can_see_price_gbp: ukBool01_(r.can_see_price_gbp),
      name: String(r.name || "").trim(),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  rows.sort(function(a, b) {
    return String(a.email).localeCompare(String(b.email));
  });

  return { success: true, users: rows };
}

function UK_handleUserGetOne(body) {
  body = body || {};
  const user = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(user);

  const email = String(body.target_email || body.email_to_get || body.user_email || "").trim();
  if (!email) throw new Error("target_email is required");

  const sh = ukGetSheet_("users");
  const m = UK_getMapStrict_(sh, ["email", "active", "role", "can_see_price_gbp", "name"]);
  const found = ukFindRowById_(sh, m.email, email);
  if (!found) throw new Error("User not found: " + email);

  return {
    success: true,
    user: {
      email: String(found[m.email] || "").trim(),
      active: ukBool01_(found[m.active]),
      role: String(found[m.role] || "customer").toLowerCase().trim() || "customer",
      can_see_price_gbp: ukBool01_(found[m.can_see_price_gbp]),
      name: String(found[m.name] || "").trim(),
    },
  };
}

function UK_handleUserCreate(body) {
  body = body || {};
  const actor = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(actor);

  const email = String(body.user_email || body.target_email || "").trim().toLowerCase();
  if (!email) throw new Error("user_email is required");

  const sh = ukGetSheet_("users");
  const m = UK_getMapStrict_(sh, ["email", "active", "role", "can_see_price_gbp", "name"]);

  if (ukFindRowById_(sh, m.email, email)) {
    throw new Error("User already exists: " + email);
  }

  const role = String(body.role || "customer").toLowerCase().trim();
  if (role !== "admin" && role !== "customer") throw new Error("role must be admin or customer");

  const row = new Array(sh.getLastColumn()).fill("");
  row[m.email] = email;
  row[m.active] = body.active === undefined ? 1 : ukBool01_(body.active);
  row[m.role] = role;
  row[m.can_see_price_gbp] = body.can_see_price_gbp === undefined ? 0 : ukBool01_(body.can_see_price_gbp);
  row[m.name] = String(body.name || "").trim();

  const hdr = ukHeaderMap_(sh);
  if (hdr.created_at != null) row[hdr.created_at] = new Date();
  if (hdr.updated_at != null) row[hdr.updated_at] = new Date();

  sh.appendRow(row);
  return { success: true, email: email };
}

function UK_handleUserUpdate(body) {
  body = body || {};
  const actor = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(actor);

  const targetEmail = String(body.user_email || body.target_email || "").trim().toLowerCase();
  if (!targetEmail) throw new Error("user_email is required");

  const sh = ukGetSheet_("users");
  const m = UK_getMapStrict_(sh, ["email", "active", "role", "can_see_price_gbp", "name"]);
  const found = ukFindRowIndexById_(sh, m.email, targetEmail);
  if (found.rowIndex < 0) throw new Error("User not found: " + targetEmail);

  if (body.name !== undefined) sh.getRange(found.rowIndex, m.name + 1).setValue(String(body.name || "").trim());
  if (body.active !== undefined) sh.getRange(found.rowIndex, m.active + 1).setValue(ukBool01_(body.active));
  if (body.can_see_price_gbp !== undefined) sh.getRange(found.rowIndex, m.can_see_price_gbp + 1).setValue(ukBool01_(body.can_see_price_gbp));
  if (body.role !== undefined) {
    const role = String(body.role || "").toLowerCase().trim();
    if (role !== "admin" && role !== "customer") throw new Error("role must be admin or customer");
    sh.getRange(found.rowIndex, m.role + 1).setValue(role);
  }

  const hdr = ukHeaderMap_(sh);
  if (hdr.updated_at != null) sh.getRange(found.rowIndex, hdr.updated_at + 1).setValue(new Date());

  return { success: true, email: targetEmail };
}

function UK_handleUserDelete(body) {
  body = body || {};
  const actor = ukRequireActiveUserOrThrow_(body);
  UK_assertAdmin_(actor);

  const targetEmail = String(body.user_email || body.target_email || "").trim().toLowerCase();
  if (!targetEmail) throw new Error("user_email is required");

  if (String(actor.email || "").toLowerCase() === targetEmail) {
    throw new Error("Cannot delete currently logged-in admin");
  }

  const sh = ukGetSheet_("users");
  const m = UK_getMapStrict_(sh, ["email"]);
  const found = ukFindRowIndexById_(sh, m.email, targetEmail);
  if (found.rowIndex < 0) throw new Error("User not found: " + targetEmail);

  sh.deleteRow(found.rowIndex);
  return { success: true, email: targetEmail };
}
