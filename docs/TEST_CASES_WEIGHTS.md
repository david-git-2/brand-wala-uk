# Weight Module Test Cases (V2)

## Scope

- Master defaults in `product_weights`
- Shipment-level weight entry/edit
- Recompute guard when weight is missing
- Admin-only writes
- Audit trail in `product_weight_logs`
- Unit handling:
  - input UI in grams (`g`)
  - shipment cargo math in kilograms (`kg`)

---

## Preconditions

1. At least one admin user exists and can access shipment pages.
2. At least one non-admin user exists (`ops` or `sales`).
3. At least one shipment exists with at least 2 products.
4. At least one product has no weight default yet.

---

## A) Master Weight CRUD

### W-M-01 Create default weight
- Steps:
  1. Create a new `product_weights` row for a product.
  2. Set `unit_product_weight_g`, `unit_package_weight_g`.
- Expected:
  - Doc is created.
  - `unit_total_weight_g = product + package`.
  - Values are non-negative integers.

### W-M-02 Update default weight
- Steps:
  1. Change product/package grams for an existing key.
- Expected:
  - Doc updates successfully.
  - `updated_at` changes.
  - New values are used for future row prefill flows.

### W-M-03 Delete default weight
- Steps:
  1. Delete one weight profile.
- Expected:
  - Doc removed from `product_weights`.
  - No crash in shipment pages that reference same product.

---

## B) Permission and Rules

### W-R-01 Admin write allowed
- Steps:
  1. As admin, create/update/delete default weight.
- Expected:
  - All operations allowed.

### W-R-02 Non-admin write denied
- Steps:
  1. As non-admin, attempt create/update/delete on `product_weights`.
- Expected:
  - Firestore permission denied.

### W-R-03 Non-admin read behavior
- Steps:
  1. As non-admin, read weight defaults used by shipment/order views.
- Expected:
  - Read follows current backoffice rule policy.

---

## C) Shipment Weight Input and Conversion

### W-S-01 Gram input persistence
- Steps:
  1. In shipment weight UI, enter `100` and `25` in grams.
  2. Save.
- Expected:
  - Stored shipment allocation values represent `0.1` and `0.025` kg where applicable.
  - Reload shows gram values correctly.

### W-S-02 Bulk paste applies row-by-row
- Steps:
  1. Paste product/package columns for multiple rows.
  2. Save all.
- Expected:
  - Each row receives its own value.
  - No “last row overwrote all rows” regression.

### W-S-03 Optional default update path
- Steps:
  1. Edit weight from shipment context.
  2. Use “also update default” flow (when enabled).
- Expected:
  - Shipment row updates.
  - Master default updates only when explicitly requested.

---

## D) Missing-Weight Guard

### W-G-01 Block recompute on missing product weight
- Steps:
  1. Set a shipment row with `unit_product_weight <= 0`.
  2. Run recompute.
- Expected:
  - Recompute fails with explicit missing-weight message.
  - No partial broken totals persisted.

### W-G-02 Package weight zero is valid
- Steps:
  1. Set `unit_product_weight > 0` and `unit_package_weight = 0`.
  2. Run recompute.
- Expected:
  - Recompute succeeds.

### W-G-03 Negative package weight invalid
- Steps:
  1. Set `unit_package_weight < 0`.
  2. Run recompute.
- Expected:
  - Recompute blocked with missing/invalid weight message.

---

## E) Sync and Recompute

### W-C-01 Recompute updates monetary fields
- Steps:
  1. Change shipment weight for a row.
  2. Run recompute.
- Expected:
  - Cargo-related fields update.
  - Shipment totals update.

### W-C-02 Order-linked cache consistency
- Steps:
  1. Update weight from shipment flow.
  2. Open related order pricing/review screen.
- Expected:
  - Dependent views use updated shipment-linked values.

---

## F) Audit Trail

### W-L-01 Log on create
- Steps:
  1. Create a default weight.
- Expected:
  - One `product_weight_logs` entry with `action=create`.

### W-L-02 Log on update
- Steps:
  1. Update an existing default weight.
- Expected:
  - One log with `action=update`.
  - `before` and `after` snapshots present.

### W-L-03 Log on delete
- Steps:
  1. Delete a default weight.
- Expected:
  - One log with `action=delete`.
  - `before` snapshot present.

### W-L-04 Actor/source captured
- Steps:
  1. Perform an update through UI/service.
- Expected:
  - `actor_email` and `source` are populated when supplied.

---

## G) Regression Checklist

1. Non-admin cannot mutate `product_weights`.
2. Missing product weight blocks recompute every time.
3. Package weight `0` remains valid.
4. Shipment UI still saves in grams while backend computes with kg conversion.
5. Create/update/delete all produce audit logs.
