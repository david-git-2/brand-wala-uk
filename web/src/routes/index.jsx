import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../auth/ProtectedRoute";

import Login from "../pages/Login";
import Products from "../pages/Products";
import Cart from "../pages/Cart";

// Customer pages
import CustomerOrders from "../pages/customer/CustomerOrders";
import CustomerOrderDetails from "../pages/customer/CustomerOrderDetails";

// Admin pages
import AdminOrders from "../pages/admin/AdminOrders";
import AdminOrderDetails from "../pages/admin/AdminOrderDetails";
import AdminShipments from "../pages/admin/AdminShipments";
import AdminShipmentDetails from "../pages/admin/AdminShipmentDetails";
import AdminOrderWeights from "../pages/admin/AdminOrderWeights";
import AdminReviewOrderDetails from "../pages/admin/AdminReviewOrderDetails";

import { useAuth } from "../auth/AuthProvider";

// Redirect /orders to correct role-based route
function OrdersRedirect() {
  const { user } = useAuth();
  const role = String(user?.role || "customer").toLowerCase();
  return <Navigate to={role === "admin" ? "/admin/orders" : "/customer/orders"} replace />;
}

// Admin-only guard
function AdminRoute({ children }) {
  const { user } = useAuth();
  const role = String(user?.role || "customer").toLowerCase();
  if (role !== "admin") return <Navigate to="/customer/orders" replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Default */}
      <Route path="/" element={<Navigate to="/products" replace />} />

      <Route path="/login" element={<Login />} />

      <Route
        path="/products"
        element={
          <ProtectedRoute>
            <Products />
          </ProtectedRoute>
        }
      />

      {/* Smart redirect */}
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <OrdersRedirect />
          </ProtectedRoute>
        }
      />

      {/* ========================= */}
      {/* Customer routes */}
      {/* ========================= */}
      <Route
        path="/customer/orders"
        element={
          <ProtectedRoute>
            <CustomerOrders />
          </ProtectedRoute>
        }
      />

      <Route
        path="/customer/orders/:orderId"
        element={
          <ProtectedRoute>
            <CustomerOrderDetails />
          </ProtectedRoute>
        }
      />

      {/* ========================= */}
      {/* Admin order routes */}
      {/* ========================= */}
      <Route
        path="/admin/orders"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AdminOrders />
            </AdminRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/orders/:orderId"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AdminOrderDetails />
            </AdminRoute>
          </ProtectedRoute>
        }
      />

      {/* ========================= */}
      {/* Admin shipment routes */}
      {/* ========================= */}
      <Route
        path="/admin/shipments"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AdminShipments />
            </AdminRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/shipments/:shipmentId"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AdminShipmentDetails />
            </AdminRoute>
          </ProtectedRoute>
        }
      />

      {/* Cart */}
      <Route
        path="/cart"
        element={
          <ProtectedRoute>
            <Cart />
          </ProtectedRoute>
        }
      />

      <Route path="/admin/orders/:orderId/review" element={<AdminReviewOrderDetails />} />
<Route path="/admin/orders/:orderId/weights" element={<AdminOrderWeights />} />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}