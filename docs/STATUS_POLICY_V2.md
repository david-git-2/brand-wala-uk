# Status Policy V2 (Editable Notes)

This file is the **human-editable policy reference** for role/status behavior.
If policy changes, update this file first, then update:

1. `web/src/domain/status/policy.js`
2. service guards (`orders`, `shipments`)
3. Firestore rules

---

## Roles

- `admin`
- `ops`
- `sales`
- `customer`
- `investor`

---

## Shipment Policy

### Statuses

- `draft`
- `in_transit`
- `received`
- `closed`
- `cancelled`

### Normal transitions

- `draft -> in_transit`
- `in_transit -> received`
- `received -> closed`

### Soft delete

- Soft delete target: `cancelled` (admin action)

### Lock rules

- `closed`: locked
- `cancelled`: locked

### Role capabilities

- `admin`: read, edit, status change, soft delete
- `ops`: read, edit in active states (`draft`, `in_transit`, `received`)
- `sales`: read-only
- `investor`: read-only
- `customer`: no shipment access

---

## Order Policy

### Statuses

- `draft`
- `submitted`
- `priced`
- `under_review`
- `finalized`
- `processing`
- `partially_delivered`
- `delivered`
- `cancelled`

### Normal transitions

- `draft -> submitted -> priced -> under_review/finalized -> processing -> partially_delivered/delivered`
- cancellation allowed from active flow states per transition map

### Customer visibility

- Customer can see own orders only from:
  - `priced`
  - `under_review`
  - `finalized`
  - `processing`
  - `partially_delivered`
  - `delivered`
  - `cancelled`
- Customer should not see `submitted` stage.

### Customer edit window

- Customer can edit negotiation fields only in:
  - `priced`
  - `under_review`

### Admin / Ops behavior

- `admin`: full control + status change
- `ops`: operational field edits in active states (no status change)
- `sales`: read-only
- `investor`: read-only

### Terminal behavior

- `cancelled`: locked
- `delivered`: currently admin-flex allowed (temporary decision)

---

## Override Policy (Admin)

- Normal transitions are strict.
- Admin override allowed with:
  - `force=true`
  - mandatory `reason`
- All overrides must be logged to:
  - `status_overrides` collection

Override log fields:

- `entity_type` (`order` / `shipment`)
- `entity_id`
- `from_status`
- `to_status`
- `reason`
- `actor_email`
- `actor_role`
- `created_at`

---

## Change Checklist

When you change policy later, run this checklist:

1. Update this file (`docs/STATUS_POLICY_V2.md`)
2. Update `web/src/domain/status/policy.js`
3. Update affected services:
   - `web/src/services/orders/orderService.js`
   - `web/src/services/shipments/shipmentService.js`
4. Update Firestore rules (`firestore.rules`)
5. Rebuild and test:
   - `npm --prefix web run build`
   - run relevant cases from `docs/TEST_CASES_V2.md`
