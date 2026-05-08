"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerMs?: number;
}

export function StaggerContainer({ children, className, staggerMs = 50 }: StaggerContainerProps) {
  return (
    <div
      className={cn("stagger-container", className)}
      style={{ "--stagger-ms": `${staggerMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
