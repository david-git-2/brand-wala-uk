# V2 Migration Plan (brandwala-v2)

## Goal

Move from mixed legacy/Firebase code to schema-first v2 architecture on a separate Firebase project.

## Phase 1: Environment isolation

1. Create `brandwala-v2` project.
2. Add Firebase alias `v2`.
3. Deploy rules/indexes/functions to `v2`.
4. Point v2 frontend config to `brandwala-v2`.

## Phase 2: Schema-first foundation

Finalize schema files under:
- `web/src/domain/users/schema.json`
- `web/src/domain/orders/schema.json`
- `web/src/domain/orderItems/schema.json`
- `web/src/domain/shipments/schema.json`
- `web/src/domain/shipmentItems/schema.json`
- `web/src/domain/shipmentAccounting/schema.json`
- `web/src/domain/investors/schema.json`
- `web/src/domain/investorTransactions/schema.json`
- `web/src/domain/productWeights/schema.json`
- `web/src/domain/carts/schema.json`

## Phase 3: Source-of-truth enforcement

Define computed/read-only behavior:
- Shipment totals derived from `shipment_items`.
- Shipment accounting totals derived from payment ledger.
- Delivered quantities derived via order/shipment reference logic.

Implement recompute service functions before enabling production writes.

## Phase 4: Repository/service migration

1. Move page-level Firebase calls to service layer.
2. Services call repo adapters only.
3. Domain calculations remain pure JS in `domain/*/calc.js`.

## Phase 5: UI migration

Migrate route-by-route:
1. users/admin auth
2. products/cart/order creation
3. shipments + shipment items
4. accounting + investor ledger

## Phase 6: Data migration (if needed)

If importing from old project:
- export old docs
- transform to new schema
- import to `brandwala-v2`

Do dry run in v2 first.

## Phase 7: Cutover

1. Freeze writes in old environment.
2. Final sync.
3. Switch frontend config to v2 production build.
4. Monitor auth/rules/reads/writes.

## Legacy cleanup status in repo

Removed legacy Apps Script compatibility artifacts:
- `web/src/api/ukApi.js`
- `web/src/pages/admin/AdminPricingModes.jsx`
- `web/src/pages/admin/AdminReviewOrderDetails.jsx`
- `web/src/pages/admin/AdminOrderWeights.jsx`
