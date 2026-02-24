import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore/lite";
import { firestoreDb } from "./client";

export const ORDER_STATUSES = [
  "draft",
  "submitted",
  "priced",
  "under_review",
  "finalized",
  "processing",
  "partially_delivered",
  "delivered",
  "cancelled",
];

const ADMIN_STATUS_TRANSITIONS = {
  draft: ["submitted", "cancelled"],
  submitted: ["priced", "cancelled"],
  priced: ["under_review", "finalized", "submitted", "cancelled"],
  under_review: ["priced", "finalized", "cancelled"],
  finalized: ["under_review", "processing", "cancelled"],
  processing: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["processing", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function r2(v) {
  return Number((n(v) || 0).toFixed(2));
}

function normalizeOrderStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return ORDER_STATUSES.includes(s) ? s : "";
}

export function getAllowedNextOrderStatuses(currentStatus, { role = "admin", includeCurrent = false } = {}) {
  const curr = normalizeOrderStatus(currentStatus);
  const viewerRole = String(role || "admin").toLowerCase();
  if (!curr) return includeCurrent ? [...ORDER_STATUSES] : [];
  if (viewerRole !== "admin") return includeCurrent ? [curr] : [];
  const next = ADMIN_STATUS_TRANSITIONS[curr] || [];
  return includeCurrent ? [curr, ...next] : [...next];
}

function makeOrderId() {
  const ts = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `ORD_${ts}_${rnd}`;
}

function normalizeItem(item, idx) {
  const ordered_quantity = Math.max(0, n(item?.ordered_quantity));
  const buy_price_gbp = n(item?.buy_price_gbp);
  return {
    order_item_id: String(item?.order_item_id || "").trim() || `${idx + 1}`,
    item_sl: idx + 1,
    product_id: String(item?.product_id || "").trim(),
    barcode: String(item?.barcode || "").trim(),
    brand: String(item?.brand || "").trim(),
    name: String(item?.name || "").trim(),
    image_url: String(item?.image_url || item?.imageUrl || "").trim(),
    case_size: n(item?.case_size),
    ordered_quantity,
    buy_price_gbp,
    line_purchase_value_gbp: Number((ordered_quantity * buy_price_gbp).toFixed(2)),
  };
}

function toOrderRow(data, id) {
  return {
    order_id: String(data?.order_id || id || ""),
    order_name: String(data?.order_name || "Untitled"),
    creator_email: String(data?.creator_email || ""),
    creator_name: String(data?.creator_name || ""),
    creator_role: String(data?.creator_role || "customer"),
    status: String(data?.status || "submitted"),
    created_at: data?.created_at || null,
    updated_at: data?.updated_at || null,
    total_order_qty: n(data?.total_order_qty),
    total_purchase_value_gbp: n(data?.total_purchase_value_gbp),
    calculated_selling_price: data?.calculated_selling_price || null,
  };
}

function toOrderItemRow(data, id) {
  return {
    order_item_id: String(data?.order_item_id || id || ""),
    item_sl: n(data?.item_sl),
    product_id: String(data?.product_id || ""),
    barcode: String(data?.barcode || ""),
    brand: String(data?.brand || ""),
    name: String(data?.name || ""),
    image_url: String(data?.image_url || ""),
    case_size: n(data?.case_size),
    ordered_quantity: n(data?.ordered_quantity),
    buy_price_gbp: n(data?.buy_price_gbp),
    line_purchase_value_gbp: n(data?.line_purchase_value_gbp),
    calculated_selling_price: data?.calculated_selling_price || null,
    pricing_snapshot: data?.pricing_snapshot || null,
    customer_offer: data?.customer_offer || null,
    customer_unit_gbp: data?.customer_unit_gbp,
    customer_unit_bdt: data?.customer_unit_bdt,
    customer_changed_quantity: data?.customer_changed_quantity,
    final_quantity: data?.final_quantity,
    final_unit_gbp: data?.final_unit_gbp,
    final_unit_bdt: data?.final_unit_bdt,
  };
}

async function recomputeOrderHeaderTotals(orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) return;
  const itemsSnap = await getDocs(collection(firestoreDb, "orders", oid, "items"));
  let totalQty = 0;
  let totalPurchase = 0;
  itemsSnap.docs.forEach((d) => {
    const row = d.data() || {};
    const qty = Math.max(0, n(row?.ordered_quantity, 0));
    const line = n(row?.line_purchase_value_gbp, n(row?.buy_price_gbp, 0) * qty);
    totalQty += qty;
    totalPurchase += line;
  });
  await setDoc(
    doc(firestoreDb, "orders", oid),
    {
      total_order_qty: Math.round(totalQty),
      total_purchase_value_gbp: r2(totalPurchase),
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function createOrderWithItems({
  email,
  creator_name,
  creator_role,
  order_name,
  items = [],
}) {
  const creator_email = normEmail(email);
  if (!creator_email) throw new Error("Missing user email");
  if (!String(order_name || "").trim()) throw new Error("Missing order name");
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart is empty");
  }

  const order_id = makeOrderId();
  const normalizedItems = items
    .map((it, i) => normalizeItem(it, i))
    .filter((it) => it.ordered_quantity > 0 && it.product_id);

  if (!normalizedItems.length) throw new Error("No valid order items");

  const total_order_qty = normalizedItems.reduce((a, it) => a + it.ordered_quantity, 0);
  const total_purchase_value_gbp = Number(
    normalizedItems.reduce((a, it) => a + it.line_purchase_value_gbp, 0).toFixed(2),
  );

  const orderRef = doc(firestoreDb, "orders", order_id);
  const batch = writeBatch(firestoreDb);
  batch.set(orderRef, {
    order_id,
    order_name: String(order_name).trim(),
    creator_email,
    creator_name: String(creator_name || "").trim(),
    creator_role: String(creator_role || "customer").toLowerCase(),
    status: "submitted",
    total_order_qty,
    total_purchase_value_gbp,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  normalizedItems.forEach((it) => {
    const itemDocId = `${order_id}-${it.item_sl}`;
    batch.set(doc(firestoreDb, "orders", order_id, "items", itemDocId), {
      ...it,
      order_item_id: itemDocId,
      order_id,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  });

  await batch.commit();
  return { order_id };
}

export async function getOrdersForViewer({ email, role }) {
  const viewerEmail = normEmail(email);
  const viewerRole = String(role || "customer").toLowerCase();
  if (!viewerEmail) return [];

  const baseCol = collection(firestoreDb, "orders");
  const q =
    viewerRole === "admin"
      ? query(baseCol, orderBy("created_at", "desc"))
      : query(baseCol, where("creator_email", "==", viewerEmail));

  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => toOrderRow(d.data(), d.id));
  if (viewerRole !== "admin") {
    rows.sort((a, b) => String(b.order_id || "").localeCompare(String(a.order_id || "")));
  }
  return rows;
}

export async function getOrderForViewer({ email, role, order_id }) {
  const viewerEmail = normEmail(email);
  const viewerRole = String(role || "customer").toLowerCase();
  if (!viewerEmail || !order_id) return null;

  const ref = doc(firestoreDb, "orders", String(order_id));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const order = toOrderRow(snap.data(), snap.id);
  if (viewerRole !== "admin" && order.creator_email !== viewerEmail) {
    return null;
  }
  return order;
}

export async function getOrderItemsForViewer({ email, role, order_id }) {
  const order = await getOrderForViewer({ email, role, order_id });
  if (!order) return { order: null, items: [] };

  const snap = await getDocs(
    query(collection(firestoreDb, "orders", String(order_id), "items"), orderBy("item_sl", "asc")),
  );

  return {
    order,
    items: snap.docs.map((d) => toOrderItemRow(d.data(), d.id)),
  };
}

export async function saveCalculatedSellingPrices({
  order_id,
  price_mode,
  profit_rate_pct,
  customer_price_currency,
  update_order_meta = true,
  rows = [],
}) {
  const oid = String(order_id || "").trim();
  if (!oid) throw new Error("Missing order_id");
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("No rows to save");

  const mode = String(price_mode || "purchase");
  const pct = n(profit_rate_pct, 0);
  const batch = writeBatch(firestoreDb);

  rows.forEach((r) => {
    const itemId = String(r?.order_item_id || "").trim();
    if (!itemId) return;
    const itemRef = doc(firestoreDb, "orders", oid, "items", itemId);
    batch.set(
      itemRef,
      {
        pricing_snapshot: {
          // Initial purchase unit price
          initial_unit_gbp: r2(r.initial_unit_gbp),
          initial_unit_bdt: Math.round(n(r.initial_unit_bdt)),
          // Initial purchase + cargo unit price
          initial_plus_cargo_unit_gbp: r2(
            r.initial_plus_cargo_unit_gbp ?? (n(r.initial_unit_gbp) + n(r.cargo_unit_gbp)),
          ),
          initial_plus_cargo_unit_bdt: Math.round(
            n(r.initial_plus_cargo_unit_bdt),
          ),
          // System-calculated offer (before manual override)
          calculated_offer_unit_gbp: r2(
            r.calculated_offer_unit_gbp ?? r.selling_unit_gbp,
          ),
          calculated_offer_unit_bdt: Math.round(
            n(r.calculated_offer_unit_bdt, r.selling_unit_bdt),
          ),
          // Current offer shown to customer
          offer_unit_gbp: r2(r.offer_unit_gbp ?? r.offered_product_unit_gbp),
          offer_unit_bdt: Math.round(
            n(r.offer_unit_bdt, r.offered_product_unit_bdt),
          ),
          // Customer counter + final (kept in sync from dedicated APIs too)
          customer_counter_unit_gbp: r.customer_counter_unit_gbp ?? null,
          customer_counter_unit_bdt: r.customer_counter_unit_bdt ?? null,
          final_unit_gbp: r.final_unit_gbp ?? null,
          final_unit_bdt: r.final_unit_bdt ?? null,
          updated_at: serverTimestamp(),
        },
        calculated_selling_price: {
          mode,
          profit_rate_pct: pct,
          offered_product_unit_gbp: r2(r.offered_product_unit_gbp),
          offered_product_unit_bdt: Math.round(n(r.offered_product_unit_bdt)),
          cargo_unit_gbp: r2(r.cargo_unit_gbp),
          cargo_unit_bdt: Math.round(n(r.cargo_unit_bdt)),
          selling_unit_gbp: r2(r.selling_unit_gbp),
          selling_unit_bdt: Math.round(n(r.selling_unit_bdt)),
          updated_at: serverTimestamp(),
        },
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  });

  if (update_order_meta) {
    const orderRef = doc(firestoreDb, "orders", oid);
    batch.set(
      orderRef,
      {
        calculated_selling_price: {
          mode,
          profit_rate_pct: pct,
          ...(customer_price_currency
            ? { customer_price_currency: String(customer_price_currency).toLowerCase() === "gbp" ? "gbp" : "bdt" }
            : {}),
          updated_at: serverTimestamp(),
        },
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
  return { success: true, saved: rows.length };
}

export async function setOrderCustomerPriceCurrency({ order_id, currency }) {
  const oid = String(order_id || "").trim();
  if (!oid) throw new Error("Missing order_id");
  const c = String(currency || "").toLowerCase() === "gbp" ? "gbp" : "bdt";
  await setDoc(
    doc(firestoreDb, "orders", oid),
    {
      calculated_selling_price: {
        customer_price_currency: c,
        updated_at: serverTimestamp(),
      },
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
  return { success: true, currency: c };
}

export async function updateOrderStatus({ order_id, status }) {
  const oid = String(order_id || "").trim();
  const nextStatus = normalizeOrderStatus(status);
  if (!oid) throw new Error("Missing order_id");
  if (!nextStatus) throw new Error("Invalid status");
  const orderRef = doc(firestoreDb, "orders", oid);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) throw new Error("Order not found");
  const currentStatus = normalizeOrderStatus(snap.data()?.status) || "submitted";
  if (currentStatus === nextStatus) return { success: true, status: nextStatus };

  const allowed = getAllowedNextOrderStatuses(currentStatus, { role: "admin" });
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid status transition: ${currentStatus} -> ${nextStatus}`);
  }

  await setDoc(
    orderRef,
    {
      status: nextStatus,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
  return { success: true, status: nextStatus };
}

export async function submitCustomerPricingDecision({
  email,
  order_id,
  decision, // "accept" | "negotiate"
  currency, // "gbp" | "bdt"
  offers = [], // [{order_item_id, unit_price}]
}) {
  const viewerEmail = normEmail(email);
  const oid = String(order_id || "").trim();
  const mode = String(decision || "").toLowerCase();
  const ccy = String(currency || "").toLowerCase() === "gbp" ? "gbp" : "bdt";
  if (!viewerEmail) throw new Error("Missing user email");
  if (!oid) throw new Error("Missing order_id");
  if (mode !== "accept" && mode !== "negotiate") throw new Error("Invalid decision");
  if (!Array.isArray(offers) || offers.length === 0) throw new Error("No offers provided");

  const order = await getOrderForViewer({ email: viewerEmail, role: "customer", order_id: oid });
  if (!order) throw new Error("Order not found or not permitted");
  const status = String(order.status || "").toLowerCase();
  if (status !== "priced") throw new Error("Order is not in priced status");

  const batch = writeBatch(firestoreDb);
  offers.forEach((r) => {
    const itemId = String(r?.order_item_id || "").trim();
    if (!itemId) return;
    const unit = ccy === "gbp" ? r2(r?.unit_price) : Math.round(n(r?.unit_price));
    batch.set(
      doc(firestoreDb, "orders", oid, "items", itemId),
      {
        customer_offer: {
          decision: mode,
          currency: ccy,
          unit_price: unit,
          updated_at: serverTimestamp(),
        },
        ...(ccy === "gbp" ? { customer_unit_gbp: unit } : { customer_unit_bdt: unit }),
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  });

  const nextStatus = mode === "accept" ? "finalized" : "under_review";
  batch.set(
    doc(firestoreDb, "orders", oid),
    {
      status: nextStatus,
      customer_pricing_decision: {
        decision: mode,
        currency: ccy,
        updated_at: serverTimestamp(),
      },
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  return { success: true, status: nextStatus };
}

export async function saveCustomerOfferItem({
  email,
  order_id,
  order_item_id,
  currency, // "gbp" | "bdt"
  unit_price,
  decision = "negotiate",
  customer_changed_quantity,
}) {
  const viewerEmail = normEmail(email);
  const oid = String(order_id || "").trim();
  const itemId = String(order_item_id || "").trim();
  const ccy = String(currency || "").toLowerCase() === "gbp" ? "gbp" : "bdt";
  const mode = String(decision || "negotiate").toLowerCase();
  if (!viewerEmail) throw new Error("Missing user email");
  if (!oid) throw new Error("Missing order_id");
  if (!itemId) throw new Error("Missing order_item_id");

  const order = await getOrderForViewer({ email: viewerEmail, role: "customer", order_id: oid });
  if (!order) throw new Error("Order not found or not permitted");
  const status = String(order.status || "").toLowerCase();
  if (status !== "priced" && status !== "under_review") {
    throw new Error("Order is not open for customer pricing");
  }

  const unit = ccy === "gbp" ? r2(unit_price) : Math.round(n(unit_price));
  await setDoc(
    doc(firestoreDb, "orders", oid, "items", itemId),
    {
      customer_offer: {
        decision: mode,
        currency: ccy,
        unit_price: unit,
        updated_at: serverTimestamp(),
      },
      ...(ccy === "gbp" ? { customer_unit_gbp: unit } : { customer_unit_bdt: unit }),
      pricing_snapshot: {
        ...(ccy === "gbp"
          ? { customer_counter_unit_gbp: unit }
          : { customer_counter_unit_bdt: unit }),
        updated_at: serverTimestamp(),
      },
      ...(customer_changed_quantity !== undefined
        ? { customer_changed_quantity: Math.max(0, Math.round(n(customer_changed_quantity, 0))) }
        : {}),
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
  return { success: true };
}

export async function saveAdminFinalNegotiationItem({
  order_id,
  order_item_id,
  final_quantity,
  final_unit_gbp,
  final_unit_bdt,
  note,
}) {
  const oid = String(order_id || "").trim();
  const itemId = String(order_item_id || "").trim();
  if (!oid) throw new Error("Missing order_id");
  if (!itemId) throw new Error("Missing order_item_id");

  const qty = Math.max(0, Math.round(n(final_quantity, 0)));
  const unitGbp = r2(final_unit_gbp);
  const unitBdt = Math.round(n(final_unit_bdt, 0));
  const itemRef = doc(firestoreDb, "orders", oid, "items", itemId);
  const snap = await getDoc(itemRef);
  const prev = snap.exists() ? snap.data() : {};
  const buyPriceGbp = r2(n(prev?.buy_price_gbp, 0));

  await setDoc(
    itemRef,
    {
      // Accepted quantity becomes primary quantity for the item.
      ordered_quantity: qty,
      customer_changed_quantity: qty,
      line_purchase_value_gbp: r2(buyPriceGbp * qty),
      final_quantity: qty,
      final_unit_gbp: unitGbp,
      final_unit_bdt: unitBdt,
      pricing_snapshot: {
        final_unit_gbp: unitGbp,
        final_unit_bdt: unitBdt,
        updated_at: serverTimestamp(),
      },
      final_line_gbp: r2(unitGbp * qty),
      final_line_bdt: Math.round(unitBdt * qty),
      ...(note !== undefined ? { final_note: String(note || "").trim() } : {}),
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
  await recomputeOrderHeaderTotals(oid);
  return { success: true };
}

export async function deleteOrderItemAdmin({ order_id, order_item_id }) {
  const oid = String(order_id || "").trim();
  const itemId = String(order_item_id || "").trim();
  if (!oid) throw new Error("Missing order_id");
  if (!itemId) throw new Error("Missing order_item_id");

  await deleteDoc(doc(firestoreDb, "orders", oid, "items", itemId));
  await recomputeOrderHeaderTotals(oid);
  return { success: true };
}

export async function deleteOrderAdmin({ order_id }) {
  const oid = String(order_id || "").trim();
  if (!oid) throw new Error("Missing order_id");

  const orderRef = doc(firestoreDb, "orders", oid);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error("Order not found");
  const status = String(orderSnap.data()?.status || "").toLowerCase();
  if (status !== "cancelled") {
    throw new Error("Only cancelled orders can be deleted");
  }

  const itemsSnap = await getDocs(collection(firestoreDb, "orders", oid, "items"));
  const allocSnap = await getDocs(
    query(collection(firestoreDb, "shipment_allocations"), where("order_id", "==", oid)),
  );

  await Promise.all([
    ...itemsSnap.docs.map((d) => deleteDoc(d.ref)),
    ...allocSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);
  await deleteDoc(orderRef);
  return { success: true };
}
