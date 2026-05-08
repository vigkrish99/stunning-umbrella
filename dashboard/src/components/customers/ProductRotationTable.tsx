"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getGasType } from "@/lib/cylinder-costs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity } from "lucide-react";
import type { PerformanceRating } from "@/lib/models/RotationMetric";

interface ProductRotationData {
  cylindersHeld: number;
  deliveries: number;
  rotationRate: number;
  performance: string;
}

interface ProductRotationTableProps {
  data: Record<string, ProductRotationData>;
}

const PRODUCT_THRESHOLD_NOTES: Record<string, string> = {
  CO2: "\u22652x = Excellent",
  O2: "\u22653x = Excellent",
  LPG: "\u22653x = Excellent",
};

export function ProductRotationTable({ data }: ProductRotationTableProps) {
  const rows = Object.entries(data ?? {})
    .map(([code, metrics]) => ({
      code,
      gasType: getGasType(code) ?? "Other",
      ...metrics,
    }))
    .sort((a, b) => b.rotationRate - a.rotationRate);

  if (rows.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Per-Product Rotation
          </CardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            {rows.length} product{rows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground pl-4">Product</TableHead>
              <TableHead className="text-muted-foreground">Gas Type</TableHead>
              <TableHead className="text-right text-muted-foreground">Held</TableHead>
              <TableHead className="text-right text-muted-foreground">Deliveries</TableHead>
              <TableHead className="text-right text-muted-foreground">Rotation</TableHead>
              <TableHead className="text-muted-foreground pr-4">Performance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.code} className="border-border">
                <TableCell className="pl-4">
                  <span className="font-mono text-sm text-foreground">{row.code}</span>
                  {PRODUCT_THRESHOLD_NOTES[row.gasType] && (
                    <span className="block text-[10px] text-muted-foreground/60">
                      {PRODUCT_THRESHOLD_NOTES[row.gasType]}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{row.gasType}</span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {row.cylindersHeld}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {row.deliveries}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {row.rotationRate.toFixed(1)}x
                </TableCell>
                <TableCell className="pr-4">
                  <StatusBadge status={row.performance as PerformanceRating} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
