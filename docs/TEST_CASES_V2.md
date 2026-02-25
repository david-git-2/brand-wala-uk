# Test Cases V2

## Users

### U-01 Create user (default fields)
- Precondition: admin logged in
- Steps: create user with email + name only
- Expected:
  - `role=customer`
  - `active=1`
  - `can_see_price_gbp=0`
  - `can_use_cart=1`
  - doc id = lowercase email
  - `users/{email}/config/preferences` exists

### U-02 Create user (custom role)
- Steps: create user with role `ops` / `sales` / `investor`
- Expected: role stored exactly as selected

### U-03 Update user flags
- Steps: toggle `active`, `can_see_price_gbp`, `can_use_cart`
- Expected: values stored as `0/1` only

### U-04 Soft deactivate user
- Steps: set `active=0`
- Expected:
  - user can still sign in (if already authenticated)
  - all write operations are denied by rules

### U-05 Hard delete user
- Steps: delete user permanently
- Expected:
  - `users/{email}` removed
  - subsequent auth profile hydration fails as unauthorized

### U-06 Admin read scope
- Steps: admin fetches users list
- Expected: full list available

### U-07 Non-admin read scope
- Steps: customer tries to list users
- Expected: denied
- Steps: customer reads own profile
- Expected: allowed

### U-08 Non-admin write protection
- Steps: customer attempts update/create/delete under `users/*`
- Expected: denied

### U-09 Preferences write
- Steps: user updates own `users/{email}/config/preferences`
- Expected: allowed

### U-10 Price memory write
- Steps: customer writes `users/{email}/price_memory/*`
- Expected: denied
- Steps: admin writes same
- Expected: allowed

---

## Cart

### C-01 Add to cart
- Precondition: `active=1`, `can_use_cart=1`
- Steps: add item
- Expected: item exists under `carts/{email}/items/{product_id}`

### C-02 Update quantity
- Steps: change qty
- Expected: qty updated, line total recalculated

### C-03 Remove item
- Steps: remove item
- Expected: item removed

### C-04 Clear cart
- Steps: clear cart
- Expected: no cart items remain

### C-05 Cart blocked when `can_use_cart=0`
- Steps: disable cart for user then try add/update/remove
- Expected: all cart writes denied

### C-06 Cart blocked when `active=0`
- Steps: deactivate user then try cart writes
- Expected: denied

### C-07 Cart ownership
- Steps: user A tries to read/write user B cart
- Expected: denied
- Steps: admin reads/writes any cart
- Expected: allowed

---

## Shipments Core

### S-01 Create shipment header
- Steps: admin creates shipment
- Expected: header doc created with required fields

### S-02 Update shipment header
- Steps: update rates/cargo/status
- Expected: updates persisted

### S-03 Delete shipment
- Steps: delete shipment
- Expected: shipment removed

### S-04 Create shipment item
- Steps: add shipment item with product + qty
- Expected: `shipment_items/{shipment_id}__{product_id}` created

### S-05 Update shipment item quantities
- Steps: update needed/arrived/damaged/expired/stolen/other
- Expected: all values persist correctly

### S-06 Weight fields
- Steps: set unit product/package weight
- Expected: integer grams stored, total weight field correct

### S-07 Access control
- Steps: non-admin reads/writes shipments
- Expected: denied
- Steps: admin reads/writes
- Expected: allowed

---

## Product Weights

### W-01 Create weight profile
- Steps: create by `weight_key` or product identity
- Expected: doc created with grams fields

### W-02 Update weights
- Steps: change product/package/total weights
- Expected: values persist as integers

### W-03 Delete weight profile
- Steps: delete weight doc
- Expected: removed

### W-04 Access control
- Steps: non-admin write attempt
- Expected: denied

---

## Orders + Order Items

### O-01 Create order from cart
- Expected:
  - order header created
  - order items created
  - status `submitted`

### O-02 Customer order visibility
- Steps: customer fetches orders
- Expected: only own orders visible

### O-03 Admin order visibility
- Expected: all orders visible

### O-04 Order item fields
- Validate required fields persist:
  - product identity
  - needed qty
  - purchase price gbp
  - offer/counter/final bdt
  - profit rate

### O-05 Delete protections
- Steps: customer delete order/item
- Expected: denied (unless explicitly allowed later)
- Steps: admin delete
- Expected: allowed

---

## Workflow / Status

### WF-01 Valid transition path
- submitted -> priced -> under_review -> finalized -> processing -> delivered
- Expected: each transition allowed in correct role/context

### WF-02 Invalid transition blocked
- Example: submitted -> delivered directly
- Expected: blocked with clear error

### WF-03 Edit lock by status
- Steps: edit restricted fields in locked statuses
- Expected: blocked

---

## Accounting + Payments

### A-01 Create shipment accounting
- Expected: header created

### A-02 Add customer payment
- Expected: payment document created

### A-03 Update/remove payment
- Expected: changes persist; removed correctly

### A-04 Access control
- Non-admin write denied
- Admin write allowed

---

## Investors + Investor Transactions

### I-01 Create investor
- Expected: investor doc created

### I-02 Create investor transaction
- Expected: transaction doc created with period fields

### I-03 List by investor
- Expected: returns only that investor’s transactions

### I-04 List by period
- Expected: period-filtered transactions returned

---

## Security / Rules Regression

### R-01 Unauthenticated access
- Expected: denied for protected collections

### R-02 Active non-admin write limits
- Expected:
  - allowed only to permitted own paths
  - denied on admin paths

### R-03 Inactive user write block
- Expected: all writes denied

### R-04 Claims fallback behavior
- Expected: profile-based checks still enforce rules when claims stale

---

## Performance / Quota

### P-01 No duplicate listeners
- Navigate app and check repeated read calls
- Expected: no runaway polling

### P-02 Cache hit behavior
- Repeat same screen fetch quickly
- Expected: reduced reads from cache layer

### P-03 Large list behavior
- Users/orders/shipments lists render without blocking UI
- Expected: acceptable load time and stable render
