# Implementation Plan V2 (Independent -> Dependent)

This plan is ordered so independent modules are finished first, then dependent workflows are layered on top.

## Phase 0: Baseline

1. Freeze schema files as source of truth.
2. Add/maintain reference docs:
   - `ORDER_STATUS.md`
   - `CALC_RULES.md` (if not present, create when calc work starts)
   - `STATUS_POLICY_V2.md` (policy matrix + override rules)
3. Define done criteria per module:
   - API/service done
   - UI wired
   - Firestore rules/indexes updated
   - basic test coverage
4. Centralize status policy (must be shared by UI + services):
   - One domain module exports status capabilities:
     - `canEditShipment`, `canChangeShipmentStatus`, `canSoftCloseShipment`
     - `canEditOrder`, `canChangeOrderStatus`, etc.
   - UI reads capabilities from this module (no hardcoded per-page conditions).
   - Services enforce the same policy before writes.
   - Firestore rules remain the final safety guard.

---

## Phase 1: Independent Modules

### 1) Users (Independent) done

1. Finalize `userRepo` + `userService`.
2. Keep admin user CRUD page fully service-driven (no direct Firestore in page).
3. Enforce role/active/cart flags in route and action guards.
4. Finalize Firestore rules for users.
5. Verify rules/index deploy commands.
6. Validate:
   - active/inactive behavior
   - admin vs customer access
   - `can_use_cart` toggle

### 2) Cart (Independent) done

1. Finalize `cartRepo` + `cartService`.
2. Product and cart pages use service only.
3. Enforce `can_use_cart` in service and UI.
4. Finalize cart rules:
   - `carts/{email}`
   - `carts/{email}/items/{product_id}`
5. Validate:
   - add/update/remove/clear
   - blocked writes when inactive/cart disabled

### 3) Shipments Core (Independent Header + Items) done

1. Finalize:
   - `shipmentRepo`
   - `shipmentItemRepo` (`shipment_product_agg` read model)
   - `shipmentAllocationRepo` (per-order split/audit source)
   - `shipmentService`
2. Complete shipment header CRUD UI.
3. Complete shipment aggregate product CRUD UI (`needed/arrived/damaged/expired/stolen/other`).
4. Keep per-order shipment split in `shipment_allocations` and sync to order item delivery caches.
5. Pull default weights from `product_weights` for new shipment aggregate rows.
6. Finalize rules/indexes for shipment queries.
7. Validate:
   - create/edit/delete shipment
   - add/edit shipment aggregate rows
   - default weight behavior
   - aggregate/split sync behavior

---

## Phase 2: Semi-Independent Financial Modules

### 4) Product Weights (Independent Utility) done

1. Finalize `productWeightRepo` + `productWeightService`.
2. Build/manage weight master UI (bulk paste/edit).
3. Add optional action: update weight master from shipment-item edits.
4. Validate key resolution (`weight_key`, `product_id`, `barcode`).

### 5) Shipment Accounting + Investors done

1. Finalize:
   - `shipmentAccountingRepo` (+ payment methods)
   - `investorRepo`
   - `investorTransactionRepo`
2. Build minimum finance UIs:
   - shipment accounting summary
   - customer payment ledger
   - investor ledger
3. Finalize rules/indexes for finance reads/writes.
4. Validate ledger write/read integrity.

---

## Phase 3: Dependent Modules

### 6) Orders + Order Items

1. Finalize:
   - `orderRepo`
   - `orderItemRepo`
   - `orderService`
2. Wire order list/details UI via services only.
3. Wire cart -> order creation flow.
4. Keep initial lifecycle simple (`submitted`) until workflow service is ready.

### 7) Calculation Engine (Pure Domain Layer)

1. Implement pure calc module (no Firestore I/O):
   - purchase/cargo/unit totals
   - GBP/BDT conversion
   - profit modes
   - rounding policy
2. Add focused unit tests for formulas and rounding.

### 8) Workflow / State Machine

1. Implement `OrderWorkflowService`:
   - status transition validation
   - role/status guard enforcement
   - side effects (lock edits/unlock flows)
2. Use this service from admin/customer order actions.
3. Ensure status policy module is consumed by both:
   - UI capability rendering
   - service-level write authorization checks

### 9) Shipment <-> Order Integration

1. Link `shipment_items.order_refs` with `order_items`.
2. Recompute and persist caches:
   - `order_items.delivered_quantity` (derived/cache)
   - order totals/status rollups
3. Provide deterministic recompute action/job for recovery.

---

## Phase 4: Hardening

### 10) Performance + Quota

1. Adopt query caching layer (TanStack Query) over services.
2. Remove redundant listeners/polls.
3. Batch writes where applicable.
4. Add consistent loading/error boundaries.

### 11) Security

1. Final pass on Firestore rules by module.
2. Block inactive users from all write paths.
3. Optional: force logout strategy via session/version check.

### 12) Release Checklist

1. Deploy rules/indexes/functions.
2. Build and smoke test.
3. Run migration scripts (if needed).
4. Keep rollback notes.

---

## Execution Order (Strict)

1. Users
2. Cart
3. Shipments (header/items)
4. Product Weights
5. Shipment Accounting + Investors
6. Orders/Order Items
7. Calculation Engine
8. Workflow/Status
9. Shipment-Order integration + recompute
10. Performance and security hardening

---

## Notes for Collaboration

- Keep pages/components thin: `pages -> services -> repos -> firebase`.
- Avoid direct Firestore access in UI components.
- Any schema change must update:
  - domain schema JSON
  - repo normalization
  - service validation
  - rules/indexes (if query pattern changes)
