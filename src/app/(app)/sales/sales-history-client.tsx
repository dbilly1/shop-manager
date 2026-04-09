"use client"

import { useState } from "react"
import Link from "next/link"
import { LinkButton } from "@/components/ui/link-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatDate } from "@/utils/format"
import { Plus, Search, ChevronRight } from "lucide-react"
import type { SessionContext } from "@/types"

interface DailySummary {
  sale_date: string
  total: number
  cash: number
  mobile: number
  credit: number
  count: number
}

interface Props {
  summaries: DailySummary[]
  currency: string
  session: SessionContext
}

export function SalesHistoryClient({ summaries, currency, session }: Props) {
  const [search, setSearch] = useState("")

  const filtered = summaries.filter((s) =>
    s.sale_date.includes(search) || formatDate(s.sale_date).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Sales</h1>
        <div className="flex gap-2">
          <LinkButton href="/sales/bulk" size="sm" variant="outline">Bulk Entry</LinkButton>
          <LinkButton href="/sales/new" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Sale
          </LinkButton>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by date..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm text-muted-foreground">Daily Summary</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No sales recorded yet</p>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <Link
                  key={s.sale_date}
                  href={`/sales/${s.sale_date}`}
                  className="flex items-center justify-between py-3 hover:bg-muted/50 px-2 -mx-2 rounded transition-colors group"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{formatDate(s.sale_date)}</p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>{s.count} txns</span>
                      {s.cash > 0 && <span>Cash: {formatCurrency(s.cash, currency)}</span>}
                      {s.mobile > 0 && <span>Mobile: {formatCurrency(s.mobile, currency)}</span>}
                      {s.credit > 0 && <span>Credit: {formatCurrency(s.credit, currency)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{formatCurrency(s.total, currency)}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
