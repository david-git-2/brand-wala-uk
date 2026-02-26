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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  Menu,
  X,
  LogOut,
  ChevronDown,
  Boxes,
  ShoppingCart,
  ClipboardList,
  Truck,
  Users,
  Info,
  Landmark,
  BadgeDollarSign,
} from "lucide-react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function navIcon(label) {
  const l = String(label || "").toLowerCase();
  if (l.includes("product")) return Boxes;
  if (l.includes("cart")) return ShoppingCart;
  if (l.includes("order")) return ClipboardList;
  if (l.includes("shipment")) return Truck;
  if (l.includes("user")) return Users;
  if (l.includes("account")) return BadgeDollarSign;
  if (l.includes("investor")) return Landmark;
  if (l.includes("about")) return Info;
  return ClipboardList;
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  const role = String(user?.role || "customer").toLowerCase();
  const canUseCart = !!user?.can_use_cart && role !== "customer";

  const links = useMemo(() => {
    const all = config?.links || [];
    return all.filter((l) => {
      if (String(l?.to || "") === "/cart" && !canUseCart) return false;
      const roles = Array.isArray(l.roles)
        ? l.roles.map((r) => String(r).toLowerCase())
        : null;
      if (!roles || roles.length === 0) return true;
      return roles.includes(role);
    });
  }, [canUseCart, role]);

  // close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const email = user?.email || "";
  const name = user?.name || "";
  const photoUrl = user?.photo_url || "";
  const fallbackText = (name || email || "U").trim().slice(0, 1).toUpperCase();
  const fullLogoSrc = `${import.meta.env.BASE_URL}logo/BW%20logo%20full.png`;

  return (
    <div className="sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <nav className="rounded-2xl border border-border/70 bg-card/95 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            {/* Left: Brand */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-border bg-muted px-2 py-2">
                <img
                  src={fullLogoSrc}
                  alt="BW full"
                  className="h-8 w-auto object-contain"
                />
              </div>
            </div>

            {/* Middle: Desktop links */}
            <div className="hidden flex-1 items-center justify-center lg:flex">
              <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/70 p-1">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      cx(
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                        isActive
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                      )
                    }
                  >
                    {(() => {
                      const Icon = navIcon(link.label);
                      return <Icon className="h-4 w-4" />;
                    })()}
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
                  <Button variant="outline" className="h-10 rounded-xl gap-2 px-2.5">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={photoUrl} alt={name || email || "User"} referrerPolicy="no-referrer" />
                      <AvatarFallback className="text-[10px]">{fallbackText}</AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="w-[320px] rounded-2xl"
                >
                  <DropdownMenuLabel className="space-y-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={photoUrl} alt={name || email || "User"} referrerPolicy="no-referrer" />
                        <AvatarFallback>{fallbackText}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-foreground">{name || "User"}</div>
                        <div className="truncate text-xs text-muted-foreground">{email || "—"}</div>
                      </div>
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Logged in
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  <div className="px-2 py-1.5 text-sm">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-muted-foreground">Role</span>
                      <Badge variant="secondary" className="rounded-full">
                        {role}
                      </Badge>
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
                    className="rounded-xl lg:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>

                <SheetContent side="right" className="w-[86%] max-w-sm p-0 [&>button]:hidden">
                  <SheetHeader className="border-b border-border px-4 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-border bg-muted px-2 py-2">
                          <img
                            src={fullLogoSrc}
                            alt="BW full"
                            className="h-7 w-auto object-contain"
                          />
                        </div>
                        <SheetTitle className="text-sm font-semibold text-foreground">
                          Menu
                        </SheetTitle>
                      </div>
                      <Button
                        variant="default"
                        size="icon"
                        className="rounded-xl"
                        aria-label="Close menu"
                        onClick={() => setMobileOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
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
                                "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground hover:bg-muted/80",
                              )
                            }
                          >
                            {(() => {
                              const Icon = navIcon(link.label);
                              return <Icon className="h-4 w-4" />;
                            })()}
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
