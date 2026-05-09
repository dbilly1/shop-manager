import { useState, useMemo, useEffect, useRef } from "react"

export interface UsePaginationReturn<T> {
  /** Slice of data for the current page */
  paginatedData: T[]
  /** 1-based current page number */
  page: number
  setPage: (page: number) => void
  /** Number of items per page */
  pageSize: number
  /** Change page size and reset to page 1 */
  setPageSize: (size: number) => void
  /** Total number of pages */
  totalPages: number
  /** Total number of items in the source array */
  totalItems: number
  /** 1-based index of the first item on the current page (0 when list is empty) */
  startIndex: number
  /** 1-based index of the last item on the current page */
  endIndex: number
}

/**
 * Generic client-side pagination hook.
 *
 * @param data        The full (possibly filtered) array to paginate.
 * @param defaultPageSize  Initial page size (default 25).
 *
 * Automatically resets to page 1 whenever the length of `data` changes
 * (i.e. the user applies a search / filter).
 */
export function usePagination<T>(
  data: T[],
  defaultPageSize = 25,
): UsePaginationReturn<T> {
  const [page, setPageRaw] = useState(1)
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize)

  // Reset to page 1 when the source data length changes (filter applied)
  const prevLength = useRef(data.length)
  useEffect(() => {
    if (data.length !== prevLength.current) {
      prevLength.current = data.length
      setPageRaw(1)
    }
  }, [data.length])

  const totalItems = data.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Clamp so we never go past the last page
  const safePage = Math.min(page, totalPages)

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, safePage, pageSize])

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIndex = Math.min(safePage * pageSize, totalItems)

  function setPage(p: number) {
    setPageRaw(Math.max(1, Math.min(p, totalPages)))
  }

  function setPageSize(size: number) {
    setPageSizeRaw(size)
    setPageRaw(1)
  }

  return {
    paginatedData,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  }
}
