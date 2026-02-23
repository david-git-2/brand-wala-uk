# Brand Wala UK Backend System

This document explains what the Apps Script backend does and how calculations are performed.

## 1) Backend Overview

- Runtime: Google Apps Script (`V8`)
- Data store: Google Sheets
- Entry point: `doPost` in `/Users/david/Desktop/projects/brand-wala-uk/apps-script/UK_Main.js`
- API style: `POST` with `{ action, ...payload }`

Main domains:
- Auth/users
- Cart
- Orders + order items
- Shipments
- Shipment allocations (core link between orders and shipments)
- Pricing modes
- Recompute/rollups

## 2) Core Sheets

Configured in `/Users/david/Desktop/projects/brand-wala-uk/apps-script/UK_Setup.js`.

- `uk_orders`: order header and totals
- `uk_order_items`: per-item demand/pricing fields
- `uk_shipments`: shipment rates + cargo cost
- `uk_shipment_allocation`: allocation rows per shipment/item
- `uk_pricing_modes`: pricing mode configuration
- `users`, `uk_cart_items`

## 3) Source of Truth

- Shipment and cost math source: `uk_shipment_allocation`
- Order totals source: rollup from allocation rows
- Price mode/profit source per item: `uk_order_items`
- Order status source: `uk_orders.status`

## 4) High-Level Flow

Typical working flow:
1. Create order (`uk_create_order`) -> order + items created
2. Create shipment (`uk_shipment_create`) with rates/cargo
3. Assign shipment to order (creates allocation rows)
4. Enter allocation weights (`unit_product_weight`, `unit_package_weight`)
5. Set item `pricing_mode_id` + `profit_rate`
6. Recompute order (`uk_recompute_order`)
7. Customer sees offered/final price by status

## 5) Price Fields Meaning

All are **unit prices**:
- `offered_unit_gbp`, `offered_unit_bdt`
- `customer_unit_gbp`, `customer_unit_bdt`
- `final_unit_gbp`, `final_unit_bdt`

Rounding:
- GBP: 2 decimals
- BDT: 0 decimals

## 6) Calculation Engine

Primary engine:
- `/Users/david/Desktop/projects/brand-wala-uk/apps-script/UK_Recompute.js`
- Function: `UK_computeAllocationAmounts_(ctx)`

### 6.1 Quantity Basis (current behavior)

For money/cost/revenue math:
- if `shipped_qty > 0` -> use `shipped_qty`
- else -> use `allocated_qty` (provisional planning mode)

This is why values can appear before delivery starts.

### 6.2 Weight Basis

- `unit_total_weight = unit_product_weight + unit_package_weight`
- `allocated_weight = unit_total_weight * allocated_qty`
- `shipped_weight = unit_total_weight * shipped_qty`

For money when shipped is zero:
- cargo cost uses `weight_for_amounts = unit_total_weight * qty_for_amounts`

### 6.3 Product Cost

- `product_cost_gbp = ROUND(qty_for_amounts * buy_price_gbp, 2)`

BDT conversion:
- if mode conversion is `SEPARATE_RATES`:
  - `product_cost_bdt = ROUND(product_cost_gbp * gbp_rate_product, 0)`
- else:
  - `product_cost_bdt = ROUND(product_cost_gbp * effective_avg_rate, 0)`

### 6.4 Cargo Cost

- `cargo_cost_gbp = ROUND(weight_for_amounts * cargo_cost_per_kg, 2)`

BDT conversion:
- if `SEPARATE_RATES`:
  - `cargo_cost_bdt = ROUND(cargo_cost_gbp * gbp_rate_cargo, 0)`
- else:
  - `cargo_cost_bdt = ROUND(cargo_cost_gbp * effective_avg_rate, 0)`

### 6.5 Revenue / Offered Logic

#### GBP pricing mode
- `sell_unit_gbp`:
  - final unit if present, else `buy_price_gbp * (1 + profit_rate)`
- `product_revenue_gbp = ROUND(qty_for_amounts * sell_unit_gbp, 2)`
- `revenue_bdt = ROUND(product_revenue_gbp * selected_rate_source, 0)`

#### BDT pricing mode
- `landed_cost_bdt = product_cost_bdt + cargo_cost_bdt`
- if final BDT exists:
  - `revenue_bdt = ROUND(qty_for_amounts * final_unit_bdt, 0)`
- else:
  - `revenue_bdt = ROUND(landed_cost_bdt * (1 + profit_rate), 0)`

### 6.6 Profit

- `total_cost_bdt = ROUND(product_cost_bdt + cargo_cost_bdt, 0)`

If `profit_base = PRODUCT_ONLY`:
- `profit_bdt = ROUND(revenue_bdt - product_cost_bdt, 0)`

If `profit_base = PRODUCT_PLUS_CARGO`:
- `profit_bdt = ROUND(revenue_bdt - total_cost_bdt, 0)`

## 7) Offered Unit Auto-Refresh

Implemented in:
- `/Users/david/Desktop/projects/brand-wala-uk/apps-script/UK_Orders_Status.js`
- `UK_refreshOfferedUnitsForOrder_(order_id, preferredShipmentId)`

Triggered by:
- `uk_order_price`
- `uk_recompute_order`

Behavior:
- Refreshes `offered_unit_gbp` and `offered_unit_bdt` from current mode/profit/shipment context.
- For GBP mode, BDT equivalent is also filled.
- For BDT mode, landed estimate uses allocation+shipment; falls back to default shipment if needed.

## 8) Order Rollups

Order rollup function:
- `UK_recomputeOrder_(order_id)` in `UK_Recompute.js`

Before rolling up order totals:
- `uk_recompute_order` now recomputes all related shipments first.

Rollup totals:
- `total_order_qty`
- `total_allocated_qty`
- `total_shipped_qty`
- `total_remaining_qty`
- `total_revenue_bdt`
- `total_product_cost_bdt`
- `total_cargo_cost_bdt`
- `total_total_cost_bdt`
- `total_profit_bdt`

## 9) Status Behavior

Main status handlers:
- `/Users/david/Desktop/projects/brand-wala-uk/apps-script/UK_Orders_Status.js`

Notable:
- `uk_update_order_status` is admin override and accepts any valid status value.
- `uk_recompute_order` auto-updates status only when currently in:
  - `processing`
  - `partially_delivered`

Rule:
- remaining = 0 -> `delivered`
- shipped > 0 and remaining > 0 -> `partially_delivered`
- else -> `processing`

## 10) Performance Note

Bulk allocation update race was fixed:
- `UK_handleAllocationUpdate` now updates only the target row by `allocation_id`
- No full-table overwrite on each update

## 11) API Groups (Router)

Defined in `/Users/david/Desktop/projects/brand-wala-uk/apps-script/UK_Main.js`:
- Auth: `uk_login`, `uk_check_access`
- Cart: `uk_cart_*`
- Orders: `uk_create_order`, `uk_get_orders`, `uk_get_order_items`, `uk_update_order*`, delete
- Status: `uk_order_*`, `uk_update_order_status`
- Shipments: `uk_shipment_*`
- Allocation: `uk_allocation_*`
- Pricing modes: `uk_pricing_mode_*`
- Recompute: `uk_recompute_shipment`, `uk_recompute_order`
- Setup/debug: `uk_setup_sheets`, `uk_debug_sheets`

## 12) What Customer Sees

UI logic (customer details page) now shows:
- In `priced` / `under_review`: offered unit as primary
- In `finalized` / `processing` / `partially_delivered` / `delivered`: final unit as primary

