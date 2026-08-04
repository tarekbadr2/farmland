"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, TriangleAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Keep it pure — the table re-renders on every sort. */
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "start" | "end" | "center";
  className?: string;
  /** Hidden below `lg` to keep phone tables readable. */
  secondary?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  onRowClick,
  sortKey,
  sortDir,
  onSort,
  page,
  pageSize,
  total,
  onPageChange,
  mobileCard,
  emptyLabel,
  emptyHint,
  error,
  onRetry,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  mobileCard?: (row: T) => React.ReactNode;
  emptyLabel?: string;
  emptyHint?: string;
  /** The query failed — show a distinct error state, never an empty one (an
   *  errored list that looks empty reads as data loss). */
  error?: boolean;
  onRetry?: () => void;
}) {
  const { t, locale, formatNumber } = useI18n();
  const ar = locale === "ar";
  const totalPages = total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <p className="text-[14px] font-medium">
          {ar ? "تعذّر تحميل البيانات" : "Couldn't load this data"}
        </p>
        <p className="max-w-xs text-[12px] text-muted-foreground">
          {ar
            ? "هذه ليست قائمة فارغة — فشل التحميل. تحقّق من الاتصال."
            : "This isn't empty — the load failed. Check your connection."}
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        )}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Inbox className="size-5" />
        </span>
        <p className="text-[14px] font-medium">{emptyLabel ?? t("common.noResults")}</p>
        <p className="max-w-xs text-[12px] text-muted-foreground">
          {emptyHint ?? t("common.noResultsHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Phone: purpose-built cards. A 12-column table on a 375px screen is a lie. */}
      {mobileCard && (
        <div className="space-y-2 md:hidden">
          {rows.map((row, i) => (
            <motion.button
              key={row.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.2) }}
              onClick={() => onRowClick?.(row)}
              className="w-full rounded-xl border border-border bg-card p-3 text-start transition active:scale-[0.99]"
            >
              {mobileCard(row)}
            </motion.button>
          ))}
        </div>
      )}

      <div className={cn(mobileCard && "hidden md:block")}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.align === "end" && "text-end",
                    col.align === "center" && "text-center",
                    col.secondary && "hidden lg:table-cell",
                    col.className,
                  )}
                >
                  {col.sortable && onSort ? (
                    <button
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      {col.header}
                      {sortKey === col.key &&
                        (sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        ))}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === "end" && "text-end",
                      col.align === "center" && "text-center",
                      col.secondary && "hidden lg:table-cell",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {onPageChange && page && pageSize && total !== undefined && total > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3 py-2.5">
          <p className="text-[12px] text-muted-foreground tabular">
            {formatNumber((page - 1) * pageSize + 1)}–
            {formatNumber(Math.min(page * pageSize, total))} {t("common.of")}{" "}
            {formatNumber(total)}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label={t("common.previous")}
            >
              <ChevronLeft className="rtl:-scale-x-100" />
            </Button>
            <span className="px-1 text-[12px] tabular">
              {formatNumber(page)} / {formatNumber(totalPages)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label={t("common.next")}
            >
              <ChevronRight className="rtl:-scale-x-100" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
