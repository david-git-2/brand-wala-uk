import { useLocation } from "react-router-dom";

import AppRoutes from "./routes";
import CartFab from "./cart/CartFab";
import CartSidebar from "./cart/CartSidebar";
import NavBar from "./navigation/NavBar";

function shouldShowCartUI(pathname) {
  const allowed = ["/products"];
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function shouldShowNav(pathname) {
  const hiddenRoutes = ["/login"]; // add "/register", "/forgot-password" if needed
  return !hiddenRoutes.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export default function App() {
  const { pathname } = useLocation();

  const showCartUI = shouldShowCartUI(pathname);
  const showNav = shouldShowNav(pathname);

  return (
    <>
      {showNav && <NavBar />}

      <AppRoutes />

      {showCartUI && <CartSidebar />}
      {showCartUI && <CartFab />}
    </>
  );
}
