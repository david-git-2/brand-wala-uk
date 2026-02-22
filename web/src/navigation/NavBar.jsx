// ============================
// src/navigation/NavBar.jsx
// Modern BW Navigation (role-aware + account popup + mobile hamburger drawer)
// ============================

import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import config from "./navConfig.json";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function MenuIcon({ open }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={cx(
          "h-0.5 w-6 rounded bg-slate-900 transition",
          open ? "translate-y-2 rotate-45" : ""
        )}
      />
      <span
        className={cx(
          "h-0.5 w-6 rounded bg-slate-900 transition",
          open ? "opacity-0" : "opacity-100"
        )}
      />
      <span
        className={cx(
          "h-0.5 w-6 rounded bg-slate-900 transition",
          open ? "-translate-y-2 -rotate-45" : ""
        )}
      />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="8"
        r="4"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function Backdrop({ open, onClick }) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden="true"
    />
  );
}

function Drawer({ open, children }) {
  return (
    <div
      className={cx(
        "fixed right-0 top-0 z-50 h-full w-[86%] max-w-sm transform border-l border-slate-200 bg-white shadow-2xl transition duration-300",
        open ? "translate-x-0" : "translate-x-full"
      )}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const role = String(user?.role || "customer").toLowerCase();

  // role-based link filtering
  const links = useMemo(() => {
    const all = config?.links || [];
    return all.filter((l) => {
      const roles = Array.isArray(l.roles)
        ? l.roles.map((r) => String(r).toLowerCase())
        : null;
      if (!roles || roles.length === 0) return true; // public
      return roles.includes(role);
    });
  }, [role]);

  // close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  // close account popover on outside click / escape
  const popRef = useRef(null);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setAccountOpen(false);
        setMobileOpen(false);
      }
    }
    function onClick(e) {
      if (!popRef.current) return;
      if (accountOpen && !popRef.current.contains(e.target)) setAccountOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [accountOpen]);

  const email = user?.email || "";
  const name = user?.name || "";
  const canSeePrice = !!user?.can_see_price_gbp;

  return (
    <>
      {/* Top floating nav container */}
      <div className="sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <nav className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between px-4 py-3 sm:px-5">
              {/* Left: Brand */}
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-extrabold tracking-tight text-white">
                  {config?.brand || "BW"}
                </div>
              </div>

              {/* Middle: Desktop links */}
              <div className="hidden flex-1 items-center justify-center md:flex">
                <div className="flex items-center gap-2 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
                  {links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        cx(
                          "rounded-full px-4 py-2 text-sm font-semibold transition",
                          isActive
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                            : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>

              {/* Right: Account + Mobile hamburger */}
              <div className="flex items-center gap-2">
                {/* Account button */}
                <div className="relative" ref={popRef}>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50",
                      accountOpen ? "ring-2 ring-slate-300" : ""
                    )}
                    title="Account"
                  >
                    <UserIcon />
                    <span className="hidden max-w-[180px] truncate sm:inline">
                      {email || "Account"}
                    </span>
                  </button>

                  {/* Account popover */}
                  {accountOpen && (
                    <div className="absolute right-0 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <div className="bg-slate-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Logged in
                        </div>
                        <div className="mt-1 truncate text-sm font-bold text-slate-900">
                          {email || "—"}
                        </div>
                        {name ? (
                          <div className="mt-1 truncate text-sm text-slate-600">
                            {name}
                          </div>
                        ) : null}
                      </div>

                      <div className="px-4 py-3 text-sm text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Role</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {role}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-slate-500">Can see price</span>
                          <span className="text-sm font-semibold text-slate-900">
                            {canSeePrice ? "Yes" : "No"}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-200 p-3">
                        <button
                          onClick={logout}
                          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile hamburger */}
                <button
                  onClick={() => setMobileOpen(true)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:bg-slate-50 md:hidden"
                  aria-label="Open menu"
                >
                  <MenuIcon open={mobileOpen} />
                </button>
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile Drawer */}
      <Backdrop open={mobileOpen} onClick={() => setMobileOpen(false)} />
      <Drawer open={mobileOpen}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-extrabold tracking-tight text-white">
                {config?.brand || "BW"}
              </div>
              <div className="text-sm font-semibold text-slate-700">Menu</div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="space-y-2">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cx(
                      "block rounded-2xl px-4 py-3 text-sm font-semibold transition",
                      isActive
                        ? "bg-slate-900 text-white"
                        : "bg-slate-50 text-slate-800 hover:bg-slate-100"
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>

            {/* Account card */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account
              </div>
              <div className="mt-2 truncate text-sm font-bold text-slate-900">
                {email || "—"}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {role}
                </span>
                <span className="text-xs text-slate-500">
                  Price: {canSeePrice ? "Yes" : "No"}
                </span>
              </div>

              <button
                onClick={logout}
                className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}