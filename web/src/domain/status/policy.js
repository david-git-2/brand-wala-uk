function norm(v) {
  return String(v || "").trim().toLowerCase();
}

export const APP_ROLES = ["admin", "ops", "sales", "customer", "investor"];

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

export const SHIPMENT_STATUSES = ["draft", "in_transit", "received", "closed", "cancelled"];

export const ORDER_TRANSITIONS = {
  draft: ["submitted", "cancelled"],
  submitted: ["priced", "cancelled"],
  priced: ["under_review", "finalized", "cancelled"],
  under_review: ["priced", "finalized", "cancelled"],
  finalized: ["processing", "under_review", "cancelled"],
  processing: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["processing", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const SHIPMENT_TRANSITIONS = {
  draft: ["in_transit"],
  in_transit: ["received"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

export function canTransitionOrderStatus(fromStatus, toStatus) {
  const from = norm(fromStatus);
  const to = norm(toStatus);
  if (!from || !to || from === to) return false;
  const allowed = ORDER_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function canTransitionShipmentStatus(fromStatus, toStatus) {
  const from = norm(fromStatus);
  const to = norm(toStatus);
  if (!from || !to || from === to) return false;
  const allowed = SHIPMENT_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function getShipmentCapabilities({ role, status }) {
  const r = norm(role);
  const s = norm(status || "draft");
  const isAdmin = r === "admin";
  const isOps = r === "ops";
  const isSales = r === "sales";
  const isInvestor = r === "investor";
  const locked = s === "closed" || s === "cancelled";
  const activeState = s === "draft" || s === "in_transit" || s === "received";
  const receivingState = s === "received";
  const canOpsWrite = !locked && activeState && (isAdmin || isOps);
  const canAdminWrite = !locked && isAdmin;

  return {
    isAdmin,
    isOps,
    isSales,
    isInvestor,
    status: s,
    isLocked: locked,
    canView: isAdmin || isOps || isSales || isInvestor,
    canEdit: canOpsWrite,
    canEditItems: canOpsWrite,
    canChangeStatus: canAdminWrite,
    canSoftClose: canAdminWrite,
    canHardDelete: false,

    // Field-level shipment header capabilities
    canEditShipmentName: canOpsWrite,
    canEditShipmentRates: canOpsWrite,
    canEditShipmentCargoCost: canOpsWrite,
    canEditShipmentDates: canOpsWrite,
    canEditShipmentNotes: canOpsWrite,

    // Field-level shipment-item capabilities
    canEditNeededQty: canOpsWrite,
    canEditArrivedQty: canOpsWrite && receivingState,
    canEditDamageBreakdown: canOpsWrite && receivingState,
    canEditDeliveredQty: canOpsWrite && receivingState,
    canEditWeights: canOpsWrite,
    canEditPurchaseSnapshots: canOpsWrite,
    canEditOrderRefs: canOpsWrite,
  };
}

export function getOrderCapabilities({ role, status }) {
  const r = norm(role);
  const s = norm(status || "submitted");
  const isAdmin = r === "admin";
  const isOps = r === "ops";
  const isSales = r === "sales";
  const isInvestor = r === "investor";
  const isCustomer = r === "customer";
  const adminLocked = s === "cancelled";
  const activeOpsState = !["cancelled"].includes(s);
  const customerVisible = ["priced", "under_review", "finalized", "processing", "partially_delivered", "delivered", "cancelled"].includes(s);
  const customerEditable = s === "priced" || s === "under_review";
  const adminCanPrice = isAdmin && ["submitted", "priced", "under_review", "finalized"].includes(s);
  const opsCanEditQty = isOps && ["submitted", "priced", "under_review", "finalized", "processing", "partially_delivered"].includes(s);
  const adminCanEditQty = isAdmin && !adminLocked;
  const adminCanOps = isAdmin && activeOpsState;

  return {
    isAdmin,
    isOps,
    isSales,
    isInvestor,
    isCustomer,
    status: s,
    canView: isAdmin || isOps || isSales || isInvestor || (isCustomer && customerVisible),
    canEditHeader: (isAdmin && !adminLocked) || (isOps && activeOpsState),
    canEditItems: (isAdmin && !adminLocked) || (isOps && activeOpsState) || (isCustomer && customerEditable),
    canChangeStatus: isAdmin,
    canEditNegotiation: isAdmin || (isCustomer && customerEditable),
    canEditOperational: (isAdmin && !adminLocked) || (isOps && activeOpsState),
    adminLocked,
    customerVisible,
    customerEditable,

    // Field-level order header capabilities
    canEditOrderName: (isAdmin && !adminLocked) || (isOps && activeOpsState),
    canEditOrderShipment: isAdmin && !adminLocked,
    canEditOrderStatus: isAdmin,

    // Field-level order-item capabilities
    canEditNeededQty: adminCanEditQty || opsCanEditQty,
    canEditDeliveredQty: false, // derived from allocation/customer delivery sync
    canEditPurchasePrice: isAdmin && !adminLocked,
    canEditProfitRate: adminCanPrice,
    canEditOfferPricePurchaseMode: adminCanPrice,
    canEditOfferPriceTotalMode: adminCanPrice,
    canEditOfferModeSelector: adminCanPrice,
    canEditOfferedPrice: adminCanPrice,
    canEditCustomerCounter: (isCustomer && customerEditable) || adminCanPrice,
    canEditFinalPrice: adminCanPrice,
    canSoftDeleteOrderItem: isAdmin && !adminLocked,
    canRestoreOrderItem: isAdmin && !adminLocked,
    canRemoveOrderItemFromShipment: isAdmin && activeOpsState,
    canRunRecompute: adminCanOps || isOps,
  };
}

function ORDER_ITEM_FIELD_GUARDS(cap) {
  return {
    needed_quantity: cap.canEditNeededQty,
    delivered_quantity: cap.canEditDeliveredQty,
    purchase_price_gbp: cap.canEditPurchasePrice,
    profit_rate: cap.canEditProfitRate,
    offer_price_bdt_on_purchase: cap.canEditOfferPricePurchaseMode,
    offer_price_bdt_on_total: cap.canEditOfferPriceTotalMode,
    offer_price_mode: cap.canEditOfferModeSelector,
    offered_price_bdt: cap.canEditOfferedPrice,
    customer_counter_offer_price_bdt: cap.canEditCustomerCounter,
    final_price_bdt: cap.canEditFinalPrice,
    is_deleted: cap.canSoftDeleteOrderItem,
    deleted_at: cap.canSoftDeleteOrderItem,
    deleted_by: cap.canSoftDeleteOrderItem,
    delete_reason: cap.canSoftDeleteOrderItem,
    name: cap.canEditNeededQty,
    brand: cap.canEditNeededQty,
    image_url: cap.canEditNeededQty,
  };
}

function SHIPMENT_ITEM_FIELD_GUARDS(cap) {
  return {
    needed_qty: cap.canEditNeededQty,
    arrived_qty: cap.canEditArrivedQty,
    damaged_qty: cap.canEditDamageBreakdown,
    expired_qty: cap.canEditDamageBreakdown,
    stolen_qty: cap.canEditDamageBreakdown,
    other_qty: cap.canEditDamageBreakdown,
    delivered_qty: cap.canEditDeliveredQty,
    unit_product_weight_g: cap.canEditWeights,
    unit_package_weight_g: cap.canEditWeights,
    unit_total_weight_g: cap.canEditWeights,
    received_weight_g: cap.canEditWeights,
    purchase_unit_gbp: cap.canEditPurchaseSnapshots,
    total_value_gbp: cap.canEditPurchaseSnapshots,
    product_code: cap.canEditOrderRefs,
    barcode: cap.canEditOrderRefs,
    item_name: cap.canEditOrderRefs,
    image_url: cap.canEditOrderRefs,
    order_refs: cap.canEditOrderRefs,
  };
}

export function assertShipmentCanEdit({ role, status }) {
  const cap = getShipmentCapabilities({ role, status });
  if (!cap.canEdit) throw new Error("Shipment is locked by status.");
}

export function assertShipmentCanEditItems({ role, status }) {
  const cap = getShipmentCapabilities({ role, status });
  if (!cap.canEditItems) throw new Error("Shipment items are locked by status.");
}

export function assertShipmentCanSoftClose({ role, status }) {
  const cap = getShipmentCapabilities({ role, status });
  if (!cap.canSoftClose) throw new Error("Shipment cannot be closed in current state.");
}

export function assertShipmentCanEditItemFields({ role, status, fields = [] }) {
  const cap = getShipmentCapabilities({ role, status });
  const guards = SHIPMENT_ITEM_FIELD_GUARDS(cap);
  const blocked = (fields || []).filter((f) => guards[f] === false);
  if (blocked.length) {
    throw new Error(`Shipment item fields are locked by status/role: ${blocked.join(", ")}`);
  }
}

export function assertOrderCanEditHeader({ role, status }) {
  const cap = getOrderCapabilities({ role, status });
  if (!cap.canEditHeader) throw new Error("Order header is locked by status/role.");
}

export function assertOrderCanEditItems({ role, status }) {
  const cap = getOrderCapabilities({ role, status });
  if (!cap.canEditItems) throw new Error("Order items are locked by status/role.");
}

export function assertOrderCanEditItemFields({ role, status, fields = [] }) {
  const cap = getOrderCapabilities({ role, status });
  const guards = ORDER_ITEM_FIELD_GUARDS(cap);
  const blocked = (fields || []).filter((f) => guards[f] === false);
  if (blocked.length) {
    throw new Error(`Order item fields are locked by status/role: ${blocked.join(", ")}`);
  }
}

export function assertOrderCanChangeStatus({ role }) {
  const cap = getOrderCapabilities({ role, status: "submitted" });
  if (!cap.canChangeStatus) throw new Error("Only admin can change order status.");
}
