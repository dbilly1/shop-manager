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
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  startIndex: number
  endIndex: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  label?: string
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

  const pluralLabel =
    totalItems === 1
      ? label
      : label.endsWith("y")
      ? label.slice(0, -1) + "ies"
      : label.endsWith("s")
      ? label
      : label + "s"

  // Capitalise first letter for the "per page" label
  const perPageLabel = pluralLabel.charAt(0).toUpperCase() + pluralLabel.slice(1)

  return (
    <div
      className={`grid grid-cols-3 items-center gap-2 px-4 py-3 border-t text-sm w-full bg-background ${className}`}
    >
      {/* ── Left: showing text ─────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
        Showing{" "}
        <span className="font-medium text-foreground tabular-nums">{startIndex}–{endIndex}</span>
        {" "}of{" "}
        <span className="font-medium text-foreground tabular-nums">{totalItems}</span>
      </p>
      {/* On mobile, take up space so center stays centered */}
      <span className="sm:hidden" />

      {/* ── Center: prev · numbers · next ──────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground
                     hover:bg-muted hover:text-foreground transition-colors
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

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
              className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-medium transition-colors
                          ${
                            token === page
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
            >
              {token}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground
                     hover:bg-muted hover:text-foreground transition-colors
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Right: per-page selector ────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
          {perPageLabel} per page
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-[60px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {pageSizeOptions.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
