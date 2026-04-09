"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/utils/format";
import { toast } from "sonner";
import { Receipt, Banknote, Pencil, Plus, Loader2 } from "lucide-react";
import type { Expense, SessionContext } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Electricity",
  "Transport",
  "Wages",
  "Rent",
  "Maintenance",
  "Packaging",
  "Cleaning",
  "Miscellaneous",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    Electricity: "bg-yellow-100 text-yellow-800",
    Transport: "bg-blue-100 text-blue-800",
    Wages: "bg-purple-100 text-purple-800",
    Rent: "bg-red-100 text-red-800",
    Maintenance: "bg-orange-100 text-orange-800",
    Packaging: "bg-teal-100 text-teal-800",
    Cleaning: "bg-green-100 text-green-800",
    Miscellaneous: "bg-slate-100 text-slate-700",
  };
  return map[category] ?? "bg-slate-100 text-slate-700";
}

function formatExpenseDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function isWithinLast30Days(dateStr: string): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);
  return date >= cutoff;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  expenses: Expense[];
  currency: string;
  session: SessionContext;
  branches: { id: string; name: string }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpensesClient({
  expenses: initialExpenses,
  currency,
  session,
  branches,
}: Props) {
  const router = useRouter();

  // Resolved branch: fixed for branch-scoped users, selectable for shop-level users
  const [selectedBranchId, setSelectedBranchId] = useState(
    session.branch_id ?? branches[0]?.id ?? "",
  );

  // ── local state ────────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);

  // form fields
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>("Miscellaneous");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidFromTill, setPaidFromTill] = useState(false);

  // ── helpers ────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingExpense(null);
    setDate(todayISO());
    setCategory("Miscellaneous");
    setDescription("");
    setAmount("");
    setPaidFromTill(false);
    setDialogOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setDate(expense.expense_date);
    setCategory(expense.category);
    setDescription(expense.description ?? "");
    setAmount(String(expense.amount));
    setPaidFromTill(expense.payment_method === "cash");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingExpense(null);
  }

  // ── submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const branchId = session.branch_id ?? selectedBranchId;
    if (!branchId) {
      toast.error("Please select a branch");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const payment_method: "cash" | "mobile" = paidFromTill ? "cash" : "mobile";

    if (editingExpense) {
      // ── edit ──
      const { data, error } = await supabase
        .from("expenses")
        .update({
          expense_date: date,
          category,
          description: description.trim(),
          amount: parsedAmount,
          payment_method,
        })
        .eq("id", editingExpense.id)
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      setExpenses((prev) =>
        prev.map((ex) =>
          ex.id === editingExpense.id ? (data as Expense) : ex,
        ),
      );
      toast.success("Expense updated");
    } else {
      // ── add ──
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          shop_id: session.shop_id,
          branch_id: branchId,
          expense_date: date,
          amount: parsedAmount,
          category,
          description: description.trim(),
          payment_method,
          recorded_by: session.user_id,
          recorded_by_name: session.full_name ?? null,
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      setExpenses((prev) => [data as Expense, ...prev]);
      toast.success("Expense recorded");
    }

    closeDialog();
    setLoading(false);
    router.refresh();
  }

  // ── derived ────────────────────────────────────────────────────────────────

  const last30Total = expenses
    .filter((e) => isWithinLast30Days(e.expense_date))
    .reduce((sum, e) => sum + e.amount, 0);

  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-6">
      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex flex-col gap-4">
        {/* Last 30 days card */}
        <div className="bg-white rounded border p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100">
              <Receipt className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-slate-600">Last 30 Days</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatCurrency(last30Total, currency)}
          </p>
        </div>

        {/* By category card */}
        <div className="bg-white rounded border p-4 flex-1">
          <p className="text-sm font-semibold text-slate-700 mb-3">
            By Category
          </p>
          {byCategory.length === 0 ? (
            <p className="text-xs text-slate-400">No expenses yet</p>
          ) : (
            <ul className="space-y-2">
              {byCategory.map(([cat, total]) => (
                <li
                  key={cat}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(cat)}`}
                  >
                    {cat}
                  </span>
                  <span className="text-xs font-medium text-slate-700 tabular-nums shrink-0">
                    {formatCurrency(total, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add button */}
        <Button className="w-full" onClick={openAdd}>
          <Plus className="mr-2 w-4 h-4" />
          Add Expense
        </Button>
      </aside>

      {/* ── Right table ──────────────────────────────────────────────────────── */}
      <main className="col-span-1 lg:col-span-3 bg-white rounded border overflow-x-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-slate-900">Expenses</h2>
          <p className="text-xs text-slate-500 mt-0.5">Last 200 entries</p>
        </div>

        {expenses.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No expenses recorded yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-center font-medium">Till</th>
                <th className="px-4 py-3 text-left font-medium">By</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {formatExpenseDate(expense.expense_date)}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryColor(expense.category)}`}
                    >
                      {expense.category}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {expense.description ?? (
                      <span className="text-slate-300 italic">—</span>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    {formatCurrency(expense.amount, currency)}
                  </td>

                  {/* Till badge */}
                  <td className="px-4 py-3 text-center">
                    {expense.payment_method === "cash" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Banknote className="w-3 h-3" />
                        Till
                      </span>
                    )}
                  </td>

                  {/* By */}
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {expense.recorded_by_name ??
                      expense.recorded_by.slice(0, 8)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEdit(expense)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      aria-label="Edit expense"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {/* ── Add / Edit dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? "Edit Expense" : "Add Expense"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Branch selector — only for shop-level users */}
            {!session.branch_id && branches.length > 0 && (
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(v) => setSelectedBranchId(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v ?? "Miscellaneous")}
              >
                <SelectTrigger id="expense-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-description">Description</Label>
              <Input
                id="expense-description"
                placeholder="What was this expense for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input
                id="expense-amount"
                type="number"
                min={0}
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            {/* Paid from till */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-amber-500 accent-amber-500 cursor-pointer"
                checked={paidFromTill}
                onChange={(e) => setPaidFromTill(e.target.checked)}
              />
              <span className="text-sm text-slate-700">
                Paid from till (cash)
              </span>
            </label>

            {/* Submit */}
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
              {editingExpense ? "Save Changes" : "Record Expense"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
