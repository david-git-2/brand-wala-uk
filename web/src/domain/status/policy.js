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
  return {
    isAdmin,
    isOps,
    isSales,
    isInvestor,
    status: s,
    isLocked: locked,
    canView: isAdmin || isOps || isSales || isInvestor,
    canEdit: !locked && activeState && (isAdmin || isOps),
    canEditItems: !locked && activeState && (isAdmin || isOps),
    canChangeStatus: isAdmin && !locked,
    canSoftClose: isAdmin && !locked,
    canHardDelete: false,
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

export function assertOrderCanEditHeader({ role, status }) {
  const cap = getOrderCapabilities({ role, status });
  if (!cap.canEditHeader) throw new Error("Order header is locked by status/role.");
}

export function assertOrderCanEditItems({ role, status }) {
  const cap = getOrderCapabilities({ role, status });
  if (!cap.canEditItems) throw new Error("Order items are locked by status/role.");
}

export function assertOrderCanChangeStatus({ role }) {
  const cap = getOrderCapabilities({ role, status: "submitted" });
  if (!cap.canChangeStatus) throw new Error("Only admin can change order status.");
}
