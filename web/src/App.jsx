import AppRoutes from "./routes";
import CartFab from "./cart/CartFab";
import CartSidebar from "./cart/CartSidebar";
import NavBar from "./navigation/NavBar";


export default function App() {
  return (
    <>
          <NavBar />

      <AppRoutes />
      <CartSidebar />
      <CartFab />
    </>
  );
}