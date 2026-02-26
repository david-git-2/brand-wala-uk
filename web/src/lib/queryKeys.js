export const queryKeys = {
  users: {
    all: ["users"],
    list: (filters = {}) => ["users", "list", filters],
    detail: (email) => ["users", "detail", String(email || "").toLowerCase()],
  },
  orders: {
    all: ["orders"],
    list: (role, email, filters = {}) => [
      "orders",
      "list",
      String(role || "").toLowerCase(),
      String(email || "").toLowerCase(),
      filters,
    ],
    detail: (orderId) => ["orders", "detail", String(orderId || "")],
    items: (orderId) => ["orders", "items", String(orderId || "")],
  },
  shipments: {
    all: ["shipments"],
    list: () => ["shipments", "list"],
    detail: (shipmentId) => ["shipments", "detail", String(shipmentId || "")],
    allocations: (shipmentId) => ["shipments", "allocations", String(shipmentId || "")],
    aggregate: (shipmentId) => ["shipments", "aggregate", String(shipmentId || "")],
    sources: (shipmentId) => ["shipments", "sources", String(shipmentId || "")],
  },
  accounting: {
    byShipment: (shipmentId) => ["accounting", "shipment", String(shipmentId || "")],
    payments: (shipmentId) => ["accounting", "payments", String(shipmentId || "")],
  },
  investors: {
    all: ["investors"],
    list: () => ["investors", "list"],
    detail: (investorId) => ["investors", "detail", String(investorId || "")],
    transactionsByInvestor: (investorId) => ["investors", "transactions", String(investorId || "")],
    transactionsByPeriod: (periodKey) => ["investors", "transactions", "period", String(periodKey || "")],
  },
};

