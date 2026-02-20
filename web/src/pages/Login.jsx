import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { user } = useAuth();
  const nav = useNavigate();

  // if already logged in, go home
  if (user) {
    setTimeout(() => nav("/", { replace: true }), 0);
    return null;
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h2>Login</h2>
      <p>Google sign-in UI goes here (we’ll wire it next).</p>
    </div>
  );
}