# Firestore Schema (Current Project)

This document reflects what the app currently reads/writes in Firebase Firestore.

## Top-level Collections

## `users/{emailLower}`

Document ID:
- Lowercased email (example: `davidubl007@gmail.com`)

Fields:
- `email: string`
- `name: string`
- `role: "admin" | "customer"`
- `active: 0 | 1`
- `can_see_price_gbp: 0 | 1`
- `can_use_cart: 0 | 1`
- `is_admin: boolean` (derived convenience field stored by frontend)
- `created_at: Timestamp`
- `updated_at: Timestamp`

Used for:
- Auth access checks (active/role/cart permission)
- Admin user management page
- Firebase custom claims sync (Cloud Function)

---

## `carts/{emailLower}`

Document ID:
- Lowercased user email

Notes:
- Parent cart doc may be mostly empty.
- Actual cart rows are stored in subcollection.

### `carts/{emailLower}/items/{productId}`

Fields:
- `product_id: string`
- `barcode: string`
- `name: string`
- `brand: string`
- `image_url: string`
- `price_gbp: number`
- `case_size: number`
- `country_of_origin: string`
- `quantity: number`
- `created_at: Timestamp`
- `updated_at: Timestamp`

Used for:
- Customer cart
- Create order from cart

---

## `orders/{orderId}`

Document ID pattern:
- `ORD_YYYYMMDDHHMMSS_random6`

Core fields:
- `order_id: string`
- `order_name: string`
- `creator_email: string` (lowercase)
- `creator_name: string`
- `creator_role: string`
- `status: "draft" | "submitted" | "priced" | "under_review" | "finalized" | "processing" | "partially_delivered" | "delivered" | "cancelled"`
- `created_at: Timestamp`
- `updated_at: Timestamp`

Header totals:
- `total_order_qty: number`
- `total_purchase_value_gbp: number`

Order-level pricing/meta:
- `calculated_selling_price: { ... }` (mode/profit_rate/customer_price_currency/updated_at)
- `customer_pricing_decision: { decision, currency, updated_at }`

### `orders/{orderId}/items/{orderItemId}`

Document ID pattern:
- `{orderId}-{item_sl}` (example: `ORD_...-1`)

Core item fields:
- `order_item_id: string`
- `order_id: string`
- `item_sl: number`
- `product_id: string`
- `barcode: string`
- `brand: string`
- `name: string`
- `image_url: string`
- `case_size: number`
- `ordered_quantity: number`
- `buy_price_gbp: number`
- `line_purchase_value_gbp: number`
- `created_at: Timestamp`
- `updated_at: Timestamp`

Pricing/negotiation fields (when used):
- `calculated_selling_price: { mode, profit_rate_pct, offered_product_unit_gbp, offered_product_unit_bdt, cargo_unit_gbp, cargo_unit_bdt, selling_unit_gbp, selling_unit_bdt, updated_at }`
- `pricing_snapshot: { initial_unit_gbp, initial_unit_bdt, initial_plus_cargo_unit_gbp, initial_plus_cargo_unit_bdt, calculated_offer_unit_gbp, calculated_offer_unit_bdt, offer_unit_gbp, offer_unit_bdt, customer_counter_unit_gbp, customer_counter_unit_bdt, final_unit_gbp, final_unit_bdt, updated_at }`
- `customer_offer: { decision, currency, unit_price, updated_at }`
- `customer_unit_gbp: number`
- `customer_unit_bdt: number`
- `customer_changed_quantity: number`
- `final_quantity: number`
- `final_unit_gbp: number`
- `final_unit_bdt: number`
- `final_line_gbp: number`
- `final_line_bdt: number`
- `final_note: string`

Weight fields mirrored from allocation (when edited):
- `unit_product_weight: number` (kg)
- `unit_package_weight: number` (kg)

---

## `shipments/{shipmentId}`

Document ID pattern:
- `SHP_YYYYMMDDHHMMSS_random6`

Fields:
- `shipment_id: string`
- `name: string`
- `gbp_avg_rate: number`
- `gbp_rate_product: number`
- `gbp_rate_cargo: number`
- `cargo_cost_per_kg: number` (GBP per kg)
- `status: string` (usually `draft`)
- `created_at: Timestamp`
- `updated_at: Timestamp`

---

## `shipment_allocations/{allocationId}`

Document ID pattern:
- `ALC_YYYYMMDDHHMMSS_random6`

Identity fields:
- `allocation_id: string`
- `shipment_id: string`
- `order_id: string`
- `order_item_id: string`
- `product_id: string`
- `pricing_mode_id: string`
- `created_at: Timestamp`
- `updated_at: Timestamp`

Quantity fields:
- `needed_qty: number` (alias also kept as `allocated_qty`)
- `arrived_qty: number` (alias also kept as `shipped_qty`)
- `allocated_qty: number`
- `shipped_qty: number`

Weight fields (kg):
- `unit_product_weight: number`
- `unit_package_weight: number`
- `unit_total_weight: number`
- `needed_weight: number`
- `arrived_weight: number`
- `allocated_weight: number`
- `shipped_weight: number`

Cost/revenue fields:
- `buy_price_gbp: number`
- `product_cost_gbp: number`
- `product_cost_bdt: number`
- `cargo_cost_gbp: number`
- `cargo_cost_bdt: number`
- `total_cost_bdt: number`
- `revenue_bdt: number`
- `profit_bdt: number`

---

## `shipment_product_snapshots/{shipmentId__encodedProductId}`

Purpose:
- Editable shipment-level aggregate row per product (for needed/ordered/arrived tracking and order breakdown)

Fields:
- `snapshot_id: string`
- `shipment_id: string`
- `product_id: string`
- `name: string`
- `needed_qty: number`
- `ordered_qty: number | ""`
- `arrived_qty: number | ""`
- `received_qty: number | ""`
- `order_breakdown: array`
- `created_at: Timestamp`
- `updated_at: Timestamp`

---

## Not in Firestore (Important)

- Product catalog is currently loaded from static JSON (`pc_data.json`) in frontend.
- Pricing mode CRUD page still references legacy API routes; it is not stored in Firestore in the active Firebase path.

---

## Security Rule Access (Summary)

From `firestore.rules`:
- `users`: admin full CRUD, user can read own profile.
- `carts` + `carts/*/items`: only active users with `can_use_cart=1` (or admin).
- `orders` + `orders/*/items`: admin full access; customer limited to own order docs.
- `shipments`, `shipment_allocations`, `shipment_product_snapshots`: admin only.

---

## Cloud Functions Dependency

`functions/src/index.ts` reads:
- `users/{emailLower}`

And writes custom auth claims:
- `role`
- `active`
- `can_see_price_gbp`
- `can_use_cart`
