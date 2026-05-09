"use client"

import { forwardRef } from "react"
import { formatCurrency } from "@/utils/format"

// ─── Shared sale data shape ───────────────────────────────────────────────────

export interface ReceiptSaleData {
  id: string
  saleDate: string
  createdAt: string
  paymentMethod: string
  totalAmount: number          // tax-inclusive grand total (what customer paid)
  recordedByName: string | null
  notes: string | null
  branchId: string
  // Snapshot of taxes applied at checkout — empty for sales with no taxes
  taxesSnapshot: { label: string; rate: number; amount: number }[]
  items: {
    productName: string
    unitType: string
    quantity: number
    unitPrice: number
    discountAmount: number
    lineTotal: number
  }[]
}

export interface ReceiptConfig {
  title: string
  header: string
  footer: string
  format: "a4" | "thermal_58" | "thermal_80"
  showLogo: boolean
  showBranch: boolean          // toggle branch name / address display
  shopName: string
  shopLogoUrl: string | null
  branchName: string | null
  branchAddress: string | null
  currency: string
  receiptPrefix: string        // e.g. "INV-" → "#INV-AB1234C5DE"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(saleDate: string, createdAt: string) {
  const d = new Date(saleDate + "T00:00:00")
  const t = new Date(createdAt)
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  )
}

function fmtPayment(method: string) {
  if (method === "cash") return "Cash"
  if (method === "mobile_money" || method === "mobile") return "Mobile Money"
  if (method === "credit") return "Credit"
  return method
}

function fmtQty(qty: number, unitType: string) {
  return unitType === "kg" ? `${qty % 1 === 0 ? qty : qty.toFixed(3)} kg` : `${qty}`
}

// ─── A4 Receipt ───────────────────────────────────────────────────────────────

function A4Receipt({ sale, cfg }: { sale: ReceiptSaleData; cfg: ReceiptConfig }) {
  const fc = (n: number) => formatCurrency(n, cfg.currency)
  const discount = sale.items.reduce((s, i) => s + i.discountAmount, 0)

  // Taxes come from the snapshot recorded at checkout
  const taxLines = (sale.taxesSnapshot ?? []).filter((t) => t.amount > 0)
  const taxesTotal = taxLines.reduce((s, t) => s + t.amount, 0)

  // sale.totalAmount is already the tax-inclusive grand total
  const grandTotal = sale.totalAmount
  // Pre-tax subtotal = grand total minus taxes
  const subtotalBeforeTax = grandTotal - taxesTotal

  return (
    <div className="bg-white text-black font-sans w-full max-w-[210mm] mx-auto">
      {/* Shop header */}
      <div className="px-8 pt-8 pb-5 border-b border-gray-200">
        {cfg.showLogo && cfg.shopLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfg.shopLogoUrl} alt={cfg.shopName} className="h-12 object-contain mb-3" />
        )}
        <h1 className="text-2xl font-bold tracking-tight">{cfg.shopName}</h1>
        {cfg.showBranch && cfg.branchName && (
          <p className="text-sm text-gray-600 mt-0.5">{cfg.branchName}</p>
        )}
        {cfg.showBranch && cfg.branchAddress && (
          <p className="text-xs text-gray-400 mt-0.5">{cfg.branchAddress}</p>
        )}
        {cfg.header && <p className="text-sm text-gray-500 mt-2 italic">{cfg.header}</p>}
      </div>

      {/* Receipt meta */}
      <div className="px-8 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{cfg.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(sale.saleDate, sale.createdAt)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-gray-500">#{cfg.receiptPrefix}{sale.id.slice(-10).toUpperCase()}</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmtPayment(sale.paymentMethod)}</p>
          </div>
        </div>
        {sale.recordedByName && (
          <p className="text-xs text-gray-400 mt-2">Served by: {sale.recordedByName}</p>
        )}
      </div>

      {/* Items */}
      <div className="px-8 py-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left pb-2 font-medium text-gray-500 text-xs">Item</th>
              <th className="text-right pb-2 font-medium text-gray-500 text-xs">Qty</th>
              <th className="text-right pb-2 font-medium text-gray-500 text-xs">Unit Price</th>
              <th className="text-right pb-2 font-medium text-gray-500 text-xs">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2 font-medium">{item.productName}</td>
                <td className="py-2 text-right text-gray-600 text-xs">{fmtQty(item.quantity, item.unitType)}</td>
                <td className="py-2 text-right text-gray-600 text-xs">{fc(item.unitPrice)}</td>
                <td className="py-2 text-right font-medium">{fc(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 space-y-1 border-t border-gray-200 pt-4">
          {discount > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Discount</span>
              <span>- {fc(discount)}</span>
            </div>
          )}
          {taxLines.length > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{fc(subtotalBeforeTax)}</span>
            </div>
          )}
          {taxLines.map((t, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-500">
              <span>{t.label} ({t.rate}%)</span>
              <span>{fc(t.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span>
            <span>{fc(grandTotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Payment</span>
            <span>{fmtPayment(sale.paymentMethod)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      {cfg.footer && (
        <div className="px-8 pb-8 pt-2 border-t border-gray-100">
          <p className="text-center text-xs text-gray-400 italic">{cfg.footer}</p>
        </div>
      )}
    </div>
  )
}

// ─── Thermal Receipt ──────────────────────────────────────────────────────────

function ThermalReceipt({ sale, cfg }: { sale: ReceiptSaleData; cfg: ReceiptConfig }) {
  const fc = (n: number) => formatCurrency(n, cfg.currency)
  const isNarrow = cfg.format === "thermal_58"
  const w = isNarrow ? "max-w-[54mm]" : "max-w-[76mm]"
  const dash = "─".repeat(isNarrow ? 28 : 36)
  const discount = sale.items.reduce((s, i) => s + i.discountAmount, 0)

  const taxLines = (sale.taxesSnapshot ?? []).filter((t) => t.amount > 0)
  const taxesTotal = taxLines.reduce((s, t) => s + t.amount, 0)
  const grandTotal = sale.totalAmount
  const subtotalBeforeTax = grandTotal - taxesTotal

  return (
    <div className={`bg-white text-black font-mono text-[11px] leading-snug mx-auto ${w} px-2 py-4`}>
      {/* Header */}
      <div className="text-center mb-2">
        {cfg.showLogo && cfg.shopLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfg.shopLogoUrl} alt={cfg.shopName} className="h-8 object-contain mx-auto mb-1" />
        )}
        <p className="font-bold text-sm">{cfg.shopName}</p>
        {cfg.showBranch && cfg.branchName && <p>{cfg.branchName}</p>}
        {cfg.showBranch && cfg.branchAddress && (
          <p className="text-[10px] text-gray-600">{cfg.branchAddress}</p>
        )}
        {cfg.header && <p className="text-[10px] italic mt-1">{cfg.header}</p>}
      </div>

      <p className="text-center text-gray-400">{dash}</p>

      {/* Meta */}
      <div className="text-center my-2">
        <p className="font-bold">{cfg.title}</p>
        <p className="text-[10px] text-gray-600">{fmtDate(sale.saleDate, sale.createdAt)}</p>
        <p className="text-[10px] text-gray-500 font-mono">#{cfg.receiptPrefix}{sale.id.slice(-10).toUpperCase()}</p>
        {sale.recordedByName && <p className="text-[10px] text-gray-500">By: {sale.recordedByName}</p>}
      </div>

      <p className="text-center text-gray-400">{dash}</p>

      {/* Items */}
      <div className="my-2 space-y-0.5">
        {sale.items.map((item, i) => (
          <div key={i}>
            <p className="font-medium truncate">{item.productName}</p>
            <p className="flex justify-between">
              <span>{fmtQty(item.quantity, item.unitType)} x {fc(item.unitPrice)}</span>
              <span className="font-medium">{fc(item.lineTotal)}</span>
            </p>
          </div>
        ))}
      </div>

      <p className="text-center text-gray-400">{dash}</p>

      {/* Totals */}
      <div className="my-2 space-y-0.5">
        {discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>- {fc(discount)}</span>
          </div>
        )}
        {taxLines.length > 0 && (
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>Subtotal</span>
            <span>{fc(subtotalBeforeTax)}</span>
          </div>
        )}
        {taxLines.map((t, i) => (
          <div key={i} className="flex justify-between text-[10px] text-gray-600">
            <span>{t.label} ({t.rate}%)</span>
            <span>{fc(t.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>{fc(grandTotal)}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Payment</span>
          <span>{fmtPayment(sale.paymentMethod)}</span>
        </div>
      </div>

      {cfg.footer && (
        <>
          <p className="text-center text-gray-400">{dash}</p>
          <p className="text-center text-[10px] italic mt-2">{cfg.footer}</p>
        </>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const ReceiptPreview = forwardRef<HTMLDivElement, { sale: ReceiptSaleData; cfg: ReceiptConfig }>(
  function ReceiptPreview({ sale, cfg }, ref) {
    return (
      <div ref={ref}>
        {cfg.format === "a4"
          ? <A4Receipt sale={sale} cfg={cfg} />
          : <ThermalReceipt sale={sale} cfg={cfg} />
        }
      </div>
    )
  }
)
