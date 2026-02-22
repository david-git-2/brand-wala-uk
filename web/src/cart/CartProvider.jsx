// ============================
// src/cart/CartProvider.jsx
// (UPDATED - product_id PK + API + op-based loading per item + NON-OPTIMISTIC add/remove)
// ============================

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { UK_API } from "../api/ukApi";
import { useAuth } from "../auth/AuthProvider";

const CartContext = createContext(null);

export function minCaseSize(product) {
  return Math.max(6, Number(product?.case_size || 0));
}

// key resolver: product_id is primary
function getProductKey(p) {
  return String(p?.product_id || p?.productId || "").trim();
}

function reducer(state, action) {
  switch (action.type) {
    case "OPEN":
      return { ...state, open: true };
    case "CLOSE":
      return { ...state, open: false };
    case "TOGGLE":
      return { ...state, open: !state.open };

    case "SET_ITEMS": {
      const next = {};
      for (const it of action.items || []) {
        const key = String(it.product_id || it.productId || "").trim();
        if (!key) continue;

        const product = {
          product_id: key,
          barcode: it.barcode || "",
          brand: it.brand || "",
          name: it.name || "",
          imageUrl: it.image_url || it.imageUrl || "",
          price: Number(it.price_gbp ?? it.price ?? 0) || 0,
          case_size: Number(it.case_size ?? 0) || 0,
          country_of_origin: it.country_of_origin || "",
        };

        next[key] = { product, qty: Number(it.quantity || 0) || 0 };
      }
      return { ...state, items: next };
    }

    // itemLoading[key] = "add" | "remove" | "update"
    case "SET_ITEM_LOADING": {
      const { key, op } = action;
      const next = { ...state.itemLoading };

      if (!op) delete next[key];
      else next[key] = op;

      return { ...state, itemLoading: next };
    }

    case "SET_GLOBAL_LOADING":
      return { ...state, loading: !!action.loading };

    // local mutations
    case "ADD_LOCAL": {
      const p = action.product;
      const key = action.key;
      const step = minCaseSize(p);

      const requested = Number(action.qty ?? step);
      const safeQty = Math.max(step, requested);

      return {
        ...state,
        items: {
          ...state.items,
          [key]: { product: p, qty: safeQty },
        },
      };
    }

    case "REMOVE_LOCAL": {
      const next = { ...state.items };
      delete next[action.key];
      return { ...state, items: next };
    }

    case "UPDATE_QTY_LOCAL": {
      const item = state.items[action.key];
      if (!item) return state;
      return {
        ...state,
        items: { ...state.items, [action.key]: { ...item, qty: action.qty } },
      };
    }

    case "CLEAR_LOCAL":
      return { ...state, items: {} };

    default:
      return state;
  }
}

const initialState = {
  open: false,
  loading: false,
  itemLoading: {}, // { [product_id]: "add" | "remove" | "update" }
  items: {},
};

export function CartProvider({ children }) {
  const auth = useAuth();
  const user = auth?.user;
  const [state, dispatch] = useReducer(reducer, initialState);

  const email = user?.email || "";

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!email) {
        dispatch({ type: "SET_ITEMS", items: [] });
        return;
      }

      dispatch({ type: "SET_GLOBAL_LOADING", loading: true });
      try {
        const data = await UK_API.cartGetItems(email);
        if (!alive) return;
        dispatch({ type: "SET_ITEMS", items: data.items || [] });
      } catch (e) {
        console.error("cartGetItems failed:", e);
      } finally {
        if (alive) dispatch({ type: "SET_GLOBAL_LOADING", loading: false });
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [email]);

  const api = useMemo(() => {
    const itemsArr = Object.entries(state.items).map(([key, v]) => ({
      key,
      ...v,
    }));

    const getKey = (p) => getProductKey(p);
    const getItemOp = (key) => state.itemLoading[key] || null;

    const add = async (product, qty) => {
      if (!email) throw new Error("No user email");

      const key = getKey(product);
      if (!key) throw new Error("Missing product_id on product");

      if (state.itemLoading[key]) return; // already busy

      dispatch({ type: "SET_ITEM_LOADING", key, op: "add" });

      try {
        await UK_API.cartAddItem(email, {
          product_id: product.product_id,
          barcode: product.barcode,
          name: product.name,
          brand: product.brand,
          imageUrl: product.imageUrl,
          price: product.price,
          case_size: product.case_size,
          quantity: qty,
        });

        // ✅ ONLY add locally after API success
        dispatch({ type: "ADD_LOCAL", key, product, qty });
      } catch (e) {
        console.error("cartAddItem failed:", e);
        // optional refresh to ensure state is accurate
        try {
          const data = await UK_API.cartGetItems(email);
          dispatch({ type: "SET_ITEMS", items: data.items || [] });
        } catch {}
        throw e;
      } finally {
        dispatch({ type: "SET_ITEM_LOADING", key, op: null });
      }
    };

    const remove = async (productId) => {
      if (!email) throw new Error("No user email");
      const key = String(productId || "").trim();
      if (!key) return;

      if (state.itemLoading[key]) return; // already busy

      dispatch({ type: "SET_ITEM_LOADING", key, op: "remove" });

      try {
        await UK_API.cartDeleteItem(email, key);
        // ✅ remove only after API success
        dispatch({ type: "REMOVE_LOCAL", key });
      } catch (e) {
        console.error("cartDeleteItem failed:", e);
        try {
          const data = await UK_API.cartGetItems(email);
          dispatch({ type: "SET_ITEMS", items: data.items || [] });
        } catch {}
        throw e;
      } finally {
        dispatch({ type: "SET_ITEM_LOADING", key, op: null });
      }
    };

    const setQty = async (productId, qty) => {
      if (!email) throw new Error("No user email");

      const key = String(productId || "").trim();
      const item = state.items[key];
      if (!item) return;

      if (state.itemLoading[key]) return; // avoid stacking ops

      const step = minCaseSize(item.product);
      const safeQty = Math.max(step, Number(qty || 0) || 0);

      dispatch({ type: "SET_ITEM_LOADING", key, op: "update" });

      // keep qty optimistic (or make non-optimistic if you want)
      dispatch({ type: "UPDATE_QTY_LOCAL", key, qty: safeQty });

      try {
        await UK_API.cartUpdateItem(email, key, safeQty);
      } catch (e) {
        console.error("cartUpdateItem failed:", e);
        try {
          const data = await UK_API.cartGetItems(email);
          dispatch({ type: "SET_ITEMS", items: data.items || [] });
        } catch {}
        throw e;
      } finally {
        dispatch({ type: "SET_ITEM_LOADING", key, op: null });
      }
    };

    const inc = (productId) => {
      const key = String(productId || "").trim();
      const item = state.items[key];
      if (!item) return;
      const step = minCaseSize(item.product);
      return setQty(key, item.qty + step);
    };

    const dec = (productId) => {
      const key = String(productId || "").trim();
      const item = state.items[key];
      if (!item) return;
      const step = minCaseSize(item.product);
      return setQty(key, Math.max(step, item.qty - step));
    };

    const clear = async () => {
      if (!email) throw new Error("No user email");
      dispatch({ type: "SET_GLOBAL_LOADING", loading: true });

      dispatch({ type: "CLEAR_LOCAL" });

      try {
        await UK_API.cartClear(email);
      } catch (e) {
        console.error("cartClear failed:", e);
        try {
          const data = await UK_API.cartGetItems(email);
          dispatch({ type: "SET_ITEMS", items: data.items || [] });
        } catch {}
        throw e;
      } finally {
        dispatch({ type: "SET_GLOBAL_LOADING", loading: false });
      }
    };

    const refresh = async () => {
      if (!email) return;
      dispatch({ type: "SET_GLOBAL_LOADING", loading: true });
      try {
        const data = await UK_API.cartGetItems(email);
        dispatch({ type: "SET_ITEMS", items: data.items || [] });
      } finally {
        dispatch({ type: "SET_GLOBAL_LOADING", loading: false });
      }
    };

    return {
      open: state.open,
      loading: state.loading,
      items: itemsArr,
      distinctCount: itemsArr.length,

      getKey,

      isInCart: (p) => {
        const key = getKey(p);
        return !!(key && state.items[key]);
      },

      isItemLoading: (keyOrProduct) => {
        const key = typeof keyOrProduct === "string" ? keyOrProduct : getKey(keyOrProduct);
        return !!getItemOp(key);
      },

      getItemLoadingOp: (keyOrProduct) => {
        const key = typeof keyOrProduct === "string" ? keyOrProduct : getKey(keyOrProduct);
        return getItemOp(key);
      },

      openCart: () => dispatch({ type: "OPEN" }),
      closeCart: () => dispatch({ type: "CLOSE" }),
      toggleCart: () => dispatch({ type: "TOGGLE" }),

      add,
      remove,
      setQty,
      inc,
      dec,
      clear,
      refresh,
    };
  }, [email, state.items, state.itemLoading, state.loading, state.open]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider />");
  return ctx;
}