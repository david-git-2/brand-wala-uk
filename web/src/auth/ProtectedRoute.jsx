import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}