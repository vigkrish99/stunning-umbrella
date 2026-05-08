"use client";

import Link from "next/link";
import { ArrowLeft, Phone, Mail, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PerformanceRating } from "@/lib/models/RotationMetric";

interface CustomerHeaderProps {
  name: string;
  customerId: string;
  trackaboutMid?: string;
  zohoContactId?: string;
  contactInfo?: {
    phone?: string;
    email?: string;
  };
  performance?: PerformanceRating;
  isActive?: boolean;
}

export function CustomerHeader({
  name,
  customerId,
  trackaboutMid,
  zohoContactId,
  contactInfo,
  performance,
  isActive = true,
}: CustomerHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link href="/customers">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          All Customers
        </Button>
      </Link>

      {/* Name row */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-light text-foreground tracking-tight">
              {name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                isActive
                  ? "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* ID badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="font-mono text-xs text-muted-foreground border-border"
            >
              <Hash className="w-3 h-3 mr-1" />
              {customerId}
            </Badge>
            {trackaboutMid && (
              <Badge
                variant="outline"
                className="font-mono text-xs text-muted-foreground border-border"
              >
                TA: {trackaboutMid}
              </Badge>
            )}
            {zohoContactId && (
              <Badge
                variant="outline"
                className="font-mono text-xs text-muted-foreground border-border"
              >
                Zoho: {zohoContactId}
              </Badge>
            )}
          </div>

          {/* Contact info */}
          {contactInfo && (contactInfo.phone || contactInfo.email) && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {contactInfo.phone && (
                <a
                  href={`tel:${contactInfo.phone}`}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {contactInfo.phone}
                </a>
              )}
              {contactInfo.email && (
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {contactInfo.email}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Performance badge (large) */}
        {performance && (
          <div className="pt-1">
            <StatusBadge status={performance} className="text-sm px-3 py-1" />
          </div>
        )}
      </div>
    </div>
  );
}
