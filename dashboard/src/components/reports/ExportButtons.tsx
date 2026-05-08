"use client";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { exportCSV, exportPDF } from "@/lib/hooks/useExport";
import { useState } from "react";

interface ExportButtonsProps {
  type: string;
  filters?: Record<string, string>;
}

export function ExportButtons({ type, filters }: ExportButtonsProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: "csv" | "pdf") => {
    setExporting(format);
    setError(null);
    try {
      if (format === "csv") {
        await exportCSV(type, filters);
      } else {
        await exportPDF(type, filters);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Export failed. Please try again.";
      setError(message);
      console.error(`Export ${format.toUpperCase()} error:`, err);
      // Auto-clear the error after 5 seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("csv")}
        disabled={!!exporting}
        className="border-border text-muted-foreground hover:text-foreground"
      >
        <Download className="w-4 h-4 mr-1" />
        {exporting === "csv" ? "Exporting..." : "CSV"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("pdf")}
        disabled={!!exporting}
        className="border-border text-muted-foreground hover:text-foreground"
      >
        <FileText className="w-4 h-4 mr-1" />
        {exporting === "pdf" ? "Exporting..." : "PDF"}
      </Button>
      {error && (
        <span className="text-sm text-destructive ml-2">{error}</span>
      )}
    </div>
  );
}
