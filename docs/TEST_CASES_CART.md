# Cart Test Cases (V2)

## Scope

- Snapshot pricing in cart (`unit_price_gbp`)
- Quantity rule by case size:
  - `qty_step = max(case_size, 6)`
  - minimum qty = `qty_step`
  - qty must be step multiple
  - invalid qty auto-rounds up
- Customer cart disabled for now
- Cart clears after successful order creation

---

## Data Preconditions

1. Test user exists and is active.
2. Product data exists with mixed case sizes:
   - one product `case_size < 6` (e.g. 4)
   - one product `case_size >= 6` (e.g. 12)
3. Cart permission combinations are available:
   - `can_use_cart=1`
   - `can_use_cart=0`
4. Roles available:
   - `admin`
   - `customer`

---

## Quantity Rule

### C-Q-01 Step rule with low case size
- Precondition: product case size = 4
- Steps: add item to cart
- Expected:
  - `qty_step=6`
  - `quantity` starts at 6 or rounds to 6

### C-Q-02 Step rule with high case size
- Precondition: product case size = 12
- Steps: add item to cart
- Expected:
  - `qty_step=12`
  - `quantity` is multiple of 12

### C-Q-03 Auto-round up on invalid qty
- Precondition: `qty_step=6`
- Steps: set qty to 7
- Expected: qty stored as 12

### C-Q-04 Never below minimum step
- Precondition: `qty_step=12`
- Steps: decrement/update below 12
- Expected: qty stays >= 12 (unless item removed)

### C-Q-05 Increment/decrement by step
- Precondition: item in cart with `qty_step=6`
- Steps: press + once, then - once
- Expected:
  - + increases by exactly 6
  - - decreases by exactly 6

---

## Price Snapshot

### C-P-01 Store snapshot at add time
- Steps: add product with known GBP price
- Expected:
  - item stores `unit_price_gbp`
  - item stores `line_total_gbp = unit_price_gbp * quantity`

### C-P-02 Price hidden but stored
- Precondition: user `can_see_price_gbp=0`
- Steps: add item (role allowed to use cart)
- Expected:
  - GBP not shown in UI where hidden by policy
  - `unit_price_gbp` still stored in doc

### C-P-03 Qty update recalculates line total
- Steps: increase qty
- Expected: `line_total_gbp` updates correctly

---

## Access and Permissions

### C-A-01 Customer cart disabled (current policy)
- Precondition: role = customer
- Steps: open products/cart
- Expected:
  - add-to-cart not available
  - cart route blocked

### C-A-02 Cart disabled flag
- Precondition: role != customer, `can_use_cart=0`
- Steps: try add/update/remove/clear
- Expected:
  - blocked with `Cart is disabled for your account.`

### C-A-03 Active enforcement
- Precondition: user `active=0`
- Steps: try cart write operations
- Expected: Firestore denies writes

### C-A-04 Ownership
- Steps: user A tries to read/write user B cart
- Expected: denied by rules

### C-A-05 Admin access
- Steps: admin accesses permitted cart flows
- Expected: allowed where policy permits

---

## Order Creation Integration

### C-O-01 Create order from cart
- Precondition: cart has items
- Steps: place order with order name
- Expected:
  - order created successfully
  - status initialized as `submitted`

### C-O-02 Cart clear on success
- Steps: place order successfully
- Expected: cart is empty after operation

### C-O-03 Failure rollback behavior
- Steps: simulate order create failure
- Expected:
  - error shown
  - cart items remain (not silently lost)

---

## Data Integrity

### C-D-01 Item identity
- Steps: add product
- Expected: cart item doc key is product id and includes product snapshot fields

### C-D-02 Required fields present
- Expected item fields:
  - `product_id`
  - `name`
  - `brand`
  - `image_url`
  - `case_size`
  - `qty_step`
  - `quantity`
  - `unit_price_gbp`
  - `line_total_gbp`

### C-D-03 Cache consistency
- Steps: add/update/remove then refresh
- Expected: UI and Firestore data remain consistent

---

## Regression Checklist

1. No customer path can mutate orders after creation.
2. Cart UI does not appear for customers.
3. No quantity can persist that breaks step rule.
4. Price snapshot remains stable for cart line lifetime.
