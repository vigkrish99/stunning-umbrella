"use client";

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

interface Invoice {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  status: string;
  lineItems?: Array<Record<string, unknown>>;
}

interface InvoiceTableProps {
  invoices: Invoice[];
}

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  paid: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)]",
  sent: "bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)]",
  overdue: "bg-[oklch(0.45_0.08_15)]/10 text-[oklch(0.45_0.08_15)]",
  draft: "bg-muted text-muted-foreground",
  void: "bg-muted text-muted-foreground",
  partially_paid: "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)]",
};

function formatINR(amount: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function InvoiceTable({ invoices }: InvoiceTableProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));

  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return invoices.slice(start, start + PAGE_SIZE);
  }, [invoices, page]);

  if (invoices.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Invoice History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No invoices found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Invoice History
          </CardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground pl-6">
                Invoice #
              </TableHead>
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-right text-muted-foreground">
                Amount
              </TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground pr-6">
                Items
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedInvoices.map((invoice) => (
              <TableRow key={invoice.invoiceId} className="border-border">
                <TableCell className="pl-6">
                  <span className="font-mono text-sm text-foreground">
                    {invoice.invoiceNumber}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {invoice.date ? format(parseISO(invoice.date), "dd MMM yyyy") : "N/A"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {formatINR(invoice.amount)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                      statusColors[invoice.status?.toLowerCase()] ??
                      statusColors.draft
                    }`}
                  >
                    {invoice.status?.replace(/_/g, " ") ?? "Unknown"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground pr-6">
                  {invoice.lineItems?.length ?? 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}--
              {Math.min(page * PAGE_SIZE, invoices.length)} of{" "}
              {invoices.length}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="flex items-center px-2 text-xs text-muted-foreground font-mono">
                {page}/{totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-muted-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
