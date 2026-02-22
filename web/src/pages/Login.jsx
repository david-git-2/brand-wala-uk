import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { UK_API } from "../api/ukApi";

function waitForGoogleIdentity(maxMs = 8000, stepMs = 50) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(t);
        resolve(true);
        return;
      }
      if (Date.now() - start > maxMs) {
        clearInterval(t);
        reject(new Error("Google Identity script not loaded (google.accounts.id missing)"));
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
      .join("")
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

export default function Login() {
  const { user, setUser, refreshAccess } = useAuth();
  const nav = useNavigate();

  const btnRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [err, setErr] = useState("");

  // If already logged in -> go home
  useEffect(() => {
    if (user) nav("/products", { replace: true });
  }, [user, nav]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (user) return;

      setStatus("loading");
      setErr("");

      try {
        const clientId = window.BW_CONFIG?.GOOGLE_CLIENT_ID;
        if (!clientId) throw new Error("Missing BW_CONFIG.GOOGLE_CLIENT_ID");

        await waitForGoogleIdentity();
        if (!mounted) return;

        // GIS callback must be stable
        async function handleCredentialResponse(response) {
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
              role: String(data.role || "customer").toLowerCase().trim(),
              can_see_price_gbp: !!data.can_see_price_gbp,
              active: true
            };

            if (!nextUser.email) throw new Error("Login succeeded but missing email");

            setCachedUser(nextUser);
            setUser(nextUser);

            if (refreshAccess) {
              await refreshAccess({ redirectOnFail: false });
            }

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
        }

        // Init GIS
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse
        });

        // Render button
        if (btnRef.current) {
          btnRef.current.innerHTML = "";
          google.accounts.id.renderButton(btnRef.current, {
            theme: "outline",
            size: "large",
            width: 320
          });
        }

        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setErr(String(e?.message || e));
        setStatus("error");
      }
    }

    init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  const isLoading = status === "loading";

  return (
    <div className="min-h-[calc(100vh-0px)] bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  Welcome back
                </h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Sign in with your Google account to continue.
                </p>
              </div>

              {/* Tiny status pill */}
              <span
                className={[
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                  isLoading
                    ? "bg-slate-100 text-slate-700"
                    : status === "ready"
                    ? "bg-emerald-50 text-emerald-700"
                    : status === "error"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-100 text-slate-700"
                ].join(" ")}
                aria-live="polite"
              >
                {isLoading
                  ? "Signing in…"
                  : status === "ready"
                  ? "Ready"
                  : status === "error"
                  ? "Error"
                  : "Idle"}
              </span>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Continue with Google
              </label>

              <div
                className={[
                  "flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4",
                  isLoading ? "opacity-70" : "opacity-100"
                ].join(" ")}
              >
                <div ref={btnRef} />
              </div>

              {isLoading && (
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                  <span>Signing you in…</span>
                </div>
              )}

              {status === "error" && (
                <div
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                  role="alert"
                >
                  <div className="font-medium">Couldn’t sign you in</div>
                  <div className="mt-1 break-words text-rose-700">
                    {err || "Login could not load. Please refresh."}
                  </div>
                </div>
              )}

              <div className="mt-6 text-xs leading-5 text-slate-500">
                By continuing, you agree to our{" "}
                <span className="text-slate-700">Terms</span> and{" "}
                <span className="text-slate-700">Privacy Policy</span>.
              </div>
            </div>
          </div>

          {/* Footer hint */}
          <p className="mt-6 text-center text-xs text-slate-500">
            Having trouble? Refresh the page or try a different browser profile.
          </p>
        </div>
      </div>
    </div>
  );
}