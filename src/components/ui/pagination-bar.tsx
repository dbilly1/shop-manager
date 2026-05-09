"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─── Page number helpers ──────────────────────────────────────────────────────

/**
 * Returns the list of page-number tokens to display.
 * Numbers are page indices; `"..."` is an ellipsis gap.
 *
 * Example (page 6 of 15):  [1, "...", 5, 6, 7, "...", 15]
 * Example (5 total pages):  [1, 2, 3, 4, 5]
 */
function getPageTokens(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const tokens: (number | "...")[] = []
  const left  = Math.max(2, page - 1)
  const right = Math.min(totalPages - 1, page + 1)

  tokens.push(1)
  if (left > 2) tokens.push("...")
  for (let i = left; i <= right; i++) tokens.push(i)
  if (right < totalPages - 1) tokens.push("...")
  tokens.push(totalPages)

  return tokens
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaginationBarProps {
  /** Current 1-based page number */
  page: number
  /** Total number of pages */
  totalPages: number
  /** Total items across all pages */
  totalItems: number
  /** Items shown per page */
  pageSize: number
  /** 1-based index of the first visible item (0 when empty) */
  startIndex: number
  /** 1-based index of the last visible item */
  endIndex: number
  /** Called when the user picks a new page */
  onPageChange: (page: number) => void
  /** Called when the user picks a new page size */
  onPageSizeChange: (size: number) => void
  /**
   * Singular noun for the items being paginated.
   * Defaults to "record".  Used in "Showing 1–25 of 312 sales".
   */
  label?: string
  /** Available page-size options. Defaults to [25, 50, 100]. */
  pageSizeOptions?: number[]
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  startIndex,
  endIndex,
  onPageChange,
  onPageSizeChange,
  label = "record",
  pageSizeOptions = [25, 50, 100],
  className = "",
}: PaginationBarProps) {
  if (totalItems === 0) return null

  const tokens = getPageTokens(page, totalPages)

  // Plural label: "sale" → "sales", "entry" → "entries", etc.
  // Simple heuristic — works for all labels used in this app.
  const pluralLabel =
    totalItems === 1
      ? label
      : label.endsWith("y")
      ? label.slice(0, -1) + "ies"
      : label.endsWith("s")
      ? label
      : label + "s"

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t text-sm ${className}`}
    >
      {/* ── Left: summary + page-size selector ─────────────────────────────── */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <span>
          Showing{" "}
          <span className="font-medium text-foreground tabular-nums">
            {startIndex}–{endIndex}
          </span>{" "}
          of{" "}
          <span className="font-medium text-foreground tabular-nums">
            {totalItems}
          </span>{" "}
          {pluralLabel}
        </span>

        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs">
                {s} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Right: prev · numbers · next ────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* Prev */}
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border text-muted-foreground
                       hover:bg-muted hover:text-foreground transition-colors
                       disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Page tokens */}
          {tokens.map((token, i) =>
            token === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="inline-flex items-center justify-center w-7 h-7 text-muted-foreground select-none text-xs"
              >
                …
              </span>
            ) : (
              <button
                key={token}
                onClick={() => onPageChange(token)}
                aria-label={`Page ${token}`}
                aria-current={token === page ? "page" : undefined}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-medium
                            transition-colors
                            ${
                              token === page
                                ? "bg-primary text-primary-foreground border-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
              >
                {token}
              </button>
            ),
          )}

          {/* Next */}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border text-muted-foreground
                       hover:bg-muted hover:text-foreground transition-colors
                       disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
