"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DashboardProvider } from "@/lib/contexts/DashboardContext";
import { Menu } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <DashboardProvider>
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="md:pl-56">
        {/* Top bar — frosted glass */}
        <div className="h-16 border-b border-border/50 flex items-center justify-between px-4 md:px-8 bg-background/60 backdrop-blur-xl sticky top-0 z-40">
          <button
            type="button"
            className="md:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
    </DashboardProvider>
  );
}
