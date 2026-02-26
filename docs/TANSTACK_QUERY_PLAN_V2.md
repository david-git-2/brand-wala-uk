# TanStack Query Adoption Plan (V2)

## Goal

Reduce Firebase read quota usage and simplify server-state management by migrating data-fetching flows to TanStack Query.

---

## Global Defaults (Baseline)

Use these as initial QueryClient defaults:

- `staleTime: 10 * 60_000`
- `gcTime: 30 * 60_000`
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: false`
- `refetchOnMount: false`
- `retry: 0`
- `networkMode: "online"`

---

## Per-Query Override Rules

1. Master/reference data (rarely changes):
- users
- pricing modes
- procurement sources
- `staleTime: 30 min`

2. Fast-changing operational screens:
- order details
- shipment details
- `staleTime: 2 min`

3. Auth/profile:
- `staleTime: 5 min`

---

## Mutation Policy

1. Default mutation strategy:
- no optimistic updates (Firestore consistency first)

2. On mutation success:
- use targeted `invalidateQueries` only
- invalidate only directly affected keys

3. Avoid:
- broad invalidation (example: invalidating all orders after single row edit)

---

## Implementation Steps

### Step 1: Foundation

1. Install TanStack Query.
2. Add `QueryClient` + `QueryClientProvider` in app providers.
3. Add query key factory module (`queryKeys`).
4. Add optional Devtools in development mode only.

### Step 2: Migrate High-Read Admin List

1. Migrate `AdminOrders` reads to `useQuery`.
2. Add keys:
- `["orders","list",role,email,filters]`
3. Convert write actions to `useMutation`.
4. Invalidate only impacted list/detail keys.

### Step 3: Migrate Admin Order Details

1. Query keys:
- `["orders","detail",orderId]`
- `["orderItems","byOrder",orderId]`
- `["allocations","byOrder",orderId]`
2. Mutations invalidate only these keys.

### Step 4: Migrate Shipments

1. `AdminShipments`:
- `["shipments","list"]`
2. `AdminShipmentDetails`:
- `["shipments","detail",shipmentId]`
- `["allocations","byShipment",shipmentId]`
- `["shipmentAgg","byShipment",shipmentId]`
3. Targeted invalidation per shipment.

### Step 5: Migrate Customer Orders

1. `CustomerOrders`:
- `["customerOrders",email]`
2. `CustomerOrderDetails`:
- `["customerOrderDetail",email,orderId]`
3. Keep role/email-scoped keys to avoid cache bleed.

### Step 6: Remove Legacy Fetch State Duplication

1. Remove duplicate loading/error state where query handles it.
2. Keep Zustand for UI-only state:
- dialogs
- tab selection
- drafts/forms

### Step 7: Tune for Quota

1. Review Network tab for duplicate reads.
2. Increase stale times for stable queries.
3. Disable queries when tabs/sections are hidden.

### Step 8: Regression Checklist

1. No refetch storm on window focus.
2. No repeated reads when revisiting same page quickly.
3. Single-row mutation updates only related views.
4. Offline/reconnect behavior is predictable.

---

## Done Criteria

1. Core read-heavy pages migrated (`AdminOrders`, `AdminOrderDetails`, shipments pages).
2. Read count measurably reduced in browser network logs.
3. No functional regression in create/update/delete flows.
