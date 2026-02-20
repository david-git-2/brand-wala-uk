import { useAuth } from "../auth/AuthProvider";

export default function Products() {
  const { user, logout } = useAuth();

  return (
    <div style={{ padding: 16 }}>
      <h2>Products</h2>
      <div style={{ marginBottom: 12 }}>
        Logged in as: <b>{user?.email}</b>
      </div>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}