import { useLocation } from "react-router-dom";

import AppRoutes from "./routes";
import CartFab from "./cart/CartFab";
import CartSidebar from "./cart/CartSidebar";
import NavBar from "./navigation/NavBar";

function shouldShowCartUI(pathname) {
  // Show cart UI only on these routes (add/remove as you like)
  const allowed = ["/products"];
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function App() {
  const { pathname } = useLocation();

  const showCartUI = shouldShowCartUI(pathname);

  return (
    <>
      <NavBar />
      <AppRoutes />

      {/* ✅ only render cart UI on selected routes */}
      {showCartUI && <CartSidebar />}
      {showCartUI && <CartFab />}
    </>
  );
}