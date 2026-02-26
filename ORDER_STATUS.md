# Order Status Reference

Canonical order state machine used by admin/customer workflows.

## Status list

- `draft`
- `submitted`
- `priced`
- `under_review`
- `finalized`
- `processing`
- `partially_delivered`
- `delivered`
- `cancelled`

## Meaning

- `draft`: temporary editable state before submit.
- `submitted`: order placed, waiting for admin pricing.
- `priced`: admin offer is ready for customer review.
- `under_review`: customer counter submitted, admin reviewing.
- `finalized`: final price and quantity locked.
- `processing`: shipment and receiving started.
- `partially_delivered`: some quantity received, some pending.
- `delivered`: all finalized quantity received, order closed.
- `cancelled`: order cancelled (admin path).

## Transition flow

1. `draft` -> `submitted`
2. `submitted` -> `priced`
3. `priced` -> `under_review` (customer counter)
4. `under_review` -> `priced` (admin re-offer) or `finalized`
5. `priced` -> `finalized` (admin finalize)
6. `finalized` -> `processing`
7. `processing` -> `partially_delivered` -> `delivered`
8. non-delivered states -> `cancelled` (admin)

## Permissions summary

- Customer:
  - Main edit window is `priced` (counter offer).
  - Read-only from `under_review` onward unless reopened by admin.
- Admin:
  - Manages status transitions and shipment lifecycle.
  - Can permanently delete only cancelled orders (typed confirmation).
- Ops:
  - Can edit operational quantity fields in active states (no status transition).

## Field-level enforcement

- Canonical rules live in `/Users/david/Desktop/projects/brand-wala-uk/web/src/domain/status/policy.js`.
- Services enforce those field guards before writes:
  - `/Users/david/Desktop/projects/brand-wala-uk/web/src/services/orders/orderService.js`
  - `/Users/david/Desktop/projects/brand-wala-uk/web/src/services/shipments/shipmentService.js`

## Data behavior

- Delivery status is quantity-driven:
  - if all finalized qty received -> `delivered`
  - if some received -> `partially_delivered`
- `delivered` is read-only for both roles.
