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
  const p = String(pathname || "").toLowerCase();
  if (p === "/login" || p.startsWith("/login/")) return false;
  // GitHub Pages/project-subpath safety (e.g. /brand-wala-uk/login)
  if (p.endsWith("/login") || p.includes("/login/")) return false;
  return true;
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
