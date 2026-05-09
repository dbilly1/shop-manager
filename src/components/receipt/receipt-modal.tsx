"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Printer, Loader2, Receipt } from "lucide-react"
import { toast } from "sonner"
import { ReceiptPreview, type ReceiptSaleData, type ReceiptConfig } from "./receipt-preview"
import type { SessionContext } from "@/types"

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  sale: ReceiptSaleData
  session: SessionContext
  currency: string
  /** When true, hides the edit panel — just shows the receipt preview + print */
  previewOnly?: boolean
}

// ─── Print helper ─────────────────────────────────────────────────────────────

function printReceipt(ref: React.RefObject<HTMLDivElement | null>, format: string) {
  if (!ref.current) return
  const html = ref.current.outerHTML
  const pageSize = format === "thermal_58" ? "58mm" : format === "thermal_80" ? "80mm" : "A4"
  const margin  = format === "a4" ? "12mm" : "2mm"

  const win = window.open("", "_blank", "width=700,height=900")
  if (!win) { toast.error("Allow pop-ups to print"); return }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page { size: ${pageSize} auto; margin: ${margin}; }
    body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body class="bg-white">
  ${html}
  <script>
    // Wait for Tailwind to load before printing
    window.addEventListener("load", function() {
      setTimeout(function() { window.print(); window.close(); }, 500);
    });
  </script>
</body>
</html>`)
  win.document.close()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReceiptModal({ open, onClose, sale, session, currency, previewOnly = false }: Props) {
  const previewRef = useRef<HTMLDivElement>(null)

  // Config state — editable by user
  const [title,         setTitle]         = useState("Receipt")
  const [format,        setFormat]        = useState<"a4" | "thermal_58" | "thermal_80">("a4")
  const [header,        setHeader]        = useState("Thank you for your purchase!")
  const [footer,        setFooter]        = useState("")
  const [showLogo,      setShowLogo]      = useState(true)
  const [taxEnabled,    setTaxEnabled]    = useState(false)
  const [taxLabel,      setTaxLabel]      = useState("Tax")
  const [taxRate,       setTaxRate]       = useState(0)
  const [receiptPrefix, setReceiptPrefix] = useState("")

  // Fetched shop / branch data
  const [shopName,      setShopName]      = useState("")
  const [shopLogoUrl,   setShopLogoUrl]   = useState<string | null>(null)
  const [branchName,    setBranchName]    = useState<string | null>(null)
  const [branchAddress, setBranchAddress] = useState<string | null>(null)
  const [fetching,      setFetching]      = useState(false)

  // Fetch shop + branch data once when modal opens
  useEffect(() => {
    if (!open || !session.shop_id) return
    let cancelled = false
    async function load() {
      setFetching(true)
      const supabase = createClient()

      const { data: shop } = await supabase
        .from("shops")
        .select("name, logo_url, receipt_format, receipt_header, receipt_footer, receipt_show_logo, receipt_tax_enabled, receipt_tax_label, receipt_tax_rate, receipt_number_prefix")
        .eq("id", session.shop_id!)
        .single()

      if (!cancelled && shop) {
        setShopName(shop.name ?? "")
        setShopLogoUrl(shop.logo_url ?? null)
        setFormat((shop.receipt_format as "a4" | "thermal_58" | "thermal_80") ?? "a4")
        setHeader(shop.receipt_header ?? "Thank you for your purchase!")
        setFooter(shop.receipt_footer ?? "")
        setShowLogo(shop.receipt_show_logo ?? true)
        setTaxEnabled(shop.receipt_tax_enabled ?? false)
        setTaxLabel(shop.receipt_tax_label ?? "Tax")
        setTaxRate(shop.receipt_tax_rate ?? 0)
        setReceiptPrefix(shop.receipt_number_prefix ?? "")
      }

      if (sale.branchId) {
        const { data: branch } = await supabase
          .from("branches")
          .select("name, address")
          .eq("id", sale.branchId)
          .single()
        if (!cancelled && branch) {
          setBranchName(branch.name ?? null)
          setBranchAddress(branch.address ?? null)
        }
      }

      if (!cancelled) setFetching(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, session.shop_id, sale.branchId])

  // Save receipt defaults back to shop settings
  const saveDefaults = useCallback(async () => {
    const supabase = createClient()
    await supabase.from("shops").update({
      receipt_format:       format,
      receipt_header:       header,
      receipt_footer:       footer,
      receipt_show_logo:    showLogo,
      receipt_tax_enabled:  taxEnabled,
      receipt_tax_label:    taxLabel,
      receipt_tax_rate:     taxRate,
      receipt_number_prefix: receiptPrefix,
    }).eq("id", session.shop_id!)
    toast.success("Receipt defaults saved")
  }, [format, header, footer, showLogo, taxEnabled, taxLabel, taxRate, receiptPrefix, session.shop_id])

  const cfg: ReceiptConfig = {
    title, format, header, footer, showLogo,
    shopName, shopLogoUrl,
    branchName, branchAddress,
    currency,
    taxEnabled, taxLabel, taxRate,
    receiptPrefix,
  }

  const previewWidth = format === "thermal_58" ? "max-w-[62mm]" : format === "thermal_80" ? "max-w-[84mm]" : "max-w-[420px]"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className={`${previewOnly ? "max-w-lg" : "max-w-4xl"} max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden`}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Receipt
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">

          {/* ── Edit panel — hidden in previewOnly mode ─────────────── */}
          {!previewOnly && (
            <div className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto p-5 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Receipt Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 / Letter</SelectItem>
                    <SelectItem value="thermal_80">Thermal 80mm</SelectItem>
                    <SelectItem value="thermal_58">Thermal 58mm</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {format === "a4"
                    ? "Standard page — desktop/inkjet printers"
                    : format === "thermal_80"
                    ? "80mm roll — most POS printers"
                    : "58mm roll — compact POS printers"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Header Message</Label>
                <Textarea
                  rows={2}
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  className="text-sm resize-none"
                  placeholder="e.g. Thank you for shopping with us!"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Footer Message</Label>
                <Textarea
                  rows={2}
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  className="text-sm resize-none"
                  placeholder="e.g. Returns accepted within 7 days"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Logo</Label>
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
              </div>

              {/* Tax */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Charge Tax</Label>
                  <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
                </div>
                {taxEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Label</Label>
                      <Input
                        value={taxLabel}
                        onChange={(e) => setTaxLabel(e.target.value)}
                        placeholder="VAT"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Rate (%)</Label>
                      <Input
                        type="number" min={0} max={100} step="0.01"
                        value={taxRate || ""}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        placeholder="15"
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Receipt number prefix */}
              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-xs">Receipt No. Prefix</Label>
                <Input
                  value={receiptPrefix}
                  onChange={(e) => setReceiptPrefix(e.target.value)}
                  placeholder="e.g. INV- or REC-"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Preview: #{receiptPrefix || ""}AB1234C5DE
                </p>
              </div>

              <button
                onClick={saveDefaults}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
              >
                Save as defaults
              </button>
            </div>
          )}

          {/* ── Preview ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-muted/30 p-6 min-h-0">
            {fetching ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className={`${previewWidth} mx-auto shadow-sm rounded overflow-hidden border`}>
                <ReceiptPreview ref={previewRef} sale={sale} cfg={cfg} />
              </div>
            )}
          </div>
        </div>

        {/* ── Footer actions ──────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => printReceipt(previewRef, format)} disabled={fetching}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
