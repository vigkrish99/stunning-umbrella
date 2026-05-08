"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type DashboardType = "cylinder" | "lpg" | "sales";

interface DashboardContextValue {
  activeDashboard: DashboardType;
}

const DashboardContext = createContext<DashboardContextValue>({
  activeDashboard: "cylinder",
});

export function useDashboardContext() {
  return useContext(DashboardContext);
}

function inferDashboard(pathname: string): DashboardType {
  if (pathname.startsWith("/lpg")) return "lpg";
  if (pathname.startsWith("/sales")) return "sales";
  return "cylinder";
}

interface DashboardProviderProps {
  children: ReactNode;
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const pathname = usePathname();
  const value = useMemo(
    () => ({ activeDashboard: inferDashboard(pathname) }),
    [pathname]
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
