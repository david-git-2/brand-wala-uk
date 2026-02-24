# Order Status Guide

This file defines order status meaning, who can act, and expected transitions.

## Status meaning

| Status | Meaning |
| --- | --- |
| `draft` | Temporary editable state before submit. |
| `submitted` | Customer placed order; awaiting admin pricing. |
| `priced` | Admin calculated offer; customer can review/counter. |
| `under_review` | Customer submitted counter offer; admin reviews/finalizes. |
| `finalized` | Final commercial terms locked (price/qty). |
| `processing` | Shipment allocation and receiving in progress. |
| `partially_delivered` | Some quantity arrived, some still pending. |
| `delivered` | All finalized quantities received; closed/read-only. |
| `cancelled` | Order cancelled by admin; can be permanently deleted by admin. |

## Who can edit by status

| Status | Customer | Admin |
| --- | --- | --- |
| `draft` | edit | edit |
| `submitted` | read only | edit |
| `priced` | set counter offer | edit |
| `under_review` | read only | edit/finalize |
| `finalized` | read only | edit shipment/allocation |
| `processing` | read only | update arrived quantities and weights |
| `partially_delivered` | read only | continue processing |
| `delivered` | read only | read only |
| `cancelled` | read only | read/delete |

## Main transition flow

1. `draft` -> `submitted`
2. `submitted` -> `priced`
3. `priced` -> `under_review` (customer counters) OR `priced` -> `finalized` (admin finalizes directly)
4. `under_review` -> `finalized`
5. `finalized` -> `processing`
6. `processing` -> `partially_delivered` -> `delivered`
7. `any non-delivered` -> `cancelled`

## UI/permission notes

- Customer price visibility starts from `priced`.
- If `can_see_price_gbp = 0`, customer sees BDT-facing values only.
- Permanent delete is allowed only for `cancelled` orders and requires typed confirmation.
