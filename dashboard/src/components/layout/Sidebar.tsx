"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  Settings,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  DollarSign,
  Shield,
  RotateCw,
  FileText,
  BarChart3,
  Flame,
  Cylinder,
  ShoppingCart,
  CreditCard,
  Package,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardContext, type DashboardType } from "@/lib/contexts/DashboardContext";
import { DashboardSwitcher } from "./DashboardSwitcher";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

// ── Per-dashboard navigation ─────────────────────────────────────

const cylinderNav: NavItem[] = [
  { name: "Overview", href: "/cylinder", icon: LayoutDashboard },
  { name: "Customers", href: "/cylinder/customers", icon: Users },
  { name: "Rotation", href: "/cylinder/rotation", icon: RotateCw },
  { name: "Profit", href: "/cylinder/profit", icon: DollarSign },
  { name: "Alerts", href: "/cylinder/alerts", icon: AlertTriangle },
];

const lpgNav: NavItem[] = [
  { name: "Overview", href: "/lpg", icon: LayoutDashboard },
  { name: "Customers", href: "/lpg/customers", icon: Users },
  { name: "Rotation", href: "/lpg/rotation", icon: RotateCw },
  { name: "Holdings", href: "/lpg/holdings", icon: Package },
];

const salesNav: NavItem[] = [
  { name: "Overview", href: "/sales", icon: LayoutDashboard },
  { name: "Customers", href: "/sales/customers", icon: Users },
  { name: "Sales Reports", href: "/sales/reports", icon: BarChart3 },
  { name: "Unpaid Invoices", href: "/sales/unpaid", icon: CreditCard },
];

const dashboardNavMap: Record<DashboardType, NavItem[]> = {
  cylinder: cylinderNav,
  lpg: lpgNav,
  sales: salesNav,
};

// ── Bottom navigation (always visible) ───────────────────────────

const bottomNav: NavItem[] = [
  { name: "Orders", href: "/orders", icon: ClipboardList },
  { name: "Sync Status", href: "/sync", icon: RefreshCw },
  { name: "WhatsApp", href: "/whatsapp", icon: MessageSquare },
  { name: "Agent Roles", href: "/settings/agents", icon: Shield },
  { name: "Settings", href: "/settings", icon: Settings },
];

// ── Sidebar component ────────────────────────────────────────────

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { activeDashboard } = useDashboardContext();
  const navItems = dashboardNavMap[activeDashboard];

  const handleNavClick = () => {
    onClose?.();
  };

  function isActive(href: string): boolean {
    // Exact match for overview pages, startsWith for sub-pages
    if (href === "/cylinder" || href === "/lpg" || href === "/sales") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-56 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ease-in-out",
          "md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Image
              src="/helix-logo.png"
              alt="Helix Gases"
              width={110}
              height={16}
              className="dark:brightness-0 dark:invert opacity-90"
              priority
            />
          </div>
        </div>

        {/* Dashboard Switcher */}
        <DashboardSwitcher onNavigate={handleNavClick} />

        {/* Main Navigation */}
        <nav className="flex-1 px-2.5 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-2.5 py-3 border-t border-border/50 space-y-0.5">
          {bottomNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* User */}
        <div className="px-3 py-3 border-t border-border/50">
          <div className="flex items-center gap-2.5">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">Account</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
