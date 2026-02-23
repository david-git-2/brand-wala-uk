// ============================
// src/cart/CartFab.jsx
// SHADCN + THEME COLORS
// ============================

import { useCart } from "./CartProvider";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// icon
import { ShoppingCart } from "lucide-react";

export default function CartFab() {
  const { toggleCart, distinctCount } = useCart();

  return (
    <Button
      onClick={toggleCart}
      className="fixed bottom-6 right-6 z-40 rounded-full px-5 py-6 shadow-lg"
      size="lg"
      aria-label="Open cart"
    >
      <div className="relative flex items-center gap-2">
        <ShoppingCart className="h-5 w-5" />

        {distinctCount > 0 && (
          <Badge
            variant="secondary"
            className="absolute -right-3 -top-3 h-5 min-w-[20px] justify-center rounded-full px-1 text-xs font-bold"
          >
            {distinctCount}
          </Badge>
        )}

        <span className="text-sm font-medium">Cart</span>
      </div>
    </Button>
  );
}
