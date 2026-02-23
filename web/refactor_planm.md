# Full Refactor Context (Google Sheets + Apps Script)

## 0) Goals of the refactor

1. Allow **one shipment to contain items from multiple orders**
2. Allow **one order item to be delivered across multiple shipments**
3. Make **weights controlled in Shipment Allocation** (requirement)
4. Support **multiple pricing modes + versions** (config table)
5. Ensure **status-based permissions** for Customer/Admin
6. Make profit/cost consistent for:
   - **GBP profit on product only** (cargo not in profit base)
   - **BDT profit on product+cargo** (profit on full landed cost)

7. Apply rounding rules consistently:
   - ✅ **All GBP money fields = ROUND(x, 2)**
   - ✅ **All BDT money fields = ROUND(x, 0)**

---

# 1) Sheet architecture (tabs)

## A) `orders` (header table)

**1 row per order**

**Columns**

- `order_id` (unique)
- `order_name`
- `creator_email`
- `creator_name`
- `creator_role`
- `creator_can_see_price_gbp`
- `status` (from status list)
- `created_at`
- `updated_at`

**Calculated (recommended)**

- `total_order_qty` (sum ordered qty from order_items)
- `total_allocated_qty` (sum allocated_qty from shipment_allocation)
- `total_shipped_qty` (sum shipped_qty from shipment_allocation)
- `total_remaining_qty` = total_order_qty - total_shipped_qty
- `total_revenue_bdt` (sum allocation revenue_bdt, rounded 0 decimals)
- `total_product_cost_bdt` (sum allocation product_cost_bdt, rounded 0 decimals)
- `total_cargo_cost_bdt` (sum allocation cargo_cost_bdt, rounded 0 decimals)
- `total_total_cost_bdt` = total_product_cost_bdt + total_cargo_cost_bdt (rounded 0 decimals)
- `total_profit_bdt` = total_revenue_bdt - total_total_cost_bdt (rounded 0 decimals)

> Remove the old single `shipment_id` from orders. Orders can link to multiple shipments via shipment_allocation.

---

## B) `order_items` (deal + negotiation table)

**1 row per product line in an order**

**Identity**

- `order_item_id` (key: `order_id & "-" & item_sl`)
- `item_sl`
- `order_id`
- `product_id`
- `barcode`
- `brand`
- `name`
- `image_url`
- `case_size`

**Demand**

- `ordered_quantity`

**Pricing mode**

- `pricing_mode_id` (points to pricing_modes table)
- `profit_rate` (admin-set default or per item)

**Negotiation fields (store as UNIT prices)**

- `offered_unit_gbp` (GBP, round 2)
- `customer_unit_gbp` (GBP, round 2)
- `final_unit_gbp` (GBP, round 2)
- `offered_unit_bdt` (BDT, round 0)
- `customer_unit_bdt` (BDT, round 0)
- `final_unit_bdt` (BDT, round 0)

**Product buy cost**

- `buy_price_gbp` (GBP, round 2)

**Calculated tracking**

- `allocated_qty_total` (sum allocated_qty from shipment_allocation for this order_item_id)
- `shipped_qty_total` (sum shipped_qty from shipment_allocation for this order_item_id)
- `remaining_qty` = ordered_quantity - shipped_qty_total
- `item_status` derived from shipped totals:
  - `not_started` if shipped_qty_total = 0
  - `partial` if 0 < shipped_qty_total < ordered_quantity
  - `delivered` if shipped_qty_total = ordered_quantity

> No weight columns here. Weights are controlled in shipment_allocation.

---

## C) `pricing_modes` (versioned config table)

**1 row per pricing variant/version**

**Columns**

- `pricing_mode_id` (e.g. `PM_GBP_PROD_V1`)
- `name`
- `version` (v1/v2)
- `currency` (`GBP` or `BDT`)
- `profit_base` (`PRODUCT_ONLY` or `PRODUCT_PLUS_CARGO`)
- `cargo_charge` (`PASS_THROUGH` or `INCLUDED_IN_PRICE`)
- `conversion_rule` (`SEPARATE_RATES` or `AVG_RATE`)
- `rate_source_revenue` (`avg` / `product` / `cargo`) (optional but useful)
- `active` TRUE/FALSE
- `notes`

**Required modes**

1. `PM_GBP_PROD_V1`: currency=GBP, profit_base=PRODUCT_ONLY, cargo_charge=PASS_THROUGH
2. `PM_BDT_LANDED_V1`: currency=BDT, profit_base=PRODUCT_PLUS_CARGO, cargo_charge=INCLUDED_IN_PRICE

---

## D) `shipments`

**1 row per shipment**

**Columns**

- `shipment_id`
- `name`
- `gbp_avg_rate`
- `gbp_rate_product`
- `gbp_rate_cargo`
- `cargo_cost_per_kg`
- `created_at`
- `updated_at`
- `status` (optional: draft/finalized/received)

---

## E) `shipment_allocation` (central controller)

**1 row = portion of an order_item assigned to a shipment**

**Identity**

- `allocation_id` (optional)
- `shipment_id`
- `order_id`
- `order_item_id`
- `product_id`

**Quantities**

- `allocated_qty` (planned qty for this shipment)
- `shipped_qty` (actual shipped/delivered qty)

**Weights (editable here)**

- `unit_product_weight`
- `unit_package_weight`
- `unit_total_weight` = unit_product_weight + unit_package_weight
- `allocated_weight` = allocated_qty \* unit_total_weight
- `shipped_weight` = shipped_qty \* unit_total_weight

**Costs (derived from shipment + buy price)**

- `buy_price_gbp` (lookup from order_items; round 2)

- `product_cost_gbp` = ROUND(shipped_qty \* buy_price_gbp, 2)

- `product_cost_bdt`:
  - if conversion_rule = SEPARATE_RATES → ROUND(product_cost_gbp \* gbp_rate_product, 0)
  - if conversion_rule = AVG_RATE → ROUND(product_cost_gbp \* gbp_avg_rate, 0)

- `cargo_cost_gbp` = ROUND(shipped_weight \* cargo_cost_per_kg, 2)

- `cargo_cost_bdt`:
  - if conversion_rule = SEPARATE_RATES → ROUND(cargo_cost_gbp \* gbp_rate_cargo, 0)
  - if conversion_rule = AVG_RATE → ROUND(cargo_cost_gbp \* gbp_avg_rate, 0)

**Revenue + profit (derived from pricing mode + unit prices)**

- `pricing_mode_id` (lookup from order_items)

Revenue logic (per allocation row):

- If pricing_mode.currency = GBP:
  - determine sell_unit_gbp:
    - if final_unit_gbp exists → use it
    - else sell_unit_gbp = ROUND(buy_price_gbp \* (1 + profit_rate), 2)

  - product_revenue_gbp = ROUND(shipped_qty \* sell_unit_gbp, 2)
  - revenue_bdt = ROUND(product_revenue_gbp \* chosen_rate_source (avg/product/cargo), 0)
  - If cargo_charge = PASS_THROUGH → customer_total_bdt = revenue_bdt + cargo_cost_bdt (rounded 0)

- If pricing_mode.currency = BDT:
  - landed_cost_bdt = ROUND(product_cost_bdt + cargo_cost_bdt, 0)
  - if final_unit_bdt exists → revenue_bdt = ROUND(shipped_qty \* final_unit_bdt, 0)
  - else revenue_bdt = ROUND(landed_cost_bdt \* (1 + profit_rate), 0)

Profit logic:

- If profit_base = PRODUCT_ONLY:
  - profit_bdt = ROUND(revenue_bdt - product_cost_bdt, 0)

- If profit_base = PRODUCT_PLUS_CARGO:
  - total_cost_bdt = ROUND(product_cost_bdt + cargo_cost_bdt, 0)
  - profit_bdt = ROUND(revenue_bdt - total_cost_bdt, 0)

Also store:

- `total_cost_bdt` = ROUND(product_cost_bdt + cargo_cost_bdt, 0)

---

# 2) Status model + permissions (Customer/Admin)

Use `orders.status` as the source of truth.
Enforce with Apps Script `onEdit` + protected ranges.

| Status              | Customer          | Admin              |
| ------------------- | ----------------- | ------------------ |
| draft               | Full edit         | Full edit          |
| submitted           | Read only         | Full edit          |
| priced              | Accept or counter | Full edit          |
| under_review        | Adjust counter    | Full edit          |
| finalized           | Read only         | Full edit          |
| processing          | Read only         | Update shipped qty |
| partially_delivered | Read only         | Full edit          |
| delivered           | Read only         | Read only          |
| cancelled           | Read only         | Full edit          |

### Customer editable columns

- `draft`:
  - `orders`: order_name (optional)
  - `order_items`: ordered_quantity (+ add/remove items)

- `priced`:
  - `order_items`: customer_unit_gbp or customer_unit_bdt (depending on pricing_mode)

- `under_review`:
  - `order_items`: customer*unit*\* (adjust counter)

### Admin editable columns

- `draft/submitted/priced/under_review/finalized/partially_delivered/cancelled`:
  - `order_items`: profit*rate, offered_unit*_, final*unit*_, pricing_mode_id
  - `shipment_allocation`: allocated_qty, weights, shipment assignment, shipped_qty

- `processing`:
  - only allow editing `shipment_allocation.shipped_qty` (and fields needed to compute shipped_weight/cost)

### Delivered

- No edits allowed.

---

# 3) Status transitions (workflow)

### Customer actions

1. `draft → submitted`
   - Validate: has at least 1 order_item, all ordered_quantity > 0

2. `priced → under_review`
   - Customer enters counter unit prices, triggers status update

3. `priced → finalized` (accept offer)
   - Customer accepts (locks customer edits)

### Admin actions

1. `submitted → priced`
   - Admin sets pricing_mode_id + profit_rate and generates offered prices (rounded)

2. `under_review → priced`
   - Admin responds to counter

3. `priced/under_review → finalized`
   - Admin sets final unit prices (rounded) and locks deal

4. `finalized → processing`
   - Admin creates shipment rows + allocations

5. `processing → partially_delivered`
   - If shipped_qty_total > 0 and remaining > 0

6. `processing → delivered`
   - If shipped_qty_total == ordered_quantity for all items

7. `any → cancelled`
   - Admin cancels (not allowed if delivered)

---

# 4) Partial delivery logic

For each `order_item_id`:

- shipped_qty_total = SUM(shipment_allocation.shipped_qty for this order_item_id)
- remaining_qty = ordered_quantity - shipped_qty_total

For whole order:

- order_remaining_qty = SUM(remaining_qty across order_items)

Automatic updates:

- If order status is `processing` or `partially_delivered`:
  - if order_remaining_qty == 0 → set `delivered`
  - else if total_shipped_qty > 0 → set `partially_delivered`
  - else remain `processing`

---

# 5) Refactor steps (migration plan)

## Phase 1 — Add new tables

1. Create `pricing_modes`
2. Create `shipment_allocation`
3. Add `order_item_id` + `pricing_mode_id` to `order_items`

## Phase 2 — Move shipment linkage out

4. Stop using `orders.shipment_id` (deprecate column)
5. Replace `order_items.shipped_quantity` with computed shipped_qty_total (or make old column read-only)

## Phase 3 — Move weights out

6. Deprecate any `product_weight`, `package_weight` columns from order_items
7. Use shipment_allocation as the only editable weight source

## Phase 4 — Recompute totals/profit

8. In `orders`, compute totals from shipment_allocation (rounded rules applied)
9. Validate against old system on sample data

## Phase 5 — Enforce statuses

10. Apps Script onEdit validation:

- block forbidden edits by status and role
- enforce rounding rules on GBP/BDT fields
- prevent over-shipping (shipped_qty_total <= ordered_quantity)

---

# 6) Apps Script responsibilities

### A) Guards/validation

- Prevent over-shipping: sum shipped_qty for an order_item_id cannot exceed ordered_quantity
- Prevent allocation if order is not finalized (optional)
- Apply rounding rules:
  - GBP fields always ROUND(x,2)
  - BDT fields always ROUND(x,0)

### B) Status helpers

- submitOrder(order_id)
- priceOrder(order_id)
- acceptOffer(order_id)
- sendCounter(order_id)
- finalizeOrder(order_id)
- startProcessing(order_id)
- recomputeOrderStatus(order_id)

### C) Next shipment suggestion helper

- compute remaining_qty for all items in an order
- auto-generate shipment_allocation rows for remaining quantities

---

## Final outcome

- Supports partial shipments and multi-order shipments
- Shipment_allocation is the single source of truth for weights and shipment costs
- Pricing is flexible and versioned by pricing_modes
- Order statuses control permissions cleanly
- Rounding rules are consistent (GBP 2dp, BDT 0dp)

🆕 New files to add (orders + shipments + pricing + allocation)
Orders (from scratch)

UK_Orders_Create.gs

UK_handleCreateOrder(body) (new schema, status=submitted)

UK*getCartItemsForOrder*(email) (if you keep it here)

UK_Orders_Read.gs

UK_handleGetOrders(body)

UK_handleGetOrderItems(body)

UK_Orders_Edit.gs

UK_handleUpdateOrder(body) (header only)

UK_handleUpdateOrderItems(body) (role+status guarded)

UK_handleDeleteOrderItems(body)

UK_handleDeleteOrder(body) (admin only)

UK_Orders_Status.gs

UK_handleOrderPrice(body) (admin)

UK_handleOrderCustomerCounter(body) (customer)

UK_handleOrderAcceptOffer(body) (customer)

UK_handleOrderFinalize(body) (admin)

UK_handleOrderStartProcessing(body) (admin)

UK_handleOrderCancel(body) (admin)

optional: UK_handleUpdateOrderStatus(body) (admin override)

Shipments (CRUD)

UK_Shipments_CRUD.gs

UK_handleShipmentCreate(body)

UK_handleShipmentGetAll(body)

UK_handleShipmentGetOne(body)

UK_handleShipmentUpdate(body)

UK_handleShipmentDelete(body)

Shipment Allocation (replaces old shipment↔order linking)

UK_Allocation_Handlers.gs

UK_handleAllocationCreate(body)

UK_handleAllocationUpdate(body)

UK_handleAllocationDelete(body)

UK_handleAllocationGetForShipment(body)

UK_handleAllocationGetForOrder(body)

optional: UK_handleAllocationSuggestForShipment(body)

Pricing modes (versioned config)

UK_PricingModes.gs

UK_handlePricingModeGetAll(body)

UK_handlePricingModeCreate(body)

UK_handlePricingModeUpdate(body)

UK_handlePricingModeDelete(body) (or deactivate)

Recompute / rollups (totals + status)

UK_Recompute.gs

UK_handleRecomputeOrder(body)

UK_handleRecomputeShipment(body)

internal helpers:

UK*recomputeOrder*(order_id)

UK*recomputeShipment*(shipment_id)

UK*recomputeOrderStatus*(order_id)

UK*computeAllocationAmounts*(...)

Guards + Schema checks (small but important)

UK_Guards.gs

permission checks by role + status:

UK*assertAdmin*(user)

UK*assertOrderEditable*(user, status)

UK*assertOrderItemEditable*(user, status, fields)

UK*assertStatusTransition*(from, to, role)

validations:

prevent over-shipping

prevent invalid transitions

UK_Schema.gs

UK*requireColumns*(sheet, requiredCols) (throws if missing)

UK*getMapStrict*(sheet, requiredCols) (returns header map)

Dev Plan (UK Orders + Shipments Refactor)
Step 0 — Prep

Goal: Make sure sheets + headers exist so code won’t break.

Do

Create these tabs (if not already):

uk_orders

uk_order_items

uk_shipments

uk_shipment_allocation

uk_pricing_modes

Paste the final column headers (cargo naming, new schema).

Keep existing tabs:

users

uk_cart_items

Exit criteria

No missing column errors from schema checks.

Step 1 — Update Router Only

Goal: New endpoints route to new handler names, without implementing logic yet.

Files

Update: UK_Main.gs

Create empty new files with stubs returning “TODO”:

UK_Orders_Create.gs

UK_Orders_Read.gs

UK_Orders_Edit.gs

UK_Orders_Status.gs

UK_Shipments_CRUD.gs

UK_Allocation_Handlers.gs

UK_PricingModes.gs

UK_Recompute.gs

UK_Guards.gs

UK_Schema.gs

Exit criteria

Deploy runs and returns “TODO” for new endpoints, but auth/cart still works.

Step 2 — Schema & Guard Utilities

Goal: Stop silent failures early; standardize validations & rounding.

Files

Implement in: UK_Schema.gs

UK*requireColumns*(sheet, requiredCols)

UK*getMapStrict*(sheet, requiredCols)

Implement in: UK_Guards.gs

UK*assertAdmin*(user)

UK*roundGBP*(n) / UK*roundBDT*(n) (or wrappers if you prefer)

UK*assertOrderExists*(order_id)

UK*assertNotDelivered*(status)

UK*assertNoOverShip*(order_item_id, shippedQtyDelta) (placeholder ok)

Exit criteria

Any endpoint can call UK*requireColumns* and fail fast with useful errors.

Step 3 — Orders Create (NEW schema)

Goal: uk_create_order creates:

row in uk_orders

rows in uk_order_items

status = submitted

dedupe by product_id (sum quantity)

clears cart

Files

Implement: UK_Orders_Create.gs (UK_handleCreateOrder)

Uses existing cart function UK*getCartItemsForOrder* (can live here)

Uses existing auth: ukRequireActiveUser\_

Exit criteria

Create order by sending action=uk_create_order with only email + order_name (items optional).

Order rows appear with correct totals:

qty totals filled

BDT totals remain 0 until allocations exist

Cart cleared.

Step 4 — Orders Read

Goal: customers/admin can retrieve orders and items.

Files

Implement: UK_Orders_Read.gs

UK_handleGetOrders

UK_handleGetOrderItems

Rules

Customer sees only their orders

Admin sees all orders

Fields returned should respect creator_can_see_price_gbp if you hide GBP

Exit criteria

Fetch orders and items works for both roles.

Step 5 — Shipments CRUD (admin)

Goal: create/update/delete shipments in uk_shipments.

Files

Implement: UK_Shipments_CRUD.gs

Rules

Admin only

Exit criteria

Create shipment row with rates + cargo_cost_per_kg

Step 6 — Pricing Modes CRUD (admin)

Goal: manage uk_pricing_modes table.

Files

Implement: UK_PricingModes.gs

Minimum required

uk_pricing_mode_get_all

Optional: create/update/delete (or deactivate)

Exit criteria

API returns active pricing modes.

Step 7 — Allocation Create/Update/Delete (admin)

Goal: Replace ALL old shipment↔order linking logic with allocation rows.

Files

Implement: UK_Allocation_Handlers.gs

create/update/delete/get_for_shipment/get_for_order

Rules

Admin only

Allocation requires:

shipment_id, order_item_id, allocated_qty

weights (unit_product_weight, unit_package_weight)

shipped_qty starts 0 by default

Prevent allocating more than remaining (optional in Step 7, enforced in Step 9)

Exit criteria

Allocation rows created and retrievable.

Step 8 — Recompute Shipment totals

Goal: uk_recompute_shipment computes:

allocation costs + revenue + profit (for each row)

shipment totals (optional columns)

Files

Implement: UK_Recompute.gs

UK_handleRecomputeShipment

helper UK*computeAllocationAmounts*

Must enforce rounding

GBP 2dp, BDT 0dp

Exit criteria

After allocations exist, recompute_shipment fills allocation money columns and shipment totals.

Step 9 — Recompute Order totals + item status

Goal: uk_recompute_order computes:

allocated_qty_total, shipped_qty_total, remaining_qty, item_status on uk_order_items

totals in uk_orders

update order status when processing/partial/delivered rules apply

Files

Implement: UK_Recompute.gs

UK_handleRecomputeOrder

UK*recomputeOrderStatus*

Exit criteria

Order totals and item statuses match allocations.

No decimals in BDT totals.

Step 10 — Status Transition APIs (workflow)

Goal: Implement clean, limited status transitions with permissions.

Files

Implement: UK_Orders_Status.gs

uk_order_price (admin) → sets offered price fields + pricing_mode_id + profit_rate

uk*order_customer_counter (customer) → sets customer_unit*\* and status under_review

uk_order_accept_offer (customer) → status finalized

uk*order_finalize (admin) → final_unit*\*, status finalized

uk_order_start_processing (admin) → status processing

uk_order_cancel (admin) → status cancelled

Exit criteria

End-to-end status flow works with permission checks.

Step 11 — Lockdown edits (order/item edit endpoints)

Goal: make uk_update_order_items, uk_update_order follow status permissions strictly.

Files

Implement/modify: UK_Orders_Edit.gs

Use guards: UK_Guards.gs

Exit criteria

Customer can only edit allowed fields in allowed statuses.

Admin edits limited during processing (only shipped_qty via allocation update).

Step 12 — Deprecate legacy endpoints

Goal: remove old shipment-order linking actions from router or make them return deprecated.

Do

In UK_Main.gs, delete routes or return:

{success:false,error:"deprecated: use uk*allocation*\*"}

Exit criteria

No one uses the old APIs.

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
apiKey: "AIzaSyDFFNHcZh7tome2FWfOeGAWd6fdyxLYBK8",
authDomain: "brandwala-wholesale.firebaseapp.com",
projectId: "brandwala-wholesale",
storageBucket: "brandwala-wholesale.firebasestorage.app",
messagingSenderId: "355661426123",
appId: "1:355661426123:web:a9aff3f34aa22882ef1a4e",
measurementId: "G-W4MHPDQ0XH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
