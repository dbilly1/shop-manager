"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/utils/format";
import { Plus, Trash2, Loader2, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { SessionContext } from "@/types";

interface BranchProduct {
  id: string;
  branch_id: string;
  override_price: number | null;
  current_stock_kg: number;
  current_stock_units: number;
  current_stock_boxes: number;
  product: {
    id: string;
    name: string;
    unit_type: string;
    base_price: number;
    cost_price: number;
  } | null;
}

interface SaleLine {
  branch_product_id: string;
  product_id: string;
  unit_type: string;
  unit_price: number;
  quantity: number;
  boxes: number;
  discount: number;
  cost_price: number;
  payment_method: "cash" | "mobile" | "credit";
  customer_id: string;
}

const EXPENSE_CATEGORIES = [
  "Electricity", "Transport", "Wages", "Rent",
  "Maintenance", "Packaging", "Cleaning", "Miscellaneous",
] as const

interface Expense {
  category: string;
  description: string;
  amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchProducts: BranchProduct[];
  customers: { id: string; name: string; phone: string | null }[];
  currency: string;
  session: SessionContext;
  branches: { id: string; name: string }[];
}

function emptyLine(): SaleLine {
  return {
    branch_product_id: "",
    product_id: "",
    unit_type: "units",
    unit_price: 0,
    quantity: 1,
    boxes: 0,
    discount: 0,
    cost_price: 0,
    payment_method: "cash",
    customer_id: "",
  };
}

export function BulkEntryDialog({
  open,
  onOpenChange,
  branchProducts,
  customers,
  currency,
  session,
  branches,
}: Props) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [lines, setLines] = useState<SaleLine[]>([emptyLine()]);
  const [saleDate, setSaleDate] = useState(today);
  const [selectedBranchId, setSelectedBranchId] = useState(
    session.branch_id ?? "",
  );
  const [notes, setNotes] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reconcile, setReconcile] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [actualMobile, setActualMobile] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setLines([emptyLine()]);
    setNotes("");
    setExpenses([]);
    setReconcile(false);
    setActualCash("");
    setActualMobile("");
    setError("");
    setSaleDate(today);
  }

  function handleClose(v: boolean) {
    if (!v) resetForm();
    onOpenChange(v);
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function updateLine(
    idx: number,
    field: keyof SaleLine,
    value: string | number,
  ) {
    setLines((prev) => {
      const next = [...prev];
      if (field === "branch_product_id") {
        const bp = branchProducts.find((p) => p.id === value);
        if (bp?.product) {
          next[idx] = {
            ...next[idx],
            branch_product_id: bp.id,
            product_id: bp.product.id,
            unit_type: bp.product.unit_type,
            unit_price: bp.override_price ?? bp.product.base_price,
            cost_price: bp.product.cost_price,
          };
        }
      } else {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function addExpense() {
    setExpenses((prev) => [...prev, { category: "Miscellaneous", description: "", amount: 0 }]);
  }

  function updateExpense(
    idx: number,
    field: keyof Expense,
    value: string | number,
  ): void {
    setExpenses((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    );
  }

  function removeExpense(idx: number) {
    setExpenses((prev) => prev.filter((_, i) => i !== idx));
  }

  // Only lines with a product selected and quantity > 0 count as valid
  const validLines = lines.filter(
    (l) => l.branch_product_id && (l.quantity > 0 || l.boxes > 0),
  );
  const total = validLines.reduce(
    (s, l) => s + (l.unit_price * l.quantity - l.discount),
    0,
  );
  const cashTotal = validLines
    .filter((l) => l.payment_method === "cash")
    .reduce((s, l) => s + (l.unit_price * l.quantity - l.discount), 0);
  const mobileTotal = validLines
    .filter((l) => l.payment_method === "mobile")
    .reduce((s, l) => s + (l.unit_price * l.quantity - l.discount), 0);

  async function handleSubmit() {
    if (validLines.length === 0) {
      setError("Add at least one valid order");
      return;
    }
    const creditLine = validLines.find(
      (l) => l.payment_method === "credit" && !l.customer_id,
    );
    if (creditLine) {
      setError("Credit lines require a customer");
      return;
    }
    const branchId = session.branch_id ?? selectedBranchId;
    if (!branchId) {
      setError("Select a branch");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();

    // Generate a shared batch_id for all sales in this bulk session
    const batchId = crypto.randomUUID();

    // Group valid lines by payment method + customer
    const groups = new Map<string, SaleLine[]>();
    for (const l of validLines) {
      const key = `${l.payment_method}::${l.customer_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    }

    for (const [, groupLines] of groups) {
      const groupTotal = groupLines.reduce(
        (s, l) => s + (l.unit_price * l.quantity - l.discount),
        0,
      );
      const pm = groupLines[0].payment_method;
      const custId = groupLines[0].customer_id || null;

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          shop_id: session.shop_id,
          branch_id: branchId,
          sale_date: saleDate,
          total_amount: groupTotal,
          payment_method: pm,
          customer_id: custId,
          recorded_by: session.user_id,
          recorded_by_name: session.full_name ?? null,
          notes: notes || null,
          batch_id: batchId,
        })
        .select()
        .single();

      if (saleError || !sale) {
        setError(saleError?.message ?? "Failed to create sale");
        setLoading(false);
        return;
      }

      const items = groupLines.map((l) => ({
        sale_id: sale.id,
        shop_id: session.shop_id,
        branch_id: branchId,
        product_id: l.product_id,
        quantity_kg: l.unit_type === "kg" ? l.quantity : 0,
        quantity_units: l.unit_type === "units" ? l.quantity : 0,
        quantity_boxes: l.unit_type === "boxes" ? l.boxes : 0,
        unit_price: l.unit_price,
        discount_amount: l.discount,
        line_total: l.unit_price * l.quantity - l.discount,
        cost_price_at_sale: l.cost_price,
      }));
      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(items);
      if (itemsError) {
        setError(itemsError.message);
        setLoading(false);
        return;
      }

      for (const l of groupLines) {
        const bp = branchProducts.find((p) => p.id === l.branch_product_id);
        if (!bp) continue;
        const update: Record<string, number> = {};
        if (l.unit_type === "kg")
          update.current_stock_kg = Math.max(
            0,
            bp.current_stock_kg - l.quantity,
          );
        else if (l.unit_type === "boxes")
          update.current_stock_boxes = Math.max(
            0,
            bp.current_stock_boxes - l.boxes,
          );
        else
          update.current_stock_units = Math.max(
            0,
            bp.current_stock_units - l.quantity,
          );
        await supabase
          .from("branch_products")
          .update({ ...update, updated_at: new Date().toISOString() })
          .eq("id", bp.id);
      }

      if (pm === "credit" && custId) {
        await supabase.from("credit_sales").insert({
          shop_id: session.shop_id,
          branch_id: branchId,
          sale_id: sale.id,
          customer_id: custId,
          amount_owed: groupTotal,
          amount_paid: 0,
          balance: groupTotal,
        });
      }
    }

    // Save session expenses (linked to this batch)
    for (const exp of expenses.filter((e) => e.description && e.amount > 0)) {
      await supabase.from("expenses").insert({
        shop_id: session.shop_id,
        branch_id: branchId,
        expense_date: saleDate,
        category: exp.category || "Miscellaneous",
        description: exp.description,
        amount: exp.amount,
        payment_method: "cash",
        batch_id: batchId,
        recorded_by: session.user_id,
        recorded_by_name: session.full_name ?? null,
      });
    }

    // Reconcile if checked
    if (reconcile) {
      const cash = parseFloat(actualCash) || 0;
      const mobile = parseFloat(actualMobile) || 0;
      await supabase.from("reconciliations").upsert(
        {
          shop_id: session.shop_id,
          branch_id: branchId,
          reconciliation_date: saleDate,
          expected_cash: cashTotal,
          actual_cash: cash,
          cash_variance: cash - cashTotal,
          expected_mobile: mobileTotal,
          actual_mobile: mobile,
          mobile_variance: mobile - mobileTotal,
          status: "reconciled",
          reconciled_by: session.user_id,
        },
        { onConflict: "shop_id,branch_id,reconciliation_date" },
      );
    }

    toast.success(
      `${validLines.length} order${validLines.length !== 1 ? "s" : ""} saved`,
    );
    resetForm();
    onOpenChange(false);
    router.refresh();
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-6xl max-w-6xl sm:max-w-none p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-4">
            <DialogTitle className="text-base">Bulk Sales Entry</DialogTitle>
            <div className="flex items-center gap-2 ml-auto">
              {!session.branch_id && branches.length > 0 && (
                <Select
                  value={selectedBranchId}
                  onValueChange={(v) => setSelectedBranchId(v ?? "")}
                >
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Sale Date
                <Input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  max={today}
                  className="h-8 text-sm w-36"
                />
              </label>
            </div>
          </div>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm shrink-0">
            {error}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Table */}
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-9" />
              <col />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[19%]" />
              <col className="w-[12%]" />
              <col className="w-8" />
            </colgroup>
            <thead className="sticky top-0 bg-background border-b z-10">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5">
                  #
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                  Product <span className="text-destructive">*</span>
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                  Qty (primary)
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                  Boxes
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                  Unit Price
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                  Discount
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                  Payment
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2.5">
                  Total
                </th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line, idx) => {
                const lineTotal =
                  line.unit_price * line.quantity - line.discount;
                const isValid =
                  line.branch_product_id &&
                  (line.quantity > 0 || line.boxes > 0);
                return (
                  <tr key={idx} className="group hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={line.branch_product_id}
                        onValueChange={(v) =>
                          updateLine(idx, "branch_product_id", v ?? "")
                        }
                      >
                        <SelectTrigger className="h-8 text-sm w-full">
                          <SelectValue placeholder="Select product…" />
                        </SelectTrigger>
                        <SelectContent>
                          {branchProducts.map(
                            (bp) =>
                              bp.product && (
                                <SelectItem key={bp.id} value={bp.id}>
                                  {bp.product.name}
                                </SelectItem>
                              ),
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.quantity || ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "quantity",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm w-full"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.boxes || ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "boxes",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm w-full"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.unit_price || ""}
                        placeholder="0.00"
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "unit_price",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm w-full"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.discount || ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "discount",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm w-full"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-0.5">
                        {(["cash", "mobile", "credit"] as const).map((pm) => (
                          <button
                            key={pm}
                            onClick={() =>
                              updateLine(idx, "payment_method", pm)
                            }
                            className={`flex-1 py-1 rounded text-[11px] font-medium border transition-colors ${
                              line.payment_method === pm
                                ? "bg-primary text-primary-foreground border-primary"
                                : "text-muted-foreground hover:text-foreground border-border"
                            }`}
                          >
                            {pm === "cash"
                              ? "Cash"
                              : pm === "mobile"
                                ? "Mobile"
                                : "Credit"}
                          </button>
                        ))}
                      </div>
                      {line.payment_method === "credit" && (
                        <Select
                          value={line.customer_id}
                          onValueChange={(v) =>
                            updateLine(idx, "customer_id", v ?? "")
                          }
                        >
                          <SelectTrigger className="h-7 text-xs mt-1 w-full">
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={c.id} label={c.name}>
                                {c.name}
                                {c.phone ? ` · ${c.phone}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums text-sm ${!isValid ? "text-muted-foreground" : ""}`}
                    >
                      {formatCurrency(Math.max(0, lineTotal), currency)}
                    </td>
                    <td className="pr-2 py-2 text-center">
                      <button
                        onClick={() => removeLine(idx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:text-destructive mx-auto"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Add another order */}
          <button
            onClick={addLine}
            className="w-full py-3 border-t border-dashed text-sm text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another order
          </button>

          {/* Notes + summary */}
          <div className="mx-5 my-4 flex items-start gap-3">
            <Input
              placeholder="Notes for all orders (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 h-9 text-sm"
            />
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">
                {validLines.length} valid order
                {validLines.length !== 1 ? "s" : ""}
              </p>
              <p className="text-base font-bold text-primary tabular-nums">
                {formatCurrency(total, currency)}
              </p>
            </div>
          </div>

          {/* Session expenses */}
          <div className="mx-5 mb-4 border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">
                Session expenses (paid from till)
              </span>
              <button
                onClick={addExpense}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            {expenses.length > 0 && (
              <div className="border-t divide-y">
                {expenses.map((exp, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-4 py-2">
                    {/* Category select */}
                    <div className="relative w-32 shrink-0">
                      <select
                        value={exp.category}
                        onChange={(e) => updateExpense(idx, "category", e.target.value)}
                        className="w-full h-8 text-xs rounded-md border border-input bg-background pl-2 pr-6 appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    </div>
                    <Input
                      placeholder="Description"
                      value={exp.description}
                      onChange={(e) =>
                        updateExpense(idx, "description", e.target.value)
                      }
                      className="flex-1 h-8 text-sm"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0.00"
                      value={exp.amount || ""}
                      onChange={(e) =>
                        updateExpense(
                          idx,
                          "amount",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-24 h-8 text-sm"
                    />
                    <button
                      onClick={() => removeExpense(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reconcile this entry */}
          <div className="mx-5 mb-5 border rounded-lg px-4 py-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reconcile}
                onChange={(e) => setReconcile(e.target.checked)}
                className="h-4 w-4 rounded border accent-primary"
              />
              <span className="text-sm font-medium">Reconcile this entry</span>
              {!reconcile && (
                <span className="text-xs text-muted-foreground">
                  — enter actual cash &amp; mobile collected for {saleDate}
                </span>
              )}
            </label>
            {reconcile && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Actual Cash Collected
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {currency}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0.00"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      className="h-8 text-sm pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Expected: {formatCurrency(cashTotal, currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Actual Mobile Collected
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {currency}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0.00"
                      value={actualMobile}
                      onChange={(e) => setActualMobile(e.target.value)}
                      className="h-8 text-sm pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Expected: {formatCurrency(mobileTotal, currency)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 flex items-center justify-between shrink-0 bg-background">
          <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || validLines.length === 0}
            size="sm"
            className="gap-1.5 min-w-32"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save {validLines.length} Order{validLines.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
