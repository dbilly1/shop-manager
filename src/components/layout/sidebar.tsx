"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import {
  canViewReports,
  canManageInventory,
  canViewAuditLog,
  canManageCredit,
  canInitiateTransfers,
} from "@/lib/permissions";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  CreditCard,
  Sliders,
  ArrowLeftRight,
  Scale,
  BarChart3,
  Bell,
  ClipboardList,
  Users,
  UserCircle,
  Settings,
  Building2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  show?: boolean;
}

export function Sidebar({
  shopName,
  shopLogo,
  shopColour,
}: {
  shopName: string;
  shopLogo?: string | null;
  shopColour?: string | null;
}) {
  const pathname = usePathname();
  const { role } = useSession();

  if (!role) return null;

  // Derive sidebar bg: same hue/saturation as shop colour, L=18%
  function hexToHsl(hex: string): [number, number, number] | null {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  const sidebarStyle = (() => {
    if (!shopColour) return {};
    const hsl = hexToHsl(shopColour);
    if (!hsl) return {};
    const [h, s] = hsl;
    return {
      backgroundColor: `hsl(${h} ${s}% 8%)`,
      borderColor: `hsl(${h} ${s}% 25%)`,
      color: "#fff",
    };
  })();

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/sales", label: "Sales", icon: ShoppingCart },
    {
      href: "/inventory",
      label: "Inventory",
      icon: Package,
      show: canManageInventory(role),
    },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    {
      href: "/credit",
      label: "Credit",
      icon: CreditCard,
      show: canManageCredit(role),
    },
    { href: "/adjustments", label: "Adjustments", icon: Sliders },
    {
      href: "/transfers",
      label: "Transfers",
      icon: ArrowLeftRight,
      show: canInitiateTransfers(role),
    },
    { href: "/reconciliation", label: "Reconciliation", icon: Scale },
    {
      href: "/reports",
      label: "Reports",
      icon: BarChart3,
      show: canViewReports(role),
    },
    { href: "/alerts", label: "Alerts", icon: Bell },
    {
      href: "/audit",
      label: "Audit Log",
      icon: ClipboardList,
      show: canViewAuditLog(role),
    },
    { href: "/users", label: "Users", icon: Users },
    { href: "/customers", label: "Customers", icon: UserCircle },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0 border-r bg-background h-screen sticky top-0"
      style={sidebarStyle}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-4 border-b",
          shopColour ? "border-white/10" : "",
        )}
      >
        {shopLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shopLogo}
            alt={shopName}
            className="h-7 w-7 rounded object-cover"
          />
        ) : (
          <Building2
            className={cn("h-6 w-6 shrink-0", shopColour ? "text-white" : "")}
          />
        )}
        <span
          className={cn(
            "font-semibold text-sm truncate",
            shopColour ? "text-white" : "",
          )}
        >
          {shopName}
        </span>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-2">
        <nav className="px-2 space-y-0.5">
          {nav
            .filter((item) => item.show !== false)
            .map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const hsl = shopColour ? hexToHsl(shopColour) : null;
              const activeStyle =
                shopColour && active && hsl
                  ? {
                      backgroundColor: `hsl(${hsl[0]} ${hsl[1]}% 35%)`,
                      color: "#fff",
                    }
                  : {};
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    shopColour
                      ? active
                        ? ""
                        : "text-white/80 hover:text-white hover:bg-white/10"
                      : active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  style={activeStyle}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
