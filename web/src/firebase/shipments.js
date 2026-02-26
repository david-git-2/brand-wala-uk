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
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore/lite";
import { firestoreDb } from "./client";

const SHIP_CACHE_TTL_MS = 15 * 1000;
let shipmentsListCache = null;
let shipmentsListCacheTs = 0;
let shipmentsListInflight = null;
const shipmentByIdCache = new Map();
const shipmentByIdInflight = new Map();
const allocByShipmentCache = new Map();
const allocByShipmentInflight = new Map();
const allocByOrderCache = new Map();
const allocByOrderInflight = new Map();
const snapshotByShipmentCache = new Map();
const snapshotByShipmentInflight = new Map();

function clearShipmentsCache({ shipmentId = "", orderId = "" } = {}) {
  const sid = String(shipmentId || "").trim();
  const oid = String(orderId || "").trim();

  shipmentsListCache = null;
  shipmentsListCacheTs = 0;
  shipmentsListInflight = null;

  if (sid) {
    shipmentByIdCache.delete(sid);
    shipmentByIdInflight.delete(sid);
    allocByShipmentCache.delete(sid);
    allocByShipmentInflight.delete(sid);
    snapshotByShipmentCache.delete(sid);
    snapshotByShipmentInflight.delete(sid);
  } else {
    shipmentByIdCache.clear();
    shipmentByIdInflight.clear();
    allocByShipmentCache.clear();
    allocByShipmentInflight.clear();
    snapshotByShipmentCache.clear();
    snapshotByShipmentInflight.clear();
  }

  if (oid) {
    allocByOrderCache.delete(oid);
    allocByOrderInflight.delete(oid);
  } else {
    allocByOrderCache.clear();
    allocByOrderInflight.clear();
  }
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function round2(v) {
  return Number((n(v) || 0).toFixed(2));
}

function round0(v) {
  return Math.round(n(v));
}

function shipmentId() {
  const ts = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `SHP_${ts}_${rnd}`;
}

function allocationId() {
  const ts = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `ALC_${ts}_${rnd}`;
}

function avgRate(s) {
  const avg = n(s?.gbp_avg_rate, NaN);
  if (Number.isFinite(avg) && avg > 0) return avg;
  const p = n(s?.gbp_rate_product, NaN);
  const c = n(s?.gbp_rate_cargo, NaN);
  if (Number.isFinite(p) && Number.isFinite(c) && p > 0 && c > 0) return (p + c) / 2;
  if (Number.isFinite(p) && p > 0) return p;
  if (Number.isFinite(c) && c > 0) return c;
  return 0;
}

function computeAllocationFields(a, shipment, orderItem = null) {
  const needed_qty = n(a?.needed_qty, n(a?.allocated_qty));
  const arrived_qty = n(a?.arrived_qty, n(a?.shipped_qty));
  const unit_product_weight = n(a?.unit_product_weight, n(orderItem?.unit_product_weight, 0));
  const unit_package_weight = n(a?.unit_package_weight, n(orderItem?.unit_package_weight, 0));
  const unit_total_weight = unit_product_weight + unit_package_weight;
  const needed_weight = round2(needed_qty * unit_total_weight);
  const arrived_weight = round2(arrived_qty * unit_total_weight);

  const buy_price_gbp = round2(
    n(a?.buy_price_gbp, n(orderItem?.buy_price_gbp, n(orderItem?.price_gbp, 0))),
  );

  const product_cost_gbp = round2(arrived_qty * buy_price_gbp);
  const cargo_cost_gbp = round2(arrived_weight * n(shipment?.cargo_cost_per_kg));
  const rateProduct = n(shipment?.gbp_rate_product, avgRate(shipment));
  const rateCargo = n(shipment?.gbp_rate_cargo, avgRate(shipment));
  const product_cost_bdt = round0(product_cost_gbp * rateProduct);
  const cargo_cost_bdt = round0(cargo_cost_gbp * rateCargo);
  const total_cost_bdt = round0(product_cost_bdt + cargo_cost_bdt);

  return {
    needed_qty,
    arrived_qty,
    allocated_qty: needed_qty,
    shipped_qty: arrived_qty,
    unit_product_weight,
    unit_package_weight,
    unit_total_weight: round2(unit_total_weight),
    needed_weight,
    arrived_weight,
    allocated_weight: needed_weight,
    shipped_weight: arrived_weight,
    buy_price_gbp,
    product_cost_gbp,
    product_cost_bdt,
    cargo_cost_gbp,
    cargo_cost_bdt,
    total_cost_bdt,
    revenue_bdt: n(a?.revenue_bdt, 0),
    profit_bdt: round0(n(a?.revenue_bdt, 0) - total_cost_bdt),
  };
}

function hasMissingWeight(row = {}, orderItem = null) {
  const up = n(row?.unit_product_weight, n(orderItem?.unit_product_weight, 0));
  const pk = n(row?.unit_package_weight, n(orderItem?.unit_package_weight, 0));
  if (!(up > 0)) return true;
  if (pk < 0) return true;
  return false;
}

async function syncOrderItemWeights(order_id, order_item_id, unit_product_weight, unit_package_weight) {
  const oid = String(order_id || "").trim();
  const oiid = String(order_item_id || "").trim();
  if (!oid || !oiid) return;
  await setDoc(
    doc(firestoreDb, "orders", oid, "items", oiid),
    {
      unit_product_weight: n(unit_product_weight, 0),
      unit_package_weight: n(unit_package_weight, 0),
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

async function syncAllAllocationsForOrderItem(order_item_id, unit_product_weight, unit_package_weight) {
  const oiid = String(order_item_id || "").trim();
  if (!oiid) return;
  const allocSnap = await getDocs(
    query(collection(firestoreDb, "shipment_allocations"), where("order_item_id", "==", oiid)),
  );
  if (allocSnap.empty) return;

  const shipmentCache = {};
  const itemCache = {};

  await Promise.all(
    allocSnap.docs.map(async (d) => {
      const prev = d.data() || {};
      const sid = String(prev.shipment_id || "").trim();
      const oid = String(prev.order_id || "").trim();
      const key = `${oid}__${oiid}`;

      if (!shipmentCache[sid]) shipmentCache[sid] = await getShipment(sid);
      if (!itemCache[key]) itemCache[key] = await getOrderItemByRef(oid, oiid);

      const ship = shipmentCache[sid];
      if (!ship) return;
      const item = itemCache[key];
      const merged = { ...prev, unit_product_weight: n(unit_product_weight, 0), unit_package_weight: n(unit_package_weight, 0) };
      const computed = computeAllocationFields(merged, ship, item);

      await updateDoc(d.ref, {
        ...computed,
        updated_at: serverTimestamp(),
      });
    }),
  );
}

async function getOrderItemByRef(order_id, order_item_id) {
  const oid = String(order_id || "").trim();
  const oi = String(order_item_id || "").trim();
  if (!oid || !oi) return null;
  const snap = await getDoc(doc(firestoreDb, "orders", oid, "items", oi));
  return snap.exists() ? snap.data() : null;
}

export async function listShipments() {
  const now = Date.now();
  if (shipmentsListCache && now - shipmentsListCacheTs < SHIP_CACHE_TTL_MS) return shipmentsListCache;
  if (shipmentsListInflight) return shipmentsListInflight;

  shipmentsListInflight = (async () => {
    const snap = await getDocs(query(collection(firestoreDb, "shipments"), orderBy("created_at", "desc")));
    const rows = snap.docs.map((d) => ({ shipment_id: d.id, ...d.data() }));
    shipmentsListCache = rows;
    shipmentsListCacheTs = Date.now();
    rows.forEach((r) => {
      const sid = String(r.shipment_id || "").trim();
      if (sid) shipmentByIdCache.set(sid, { ts: Date.now(), value: r });
    });
    return rows;
  })();
  try {
    return await shipmentsListInflight;
  } finally {
    shipmentsListInflight = null;
  }
}

export async function getShipment(shipment_id) {
  const id = String(shipment_id || "").trim();
  if (!id) return null;
  const now = Date.now();
  const hit = shipmentByIdCache.get(id);
  if (hit && now - hit.ts < SHIP_CACHE_TTL_MS) return hit.value;
  if (shipmentByIdInflight.has(id)) return shipmentByIdInflight.get(id);

  const p = (async () => {
    const snap = await getDoc(doc(firestoreDb, "shipments", id));
    const value = snap.exists() ? { shipment_id: snap.id, ...snap.data() } : null;
    shipmentByIdCache.set(id, { ts: Date.now(), value });
    return value;
  })();
  shipmentByIdInflight.set(id, p);
  try {
    return await p;
  } finally {
    shipmentByIdInflight.delete(id);
  }
}

export async function createShipment(payload = {}) {
  const id = shipmentId();
  const avg = n(payload.gbp_avg_rate, NaN);
  const p = n(payload.gbp_rate_product, NaN);
  const c = n(payload.gbp_rate_cargo, NaN);
  const autoAvg =
    Number.isFinite(avg) && avg > 0 ? avg : Number.isFinite(p) && Number.isFinite(c) && p > 0 && c > 0 ? (p + c) / 2 : Number.isFinite(p) && p > 0 ? p : Number.isFinite(c) && c > 0 ? c : 0;

  await setDoc(doc(firestoreDb, "shipments", id), {
    shipment_id: id,
    name: String(payload.name || "").trim(),
    gbp_avg_rate: round2(autoAvg),
    gbp_rate_product: Number.isFinite(p) ? round2(p) : 0,
    gbp_rate_cargo: Number.isFinite(c) ? round2(c) : 0,
    cargo_cost_per_kg: round2(n(payload.cargo_cost_per_kg)),
    status: String(payload.status || "draft"),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  clearShipmentsCache({ shipmentId: id });
  return getShipment(id);
}

export async function updateShipment(shipment_id, patch = {}) {
  const id = String(shipment_id || "").trim();
  if (!id) throw new Error("Missing shipment_id");
  const prev = await getShipment(id);
  if (!prev) throw new Error("Shipment not found");

  const next = {
    name: patch.name !== undefined ? String(patch.name || "").trim() : prev.name,
    gbp_rate_product: patch.gbp_rate_product !== undefined ? round2(n(patch.gbp_rate_product)) : n(prev.gbp_rate_product),
    gbp_rate_cargo: patch.gbp_rate_cargo !== undefined ? round2(n(patch.gbp_rate_cargo)) : n(prev.gbp_rate_cargo),
    cargo_cost_per_kg:
      patch.cargo_cost_per_kg !== undefined ? round2(n(patch.cargo_cost_per_kg)) : n(prev.cargo_cost_per_kg),
    status: patch.status !== undefined ? String(patch.status || "draft") : String(prev.status || "draft"),
  };
  const providedAvg = patch.gbp_avg_rate !== undefined ? n(patch.gbp_avg_rate, NaN) : n(prev.gbp_avg_rate, NaN);
  next.gbp_avg_rate =
    Number.isFinite(providedAvg) && providedAvg > 0
      ? round2(providedAvg)
      : round2(
          next.gbp_rate_product > 0 && next.gbp_rate_cargo > 0
            ? (next.gbp_rate_product + next.gbp_rate_cargo) / 2
            : next.gbp_rate_product > 0
              ? next.gbp_rate_product
              : next.gbp_rate_cargo,
        );

  await updateDoc(doc(firestoreDb, "shipments", id), {
    ...next,
    updated_at: serverTimestamp(),
  });
  clearShipmentsCache({ shipmentId: id });
  return getShipment(id);
}

export async function deleteShipment(shipment_id) {
  const id = String(shipment_id || "").trim();
  if (!id) return;
  const alloc = await getDocs(
    query(collection(firestoreDb, "shipment_allocations"), where("shipment_id", "==", id)),
  );
  await Promise.all(alloc.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(firestoreDb, "shipments", id));
  clearShipmentsCache({ shipmentId: id });
}

export async function listAllocationsForShipment(shipment_id) {
  const sid = String(shipment_id || "").trim();
  if (!sid) return [];
  const now = Date.now();
  const hit = allocByShipmentCache.get(sid);
  if (hit && now - hit.ts < SHIP_CACHE_TTL_MS) return hit.value;
  if (allocByShipmentInflight.has(sid)) return allocByShipmentInflight.get(sid);
  const p = (async () => {
    const snap = await getDocs(
      query(collection(firestoreDb, "shipment_allocations"), where("shipment_id", "==", sid)),
    );
    const rows = snap.docs.map((d) => ({ allocation_id: d.id, ...d.data() }));
    allocByShipmentCache.set(sid, { ts: Date.now(), value: rows });
    return rows;
  })();
  allocByShipmentInflight.set(sid, p);
  try {
    return await p;
  } finally {
    allocByShipmentInflight.delete(sid);
  }
}

export async function listAllocationsForOrder(order_id) {
  const oid = String(order_id || "").trim();
  if (!oid) return [];
  const now = Date.now();
  const hit = allocByOrderCache.get(oid);
  if (hit && now - hit.ts < SHIP_CACHE_TTL_MS) return hit.value;
  if (allocByOrderInflight.has(oid)) return allocByOrderInflight.get(oid);
  const p = (async () => {
    const snap = await getDocs(
      query(collection(firestoreDb, "shipment_allocations"), where("order_id", "==", oid)),
    );
    const rows = snap.docs.map((d) => ({ allocation_id: d.id, ...d.data() }));
    allocByOrderCache.set(oid, { ts: Date.now(), value: rows });
    return rows;
  })();
  allocByOrderInflight.set(oid, p);
  try {
    return await p;
  } finally {
    allocByOrderInflight.delete(oid);
  }
}

export async function createAllocation(payload = {}) {
  const sid = String(payload.shipment_id || "").trim();
  const oid = String(payload.order_id || "").trim();
  const oiid = String(payload.order_item_id || "").trim();
  if (!sid || !oiid) throw new Error("shipment_id and order_item_id are required");

  const ship = await getShipment(sid);
  if (!ship) throw new Error("Shipment not found");
  const item = await getOrderItemByRef(oid, oiid);
  const id = allocationId();

  const core = {
    allocation_id: id,
    shipment_id: sid,
    order_id: oid || String(item?.order_id || ""),
    order_item_id: oiid,
    product_id: String(payload.product_id || item?.product_id || ""),
    pricing_mode_id: String(payload.pricing_mode_id || ""),
    revenue_bdt: n(payload.revenue_bdt, 0),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  const computed = computeAllocationFields(payload, ship, item);
  await setDoc(doc(firestoreDb, "shipment_allocations", id), { ...core, ...computed });
  clearShipmentsCache({ shipmentId: sid, orderId: core.order_id });
  return { allocation_id: id, ...core, ...computed };
}

export async function createAllocationsBulk(payloads = []) {
  const rows = Array.isArray(payloads) ? payloads : [];
  if (!rows.length) return [];

  const shipmentCache = new Map();
  const itemCache = new Map();
  const nowTs = serverTimestamp();
  const out = [];
  const batch = writeBatch(firestoreDb);
  const affectedShipmentIds = new Set();
  const affectedOrderIds = new Set();

  for (const payload of rows) {
    const sid = String(payload?.shipment_id || "").trim();
    const oid = String(payload?.order_id || "").trim();
    const oiid = String(payload?.order_item_id || "").trim();
    if (!sid || !oiid) throw new Error("shipment_id and order_item_id are required");

    if (!shipmentCache.has(sid)) shipmentCache.set(sid, await getShipment(sid));
    const ship = shipmentCache.get(sid);
    if (!ship) throw new Error(`Shipment not found: ${sid}`);

    const itemKey = `${oid}__${oiid}`;
    if (!itemCache.has(itemKey)) itemCache.set(itemKey, await getOrderItemByRef(oid, oiid));
    const item = itemCache.get(itemKey);

    const id = allocationId();
    const core = {
      allocation_id: id,
      shipment_id: sid,
      order_id: oid || String(item?.order_id || ""),
      order_item_id: oiid,
      product_id: String(payload?.product_id || item?.product_id || ""),
      pricing_mode_id: String(payload?.pricing_mode_id || ""),
      revenue_bdt: n(payload?.revenue_bdt, 0),
      created_at: nowTs,
      updated_at: nowTs,
    };
    const computed = computeAllocationFields(payload, ship, item);
    batch.set(doc(firestoreDb, "shipment_allocations", id), { ...core, ...computed });
    out.push({ allocation_id: id, ...core, ...computed });
    affectedShipmentIds.add(sid);
    if (core.order_id) affectedOrderIds.add(core.order_id);
  }

  await batch.commit();
  affectedShipmentIds.forEach((shipmentId) => clearShipmentsCache({ shipmentId }));
  affectedOrderIds.forEach((orderId) => clearShipmentsCache({ orderId }));
  if (!affectedShipmentIds.size && !affectedOrderIds.size) clearShipmentsCache();
  return out;
}

export async function updateAllocation(allocation_id, patch = {}) {
  const id = String(allocation_id || "").trim();
  if (!id) throw new Error("Missing allocation_id");
  const snap = await getDoc(doc(firestoreDb, "shipment_allocations", id));
  if (!snap.exists()) throw new Error("Allocation not found");
  const prev = snap.data();
  const ship = await getShipment(prev.shipment_id);
  if (!ship) throw new Error("Shipment not found");
  const item = await getOrderItemByRef(prev.order_id, prev.order_item_id);

  const merged = { ...prev, ...patch };
  const computed = computeAllocationFields(merged, ship, item);
  await updateDoc(doc(firestoreDb, "shipment_allocations", id), {
    ...computed,
    ...("revenue_bdt" in patch ? { revenue_bdt: n(patch.revenue_bdt, 0) } : {}),
    updated_at: serverTimestamp(),
  });

  if ("unit_product_weight" in patch || "unit_package_weight" in patch) {
    await syncOrderItemWeights(prev.order_id, prev.order_item_id, computed.unit_product_weight, computed.unit_package_weight);
    await syncAllAllocationsForOrderItem(prev.order_item_id, computed.unit_product_weight, computed.unit_package_weight);
  }

  const next = await getDoc(doc(firestoreDb, "shipment_allocations", id));
  clearShipmentsCache({ shipmentId: prev.shipment_id, orderId: prev.order_id });
  return { allocation_id: id, ...next.data() };
}

export async function deleteAllocation(allocation_id) {
  const id = String(allocation_id || "").trim();
  if (!id) return;
  const snap = await getDoc(doc(firestoreDb, "shipment_allocations", id));
  const prev = snap.exists() ? snap.data() : null;
  await deleteDoc(doc(firestoreDb, "shipment_allocations", id));
  if (prev) {
    clearShipmentsCache({ shipmentId: prev.shipment_id, orderId: prev.order_id });
  } else {
    clearShipmentsCache();
  }
}

export async function deleteAllocationsBulk(rowsOrIds = []) {
  const rows = Array.isArray(rowsOrIds) ? rowsOrIds : [];
  if (!rows.length) return;
  const batch = writeBatch(firestoreDb);
  const affectedShipmentIds = new Set();
  const affectedOrderIds = new Set();

  for (const entry of rows) {
    const id =
      typeof entry === "string"
        ? String(entry || "").trim()
        : String(entry?.allocation_id || "").trim();
    if (!id) continue;
    batch.delete(doc(firestoreDb, "shipment_allocations", id));
    if (entry && typeof entry === "object") {
      const sid = String(entry.shipment_id || "").trim();
      const oid = String(entry.order_id || "").trim();
      if (sid) affectedShipmentIds.add(sid);
      if (oid) affectedOrderIds.add(oid);
    }
  }
  await batch.commit();
  affectedShipmentIds.forEach((shipmentId) => clearShipmentsCache({ shipmentId }));
  affectedOrderIds.forEach((orderId) => clearShipmentsCache({ orderId }));
  if (!affectedShipmentIds.size && !affectedOrderIds.size) clearShipmentsCache();
}

export async function suggestAllocationsForShipment(shipment_id, order_id) {
  const sid = String(shipment_id || "").trim();
  const oid = String(order_id || "").trim();
  if (!sid || !oid) return [];

  const orderItemsSnap = await getDocs(query(collection(firestoreDb, "orders", oid, "items"), orderBy("item_sl", "asc")));
  const allAllocSnap = await getDocs(
    query(collection(firestoreDb, "shipment_allocations"), where("order_id", "==", oid)),
  );

  const neededByItem = {};
  allAllocSnap.docs.forEach((d) => {
    const a = d.data();
    const key = String(a.order_item_id || "").trim();
    if (!key) return;
    neededByItem[key] = n(neededByItem[key]) + n(a.needed_qty, n(a.allocated_qty));
  });

  return orderItemsSnap.docs
    .map((d) => d.data())
    .map((it) => {
      const ordered = n(it.ordered_quantity);
      const needed = n(neededByItem[it.order_item_id]);
      const remain = Math.max(0, ordered - needed);
      if (remain <= 0) return null;
      return {
        shipment_id: sid,
        order_id: oid,
        order_item_id: String(it.order_item_id || ""),
        product_id: String(it.product_id || ""),
        needed_qty: remain,
        arrived_qty: 0,
        allocated_qty: remain,
        shipped_qty: 0,
      };
    })
    .filter(Boolean);
}

export async function recalcShipmentAllocations(shipment_id) {
  const sid = String(shipment_id || "").trim();
  if (!sid) return;
  const ship = await getShipment(sid);
  if (!ship) return;
  const snap = await getDocs(
    query(collection(firestoreDb, "shipment_allocations"), where("shipment_id", "==", sid)),
  );
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const prev = d.data();
      const item = await getOrderItemByRef(prev.order_id, prev.order_item_id);
      return { docRef: d.ref, prev, item };
    }),
  );
  const missingRows = rows
    .filter(({ prev, item }) => hasMissingWeight(prev, item))
    .map(({ prev, item }) => ({
      allocation_id: String(prev?.allocation_id || ""),
      order_item_id: String(prev?.order_item_id || ""),
      name: String(item?.name || item?.product_id || prev?.product_id || "item"),
    }));
  if (missingRows.length) {
    const names = missingRows.slice(0, 5).map((r) => r.name).join(", ");
    const more = missingRows.length > 5 ? ` +${missingRows.length - 5} more` : "";
    throw new Error(
      `Missing weight for ${missingRows.length} shipment row(s). Set product/package weight first: ${names}${more}`,
    );
  }

  await Promise.all(
    rows.map(async ({ docRef, prev, item }) => {
      const computed = computeAllocationFields(prev, ship, item);
      await updateDoc(docRef, {
        ...computed,
        updated_at: serverTimestamp(),
      });
    }),
  );
  clearShipmentsCache({ shipmentId: sid });
}

function snapshotDocId(shipment_id, product_id) {
  return `${String(shipment_id || "").trim()}__${encodeURIComponent(String(product_id || "").trim())}`;
}

export async function listShipmentProductSnapshots(shipment_id) {
  const sid = String(shipment_id || "").trim();
  if (!sid) return [];
  const now = Date.now();
  const hit = snapshotByShipmentCache.get(sid);
  if (hit && now - hit.ts < SHIP_CACHE_TTL_MS) return hit.value;
  if (snapshotByShipmentInflight.has(sid)) return snapshotByShipmentInflight.get(sid);
  const p = (async () => {
    const snap = await getDocs(
      query(collection(firestoreDb, "shipment_product_snapshots"), where("shipment_id", "==", sid)),
    );
    const rows = snap.docs.map((d) => ({ snapshot_id: d.id, ...d.data() }));
    snapshotByShipmentCache.set(sid, { ts: Date.now(), value: rows });
    return rows;
  })();
  snapshotByShipmentInflight.set(sid, p);
  try {
    return await p;
  } finally {
    snapshotByShipmentInflight.delete(sid);
  }
}

export async function upsertShipmentProductSnapshot(payload = {}) {
  const shipment_id = String(payload.shipment_id || "").trim();
  const product_id = String(payload.product_id || "").trim();
  if (!shipment_id || !product_id) throw new Error("shipment_id and product_id are required");

  const id = snapshotDocId(shipment_id, product_id);
  await setDoc(
    doc(firestoreDb, "shipment_product_snapshots", id),
    {
      snapshot_id: id,
      shipment_id,
      product_id,
      name: String(payload.name || "").trim(),
      needed_qty: n(payload.needed_qty, 0),
      ordered_qty: payload.ordered_qty === "" ? "" : n(payload.ordered_qty, 0),
      arrived_qty:
        payload.arrived_qty === ""
          ? ""
          : n(payload.arrived_qty, payload.received_qty === "" ? "" : n(payload.received_qty, 0)),
      received_qty: payload.received_qty === "" ? "" : n(payload.received_qty, 0),
      order_breakdown: Array.isArray(payload.order_breakdown) ? payload.order_breakdown : [],
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    },
    { merge: true },
  );
  const snap = await getDoc(doc(firestoreDb, "shipment_product_snapshots", id));
  clearShipmentsCache({ shipmentId: shipment_id });
  return snap.exists() ? { snapshot_id: id, ...snap.data() } : null;
}
