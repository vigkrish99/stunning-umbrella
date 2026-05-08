"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardContext, type DashboardType } from "@/lib/contexts/DashboardContext";
import { cn } from "@/lib/utils";
import { Cylinder, Flame, BarChart3, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface DashboardOption {
  id: DashboardType;
  label: string;
  icon: LucideIcon;
  href: string;
  color: string;
}

const DASHBOARD_OPTIONS: DashboardOption[] = [
  {
    id: "cylinder",
    label: "Cylinder",
    icon: Cylinder,
    href: "/cylinder",
    color: "oklch(0.65 0.15 50)",
  },
  {
    id: "lpg",
    label: "LPG",
    icon: Flame,
    href: "/lpg",
    color: "oklch(0.70 0.12 85)",
  },
  {
    id: "sales",
    label: "Sales",
    icon: BarChart3,
    href: "/sales",
    color: "oklch(0.55 0.08 200)",
  },
];

interface DashboardSwitcherProps {
  onNavigate?: () => void;
}

export function DashboardSwitcher({ onNavigate }: DashboardSwitcherProps) {
  const { activeDashboard } = useDashboardContext();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = DASHBOARD_OPTIONS.find((d) => d.id === activeDashboard) ?? DASHBOARD_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(option: DashboardOption) {
    setIsOpen(false);
    if (option.id !== activeDashboard) {
      router.push(option.href);
      onNavigate?.();
    }
  }

  return (
    <div ref={containerRef} className="relative px-2.5 py-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          "bg-secondary/50 hover:bg-secondary text-foreground"
        )}
      >
        <active.icon
          className="w-4 h-4 flex-shrink-0"
          style={{ color: active.color }}
        />
        <span className="flex-1 text-left truncate">{active.label}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute left-2.5 right-2.5 top-full mt-1 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {DASHBOARD_OPTIONS.map((option) => {
            const isActive = option.id === activeDashboard;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <option.icon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: isActive ? active.color : undefined }}
                />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
