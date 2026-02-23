// ============================
// UK_CartHandlers.gs (UPDATED)
// - Cart CRUD handlers
// - PRIMARY KEY: product_id (not barcode)
// - Uses header-based utils in UK_Utils.gs
// - Uses auth in UK_AuthChecks.gs (ukRequireActiveUser_)
// ============================

function UK_cartRequiredCols_() {
  return [
    "cart_item_sl",
    "cart_id",
    "user_email",
    "product_id",   // ✅ NEW PRIMARY KEY
    "barcode",      // keep for reference
    "brand",
    "name",
    "image_url",
    "price_gbp",
    "case_size",
    "quantity",
    "created_at",
    "updated_at",
  ];
}

function UK_cartSheet_() {
  const sh = ukGetSheet_("uk_cart_items");
  if (!sh) throw new Error("Missing sheet uk_cart_items");
  return sh;
}

// Find cart row by (email + product_id)
function UK_findCartRow_(sh, email, productId) {
  const { rows } = ukReadObjects_(sh);
  const emailN = String(email || "").trim().toLowerCase();
  const pidN = String(productId || "").trim();

  for (const r of rows) {
    const re = String(r.user_email || "").trim().toLowerCase();
    const rp = String(r.product_id || "").trim();
    if (re === emailN && rp === pidN) return r; // contains _row
  }
  return null;
}

// Ensure quantity respects case_size minimum rules (min 6)
function UK_cartNormalizeQty_(caseSizeRaw, qtyRaw) {
  const caseSize = Math.max(6, Number(caseSizeRaw || 0) || 0);
  const qty = Number(qtyRaw || 0) || 0;

  // Clamp to minimum caseSize (which itself is min 6)
  const safeQty = Math.max(caseSize, qty);
  return { caseSize, safeQty };
}

// Optional helper: build product_id if not provided (backward compat)
function UK_buildProductId_(item) {
  const pid = String(item.product_id || item.productId || "").trim();
  if (pid) return pid;

  const pc = String(item.product_code || item.productCode || "").trim();
  const bc = String(item.barcode || "").trim();
  if (pc && bc) return pc + "_" + bc;

  return "";
}

/**
 * Add item to cart
 * body:
 * {
 *   action: "uk_cart_add_item",
 *   email: "user@example.com",
 *   item: {
 *     product_id, product_code, barcode, name, brand, imageUrl, price, case_size, quantity
 *   }
 * }
 *
 * Behavior:
 * - If exists: increments quantity by provided qty (clamped)
 * - Else: creates row
 */
function UK_handleCartAddItem(body) {
  try {
    const email = String(body.email || "").trim();
    if (!email) return ukJson_({ success: false, error: "Missing email" });

    const auth = ukRequireActiveUser_(email);
    if (!auth.ok) return ukJson_({ success: false, error: auth.error });

    const item = body.item || {};

    const productId = UK_buildProductId_(item);
    if (!productId) {
      return ukJson_({ success: false, error: "Missing item.product_id (or product_code + barcode)" });
    }

    const barcode = String(item.barcode || "").trim();
    const name = String(item.name || "").trim();
    if (!name) return ukJson_({ success: false, error: "Missing item.name" });

    const brand = String(item.brand || "").trim();
    const imageUrl = String(item.image_url || item.imageUrl || item.imageURL || item.image || "").trim();
    const priceGbp = Number(item.price ?? item.price_gbp ?? 0) || 0;

    const { caseSize, safeQty } = UK_cartNormalizeQty_(
      item.case_size ?? item.caseSize,
      item.quantity ?? item.qty
    );

    const sh = UK_cartSheet_();
    const map = ukHeaderMap_(sh);

    const missing = UK_cartRequiredCols_().filter((k) => map[k] == null);
    if (missing.length) {
      return ukJson_({ success: false, error: "uk_cart_items missing columns: " + missing.join(", ") });
    }

    const nowIso = ukToIso_(new Date());
    const found = UK_findCartRow_(sh, email, productId);

    if (found) {
      const currentQty = Number(found.quantity || 0) || 0;
      const nextQty = Math.max(caseSize, currentQty + safeQty); // increment
      ukSetRowByKeys_(sh, found._row, { quantity: nextQty, updated_at: nowIso }, true);

      return ukJson_({
        success: true,
        mode: "updated_existing",
        product_id: productId,
        quantity: nextQty,
      });
    }

    // new row
    const header = ukGetHeader_(sh);
    const row = new Array(header.length).fill("");

    const nextSL = Math.max(0, sh.getLastRow() - 1) + 1;
    const cartId = "UKC_" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);

    row[map["cart_item_sl"]] = nextSL;
    row[map["cart_id"]] = cartId;
    row[map["user_email"]] = email;

    row[map["product_id"]] = productId;
    row[map["barcode"]] = barcode;

    row[map["brand"]] = brand;
    row[map["name"]] = name;
    row[map["image_url"]] = imageUrl;
    row[map["price_gbp"]] = priceGbp;
    row[map["case_size"]] = caseSize;
    row[map["quantity"]] = safeQty;
    row[map["created_at"]] = nowIso;
    row[map["updated_at"]] = nowIso;

    sh.appendRow(row);

    return ukJson_({
      success: true,
      mode: "added_new",
      cart_id: cartId,
      product_id: productId,
      quantity: safeQty,
    });
  } catch (err) {
    return ukJson_({ success: false, error: err?.message ? err.message : String(err) });
  }
}

/**
 * Update cart item quantity only
 * body:
 * {
 *   action: "uk_cart_update_item",
 *   email: "user@example.com",
 *   product_id: "...",
 *   quantity: 12
 * }
 */
function UK_handleCartUpdateItem(body) {
  try {
    const email = String(body.email || "").trim();
    const productId = String(body.product_id || body.productId || "").trim();
    const qtyRaw = body.quantity;

    if (!email) return ukJson_({ success: false, error: "Missing email" });
    if (!productId) return ukJson_({ success: false, error: "Missing product_id" });

    const auth = ukRequireActiveUser_(email);
    if (!auth.ok) return ukJson_({ success: false, error: auth.error });

    const sh = UK_cartSheet_();
    const map = ukHeaderMap_(sh);

    const missing = UK_cartRequiredCols_().filter((k) => map[k] == null);
    if (missing.length) {
      return ukJson_({ success: false, error: "uk_cart_items missing columns: " + missing.join(", ") });
    }

    const found = UK_findCartRow_(sh, email, productId);
    if (!found) return ukJson_({ success: false, error: "Cart item not found" });

    const { caseSize, safeQty } = UK_cartNormalizeQty_(found.case_size, qtyRaw);
    const nowIso = ukToIso_(new Date());

    ukSetRowByKeys_(sh, found._row, { quantity: safeQty, updated_at: nowIso }, true);

    return ukJson_({ success: true, product_id: productId, quantity: safeQty, case_size: caseSize });
  } catch (err) {
    return ukJson_({ success: false, error: err?.message ? err.message : String(err) });
  }
}

/**
 * Delete cart item (remove one product from cart)
 * body:
 * {
 *   action: "uk_cart_delete_item",
 *   email: "user@example.com",
 *   product_id: "..."
 * }
 */
function UK_handleCartDeleteItem(body) {
  try {
    const email = String(body.email || "").trim();
    const productId = String(body.product_id || body.productId || "").trim();

    if (!email) return ukJson_({ success: false, error: "Missing email" });
    if (!productId) return ukJson_({ success: false, error: "Missing product_id" });

    const auth = ukRequireActiveUser_(email);
    if (!auth.ok) return ukJson_({ success: false, error: auth.error });

    const sh = UK_cartSheet_();
    const found = UK_findCartRow_(sh, email, productId);
    if (!found) return ukJson_({ success: true, removed: 0 }); // idempotent

    sh.deleteRow(found._row);

    return ukJson_({ success: true, removed: 1, product_id: productId });
  } catch (err) {
    return ukJson_({ success: false, error: err?.message ? err.message : String(err) });
  }
}

/**
 * Get cart items for a user
 * body:
 * {
 *   action: "uk_cart_get_items",
 *   email: "user@example.com"
 * }
 */
function UK_handleCartGetItems(body) {
  try {
    const email = String(body.email || "").trim();
    if (!email) return ukJson_({ success: false, error: "Missing email" });

    const auth = ukRequireActiveUser_(email);
    if (!auth.ok) return ukJson_({ success: false, error: auth.error });

    const sh = UK_cartSheet_();
    const { rows } = ukReadObjects_(sh);

    const emailN = email.toLowerCase();
    const items = rows
      .filter((r) => String(r.user_email || "").trim().toLowerCase() === emailN)
      .map((r) => ({
        cart_id: r.cart_id,
        product_id: r.product_id,
        barcode: r.barcode,
        brand: r.brand,
        name: r.name,
        image_url: r.image_url,
        price_gbp: Number(r.price_gbp || 0) || 0,
        case_size: Number(r.case_size || 0) || 0,
        quantity: Number(r.quantity || 0) || 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

    return ukJson_({ success: true, email, items, count: items.length });
  } catch (err) {
    return ukJson_({ success: false, error: err?.message ? err.message : String(err) });
  }
}

/**
 * Clear cart for a user (permanent delete)
 * body:
 * {
 *   action: "uk_cart_clear",
 *   email: "user@example.com"
 * }
 */
function UK_handleCartClear(body) {
  try {
    const email = String(body.email || "").trim();
    if (!email) return ukJson_({ success: false, error: "Missing email" });

    const auth = ukRequireActiveUser_(email);
    if (!auth.ok) return ukJson_({ success: false, error: auth.error });

    const removed = UK_clearCartForEmail_(email);

    return ukJson_({ success: true, email, removed });
  } catch (err) {
    return ukJson_({ success: false, error: err?.message ? err.message : String(err) });
  }
}

// Internal helper used by create_order to wipe cart
function UK_clearCartForEmail_(email) {
  const sh = UK_cartSheet_();
  const { rows } = ukReadObjects_(sh);
  const emailN = String(email || "").trim().toLowerCase();

  // delete bottom-up to keep row indexes valid
  const toDelete = rows
    .filter((r) => String(r.user_email || "").trim().toLowerCase() === emailN)
    .map((r) => r._row)
    .sort((a, b) => b - a);

  for (const rowIndex of toDelete) sh.deleteRow(rowIndex);

  return toDelete.length;
}