// ============================
// src/navigation/NavBar.jsx
// SHADCN + THEME COLORS (role-aware + account dropdown + mobile sheet)
// ============================

import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import config from "./navConfig.json";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// icons
import { Menu, User, LogOut } from "lucide-react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  const role = String(user?.role || "customer").toLowerCase();

  const links = useMemo(() => {
    const all = config?.links || [];
    return all.filter((l) => {
      const roles = Array.isArray(l.roles)
        ? l.roles.map((r) => String(r).toLowerCase())
        : null;
      if (!roles || roles.length === 0) return true;
      return roles.includes(role);
    });
  }, [role]);

  // close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const email = user?.email || "";
  const name = user?.name || "";
  const canSeePrice = !!user?.can_see_price_gbp;

  return (
    <div className="sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <nav className="rounded-2xl border border-border bg-background/80 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            {/* Left: Brand */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary px-3 py-1.5 text-sm font-extrabold tracking-tight text-primary-foreground">
                {config?.brand || "BW"}
              </div>
            </div>

            {/* Middle: Desktop links */}
            <div className="hidden flex-1 items-center justify-center md:flex">
              <div className="flex items-center gap-2 rounded-full bg-muted p-1 ring-1 ring-border">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      cx(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        isActive
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/70",
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
              {/* Account dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden max-w-[180px] truncate sm:inline">
                      {email || "Account"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="w-[320px] rounded-2xl"
                >
                  <DropdownMenuLabel className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Logged in
                    </div>
                    <div className="truncate text-sm font-bold text-foreground">
                      {email || "—"}
                    </div>
                    {name ? (
                      <div className="truncate text-sm font-normal text-muted-foreground">
                        {name}
                      </div>
                    ) : null}
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  <div className="px-2 py-1.5 text-sm">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-muted-foreground">Role</span>
                      <Badge variant="secondary" className="rounded-full">
                        {role}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-muted-foreground">
                        Can see pound price
                      </span>
                      <span className="font-semibold text-foreground">
                        {canSeePrice ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile hamburger (Sheet) */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-xl md:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>

                <SheetContent side="right" className="w-[86%] max-w-sm p-0">
                  <SheetHeader className="border-b border-border px-4 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-primary px-3 py-1.5 text-sm font-extrabold tracking-tight text-primary-foreground">
                          {config?.brand || "BW"}
                        </div>
                        <SheetTitle className="text-sm font-semibold text-foreground">
                          Menu
                        </SheetTitle>
                      </div>
                    </div>
                  </SheetHeader>

                  <div className="flex h-full flex-col">
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
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground hover:bg-muted/80",
                              )
                            }
                          >
                            {link.label}
                          </NavLink>
                        ))}
                      </div>

                      <Separator className="my-6" />

                      {/* Account card */}
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Account
                        </div>

                        <div className="mt-2 truncate text-sm font-bold text-foreground">
                          {email || "—"}
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="secondary" className="rounded-full">
                            {role}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Price: {canSeePrice ? "Yes" : "No"}
                          </span>
                        </div>

                        <Button
                          variant="destructive"
                          className="mt-4 w-full rounded-xl gap-2"
                          onClick={logout}
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
