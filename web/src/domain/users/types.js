/**
 * User roles supported by v2 access model.
 * @type {readonly string[]}
 */
export const USER_ROLES = ["admin", "ops", "sales", "customer", "investor"];

/**
 * @typedef {Object} UserProfile
 * @property {string} email
 * @property {string} name
 * @property {"admin"|"ops"|"sales"|"customer"|"investor"} role
 * @property {0|1} active
 * @property {0|1} can_see_price_gbp
 * @property {0|1} can_use_cart
 * @property {boolean} is_admin
 */
