import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { firebaseAuth } from "@/firebase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const { user, refreshAccess } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user) nav("/products", { replace: true });
  }, [user, nav]);

  async function handleGoogleLogin() {
    setBusy(true);
    setErr("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(firebaseAuth, provider);
      const signedInEmail = String(cred?.user?.email || "").trim().toLowerCase();

      const result = await refreshAccess();
      if (!result?.ok) {
        const reason = String(result?.reason || "unknown");
        throw new Error(
          `Not authorized for ${signedInEmail || "this account"}. reason=${reason}`,
        );
      }
      nav("/products", { replace: true });
    } catch (e) {
      console.error("Login failed:", e);
      setErr(String(e?.message || "Google sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center">
        <Card className="w-full rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl tracking-tight text-slate-900">Sign in</CardTitle>
            <CardDescription>Continue with Google to access Brand Wala UK.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {err ? (
              <Alert variant="destructive">
                <AlertTitle>Sign-in error</AlertTitle>
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="button"
              className="w-full"
              onClick={handleGoogleLogin}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Continue with Google"
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              Your account must exist in Firestore `users` with `active=1`.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
