import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { UK_API } from "../api/ukApi";

// shadcn/ui
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

function waitForGoogleIdentity(maxMs = 8000, stepMs = 50) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.id
      ) {
        clearInterval(t);
        resolve(true);
        return;
      }
      if (Date.now() - start > maxMs) {
        clearInterval(t);
        reject(
          new Error(
            "Google Identity script not loaded (google.accounts.id missing)",
          ),
        );
      }
    }, stepMs);
  });
}

// UI convenience only (NOT security)
function parseJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(jsonPayload);
}

function setStoredIdToken(t) {
  try {
    if (!t) localStorage.removeItem("bw_id_token");
    else localStorage.setItem("bw_id_token", String(t));
  } catch {}
}

function setCachedUser(u) {
  try {
    if (!u) localStorage.removeItem("bw_user");
    else localStorage.setItem("bw_user", JSON.stringify(u));
  } catch {}
}

function statusBadgeVariant(status) {
  // Badge variants depend on your shadcn config; "secondary" always exists.
  // Using className to mimic your pill coloring.
  if (status === "ready")
    return "bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  if (status === "error") return "bg-rose-50 text-rose-700 hover:bg-rose-50";
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
}

export default function Login() {
  const { user, setUser, refreshAccess } = useAuth();
  const nav = useNavigate();

  const btnRef = useRef(null);
  const btnWrapRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [err, setErr] = useState("");
  const [googleBtnWidth, setGoogleBtnWidth] = useState(320);

  const isLoading = status === "loading";

  useEffect(() => {
    function calcWidth() {
      const w = btnWrapRef.current?.clientWidth || 320;
      // keep a sane minimum/maximum for GIS button rendering
      const next = Math.max(220, Math.min(360, Math.floor(w - 24)));
      setGoogleBtnWidth(next);
    }
    calcWidth();
    window.addEventListener("resize", calcWidth);
    return () => window.removeEventListener("resize", calcWidth);
  }, []);

  // If already logged in -> go home
  useEffect(() => {
    if (user) nav("/products", { replace: true });
  }, [user, nav]);

  const handleCredentialResponse = useCallback(
    async (response) => {
      try {
        setStatus("loading");
        setErr("");

        const idToken = String(response?.credential || "").trim();
        if (!idToken) throw new Error("Missing Google credential token");

        setStoredIdToken(idToken);

        // Extract email from token
        let email = "";
        try {
          const payload = parseJwt(idToken);
          email = String(payload?.email || "").trim();
        } catch {}
        if (!email) throw new Error("Could not read email from Google token");

        const data = await UK_API.login(email);

        const nextUser = {
          email: String(data.email || email).trim(),
          name: String(data.name || "").trim(),
          role: String(data.role || "customer")
            .toLowerCase()
            .trim(),
          can_see_price_gbp: !!data.can_see_price_gbp,
          active: true,
        };

        if (!nextUser.email)
          throw new Error("Login succeeded but missing email");

        setCachedUser(nextUser);
        setUser(nextUser);

        if (refreshAccess) {
          await refreshAccess({ redirectOnFail: false });
        }

        // Ensure fresh app state after auth
        if (!sessionStorage.getItem("bw_reloaded_after_login")) {
          sessionStorage.setItem("bw_reloaded_after_login", "1");
          window.location.reload();
          return;
        }

        nav("/", { replace: true });
      } catch (e) {
        console.error("Login failed:", e);

        setStoredIdToken("");
        setCachedUser(null);
        setUser(null);

        setErr(String(e?.message || e));
        setStatus("error");
      }
    },
    [nav, refreshAccess, setUser],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (user) return;

      setStatus("loading");
      setErr("");

      try {
        const clientId = window.BW_CONFIG?.GOOGLE_CLIENT_ID;
        if (!clientId) throw new Error("Missing BW_CONFIG.GOOGLE_CLIENT_ID");

        await waitForGoogleIdentity();
        if (cancelled) return;

        // Init GIS
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
        });

        // Render button
        if (btnRef.current) {
          btnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(btnRef.current, {
            theme: "outline",
            size: "large",
            width: googleBtnWidth,
          });
        }

        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        setErr(String(e?.message || e));
        setStatus("error");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [googleBtnWidth, handleCredentialResponse, user]);

  return (
    <div className="min-h-[calc(100vh-0px)] bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl tracking-tight text-slate-900">
                    Welcome back
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
                    Sign in with your Google account to continue.
                  </CardDescription>
                </div>

                <Badge
                  variant="secondary"
                  className={statusBadgeVariant(isLoading ? "loading" : status)}
                  aria-live="polite"
                >
                  {isLoading
                    ? "Signing in…"
                    : status === "ready"
                      ? "Ready"
                      : status === "error"
                        ? "Error"
                        : "Idle"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">
                  Continue with Google
                </div>

                <div
                  ref={btnWrapRef}
                  className={[
                    "flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4",
                    isLoading ? "opacity-70" : "opacity-100",
                  ].join(" ")}
                >
                  <div ref={btnRef} />
                </div>
              </div>

              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing you in…</span>
                </div>
              )}

              {status === "error" && (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Couldn’t sign you in</AlertTitle>
                  <AlertDescription className="break-words">
                    {err || "Login could not load. Please refresh."}
                  </AlertDescription>
                </Alert>
              )}

              <div className="text-xs leading-5 text-slate-500">
                By continuing, you agree to our{" "}
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-slate-700"
                >
                  Terms
                </Button>{" "}
                and{" "}
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-slate-700"
                >
                  Privacy Policy
                </Button>
                .
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-500">
            Having trouble? Refresh the page or try a different browser profile.
          </p>
        </div>
      </div>
    </div>
  );
}
