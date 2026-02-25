import {
  cartAddItem as fbCartAddItem,
  cartClear as fbCartClear,
  cartDeleteItem as fbCartDeleteItem,
  cartGetItems as fbCartGetItems,
  cartUpdateItem as fbCartUpdateItem,
} from "@/firebase/cart";

/**
 * Firebase-backed cart repository.
 */
export function createFirebaseCartRepo() {
  return {
    async getByUser(email) {
      return fbCartGetItems(email);
    },
    async addItem(email, item) {
      return fbCartAddItem(email, item);
    },
    async updateItemQuantity(email, productId, quantity) {
      return fbCartUpdateItem(email, productId, quantity);
    },
    async removeItem(email, productId) {
      return fbCartDeleteItem(email, productId);
    },
    async clear(email) {
      return fbCartClear(email);
    },
  };
}

export const cartRepo = createFirebaseCartRepo();
