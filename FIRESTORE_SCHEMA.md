# Firestore Schema (V2 Target)

This file is the current **target schema direction** after refactor decisions.
Source-of-truth model:

- Commercial truth: `orders`, `order_items`
- Operational aggregate input: `shipments`, `shipment_product_agg`
- Per-order shipment split/audit: `shipment_allocations`
- Weights master: `product_weights`
- Finance: `shipment_accounting`, `investors`, `investor_transactions`

## Collections

## `users/{emailLower}`

Fields:
- `email`, `name`, `role`, `active`, `can_see_price_gbp`, `can_use_cart`, `created_at`, `updated_at`

Subcollections:
- `config/preferences`
- `price_memory/{eventId}`

## `carts/{emailLower}/items/{product_id}`

Fields:
- `product_id`, `product_code`, `barcode`, `name`, `brand`, `image_url`
- `case_size`, `qty_step`, `quantity`
- `unit_price_gbp`, `line_total_gbp`
- `created_at`, `updated_at`

## `orders/{order_id}`

Fields:
- identity/user: `order_id`, `order_sl`, `order_name`, `creator_email`, `creator_name`, `creator_role`
- workflow: `status`
- totals cache: `total_needed_qty`, `total_delivered_qty`, `total_purchase_gbp`, `total_final_bdt`
- timestamps

## `order_items/{order_item_id}`

Fields:
- identity: `order_item_id`, `order_id`, `item_sl`, `product_id`, `product_code`, `barcode`, `name`, `brand`, `image_url`, `case_size`
- quantities: `needed_quantity`, `delivered_quantity` (derived)
- pricing: `purchase_price_gbp`, `offer_price_bdt_on_purchase`, `offer_price_bdt_on_total`, `offer_price_mode`, `offered_price_bdt`, `customer_counter_offer_price_bdt`, `final_price_bdt`, `profit_rate`
- helper only: `primary_shipment_id` (optional, not source-of-truth)
- timestamps

## `shipments/{shipment_id}`

Fields:
- identity: `shipment_id`, `name`
- workflow: `status` (`draft|in_transit|received|closed|cancelled`)
- rates/cargo: `cargo_cost_per_kg_gbp`, `gbp_rate_product_bdt`, `gbp_rate_cargo_bdt`, `gbp_rate_avg_bdt`
- dates: `order_date`, `arrived_date`
- totals cache: `total_value_gbp`, `total_weight_g`, `received_weight_g`
- timestamps

## `shipment_product_agg/{shipment_id__product_id}`

Purpose:
- one operational row per product per shipment (admin enters arrived/damage once)

Fields:
- identity: `shipment_id`, `product_id`, `product_code`, `barcode`, `name`, `image_url`
- aggregate quantities: `needed_qty_total`, `arrived_qty_total`, `damaged_qty_total`, `expired_qty_total`, `stolen_qty_total`, `other_qty_total`
- computed: `delivered_qty_total`, `available_qty_total`
- weights: `unit_product_weight_g`, `unit_package_weight_g`, `unit_total_weight_g`, `planned_weight_g_total`, `arrived_weight_g_total`, `received_weight_g_total`
- pricing snapshot: `purchase_unit_gbp_snapshot`
- linkage view: `order_refs[]`
- timestamps

## `shipment_allocations/{allocation_id}`

Purpose:
- per-order-item split rows for execution + audit

Fields:
- identity: `allocation_id`, `shipment_id`, `product_id`, `order_id`, `order_item_id`
- split quantities: `planned_qty`, `arrived_qty_share`, `damaged_qty_share`, `expired_qty_share`, `stolen_qty_share`, `other_qty_share`
- delivery: `customer_delivered_qty`
- weight snapshot: `unit_product_weight_g`, `unit_package_weight_g`, `unit_total_weight_g`
- purchase snapshot: `purchase_unit_gbp_snapshot`, `line_purchase_gbp`
- timestamps

## `product_weights/{weight_key}`

Fields:
- `weight_key`, `product_id`, `product_code`, `barcode`, `name`
- `unit_product_weight_g`, `unit_package_weight_g`, `unit_total_weight_g`
- `source`, timestamps

Notes:
- writes are admin-only (master default control)

## `product_weight_logs/{log_id}`

Purpose:
- audit trail for default weight create/update/delete

Fields:
- `log_id`, `action`, `weight_key`, `actor_email`, `source`, `before`, `after`, `created_at`

Notes:
- admin read/write only
- retention target: 12 months (cleanup job/policy)

## `shipment_accounting/{shipment_id}`

Fields:
- cost/revenue/profit summary + `status`
- timestamps

Subcollection:
- `customer_payments/{payment_id}`

## `investors/{investor_id}`

Fields:
- investor master profile and balances

## `investor_transactions/{txn_id}`

Fields:
- ledger rows with period keys and optional shipment links

## `status_overrides/{override_id}`

Purpose:
- forced status transition audit log

Fields:
- `entity_type`, `entity_id`, `from_status`, `to_status`, `reason`, `actor_email`, `actor_role`, `created_at`
