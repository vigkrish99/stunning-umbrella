"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/* ------------------------------------------------------------------
   Column definition
   ------------------------------------------------------------------ */
export interface DataTableColumn<T> {
  /** Unique key for this column */
  id: string;
  /** Header label */
  header: string;
  /** Accessor function to pull the cell value from a row */
  accessor: (row: T) => unknown;
  /** Optional custom cell renderer */
  cell?: (row: T) => React.ReactNode;
  /** Whether the column is sortable (default: false) */
  sortable?: boolean;
  /** Whether to apply font-mono tabular-nums (for numbers) */
  numeric?: boolean;
  /** Optional className for the cell */
  className?: string;
}

/* ------------------------------------------------------------------
   Sort state
   ------------------------------------------------------------------ */
type SortDirection = "asc" | "desc";

interface SortState {
  columnId: string;
  direction: SortDirection;
}

/* ------------------------------------------------------------------
   Props
   ------------------------------------------------------------------ */
interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Number of skeleton rows to show while loading */
  loading?: boolean;
  loadingRows?: number;
  /** Message to show when data is empty */
  emptyMessage?: string;
  /** Default sort column and direction */
  defaultSort?: SortState;
  /** Enable pagination */
  paginated?: boolean;
  /** Page sizes to offer (default: [10, 25, 50]) */
  pageSizes?: number[];
  /** Default page size (default: 10) */
  defaultPageSize?: number;
  /** Row key extractor */
  rowKey?: (row: T, index: number) => string | number;
  /** Optional className for the wrapper */
  className?: string;
  /** Optional mobile card renderer — shown on screens < md, table hidden */
  mobileCard?: (row: T) => React.ReactNode;
}

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */
export function DataTable<T>({
  columns,
  data,
  loading = false,
  loadingRows = 5,
  emptyMessage = "No data available",
  defaultSort,
  paginated = false,
  pageSizes = [10, 25, 50],
  defaultPageSize = 10,
  rowKey,
  className,
  mobileCard,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | undefined>(defaultSort);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  /* ---------- Sorting ---------- */
  const handleSort = useCallback(
    (columnId: string) => {
      setSort((prev) => {
        if (prev?.columnId === columnId) {
          return prev.direction === "asc"
            ? { columnId, direction: "desc" }
            : undefined; // Clear sort on third click
        }
        return { columnId, direction: "asc" };
      });
      setPage(0);
    },
    []
  );

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col) return data;

    return [...data].sort((a, b) => {
      const aVal = col.accessor(a);
      const bVal = col.accessor(b);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison: number;
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sort, columns]);

  /* ---------- Pagination ---------- */
  const totalPages = paginated ? Math.ceil(sortedData.length / pageSize) : 1;
  const pagedData = paginated
    ? sortedData.slice(page * pageSize, (page + 1) * pageSize)
    : sortedData;

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      setPage(0);
    },
    []
  );

  /* ---------- Sort icon ---------- */
  const SortIcon = ({ columnId }: { columnId: string }) => {
    if (sort?.columnId !== columnId) {
      return <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 text-muted-foreground/50" />;
    }
    return sort.direction === "asc" ? (
      <ChevronUp className="ml-1 inline h-3.5 w-3.5 text-[oklch(0.65_0.15_50)]" />
    ) : (
      <ChevronDown className="ml-1 inline h-3.5 w-3.5 text-[oklch(0.65_0.15_50)]" />
    );
  };

  /* ---------- Loading skeleton ---------- */
  if (loading) {
    return (
      <div className={cn("rounded-lg border border-border bg-card", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: loadingRows }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.id}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ---------- Empty state ---------- */
  if (data.length === 0) {
    return (
      <div className={cn("rounded-lg border border-border bg-card", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ---------- Pagination footer (shared between mobile & desktop) ---------- */
  const paginationFooter = paginated && totalPages > 1 && (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          className="rounded border border-border bg-secondary px-2 py-1 text-sm text-foreground outline-none"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span>
          {page * pageSize + 1}
          {"\u2013"}
          {Math.min((page + 1) * pageSize, sortedData.length)} of{" "}
          {sortedData.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded px-2 py-1 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded px-2 py-1 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  /* ---------- Data table ---------- */
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {/* Mobile card view */}
      {mobileCard && (
        <div className="md:hidden divide-y divide-border">
          {pagedData.map((row, idx) => (
            <div key={rowKey ? rowKey(row, idx) : idx}>
              {mobileCard(row)}
            </div>
          ))}
          {paginationFooter}
        </div>
      )}

      {/* Desktop table view */}
      <div className={mobileCard ? "hidden md:block" : undefined}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    col.sortable && "cursor-pointer select-none hover:text-foreground",
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.id) : undefined}
                >
                  {col.header}
                  {col.sortable && <SortIcon columnId={col.id} />}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedData.map((row, idx) => (
              <TableRow key={rowKey ? rowKey(row, idx) : idx}>
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    className={cn(
                      col.numeric && "font-mono tabular-nums",
                      col.className
                    )}
                  >
                    {col.cell ? col.cell(row) : String(col.accessor(row) ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {paginationFooter}
      </div>
    </div>
  );
}
