"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAuditAction } from "@/lib/audit-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency, formatDate } from "@/utils/format";
import { toast } from "sonner";
import {
  User,
  Phone,
  Wallet,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  CreditCard,
  TrendingDown,
  CheckCircle2,
  ArrowDownLeft,
  ChevronDown,
  ShoppingCart,
  Banknote,
  Smartphone,
} from "lucide-react";
import type { SessionContext } from "@/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreditSaleRow {
  id: string;
  shop_id: string;
  branch_id: string;
  sale_id: string;
  customer_id: string;
  amount_owed: number;
  amount_paid: number;
  balance: number;
  created_at: string;
  customer: { id: string; name: string; phone: string | null } | null;
  sale: { sale_date: string } | null;
}

interface CreditPayment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  recorded_by: string | null;
}

interface Props {
  creditSales: CreditSaleRow[];
  currency: string;
  overdueThreshold: number;
  session: SessionContext;
}

interface CustomerGroup {
  customerId: string;
  name: string;
  phone: string | null;
  totalOwed: number;
  totalPaid: number;
  outstanding: number;
  sales: CreditSaleRow[];
  branchId: string;
}

// ─── Ledger entry (merged sale + payment) ────────────────────────────────────

type LedgerEntry =
  | {
      kind: "sale";
      id: string;
      date: string;
      debit: number;
      balance: number; // running balance after this entry
      amountPaid: number;
    }
  | {
      kind: "payment";
      id: string;
      date: string;
      credit: number;
      balance: number; // running balance after this entry
      method: string;
      notes: string | null;
      recordedBy: string | null;
    };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function methodLabel(method: string) {
  if (method === "cash") return "Cash";
  if (method === "mobile_money") return "Mobile Money";
  return method;
}

function MethodBadge({ method }: { method: string }) {
  if (method === "cash")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
        <Banknote className="size-3" />
        Cash
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600">
      <Smartphone className="size-3" />
      Mobile Money
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CreditClient({
  creditSales,
  currency,
  overdueThreshold,
  session,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ── Selection ────────────────────────────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Payment dialog ───────────────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "mobile_money">("cash");
  const [payDate, setPayDate] = useState(todayIso());
  const [payLoading, setPayLoading] = useState(false);

  // ── Edit / Delete dialogs ────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Payment history ──────────────────────────────────────────────────────
  const [payments, setPayments] = useState<CreditPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ─── Group credit sales by customer ──────────────────────────────────────
  const customerGroups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    for (const row of creditSales) {
      const cid = row.customer_id;
      if (!map.has(cid)) {
        map.set(cid, {
          customerId: cid,
          name: row.customer?.name ?? "Unknown",
          phone: row.customer?.phone ?? null,
          totalOwed: 0,
          totalPaid: 0,
          outstanding: 0,
          sales: [],
          branchId: row.branch_id,
        });
      }
      const g = map.get(cid)!;
      g.totalOwed += row.amount_owed;
      g.totalPaid += row.amount_paid;
      g.outstanding += row.balance;
      g.sales.push(row);
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [creditSales]);

  const selectedGroup = useMemo(
    () => customerGroups.find((g) => g.customerId === selectedCustomerId) ?? null,
    [customerGroups, selectedCustomerId],
  );

  // ─── Build chronological ledger ───────────────────────────────────────────
  const ledger = useMemo<LedgerEntry[]>(() => {
    if (!selectedGroup) return [];

    // Merge sales + payments into one list with a sort key
    const raw: ({ sortDate: string } & (
      | { kind: "sale"; row: CreditSaleRow }
      | { kind: "payment"; row: CreditPayment }
    ))[] = [
      ...selectedGroup.sales.map((row) => ({
        kind: "sale" as const,
        sortDate: row.sale?.sale_date ?? row.created_at.slice(0, 10),
        row,
      })),
      ...payments.map((row) => ({
        kind: "payment" as const,
        sortDate: row.payment_date,
        row,
      })),
    ];

    raw.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

    // Compute running balance
    let running = 0;
    return raw.map(({ kind, sortDate, row }) => {
      if (kind === "sale") {
        const s = row as CreditSaleRow;
        running += s.amount_owed;
        return {
          kind: "sale",
          id: s.id,
          date: sortDate,
          debit: s.amount_owed,
          balance: running,
          amountPaid: s.amount_paid,
        } satisfies LedgerEntry;
      } else {
        const p = row as CreditPayment;
        running -= p.amount;
        return {
          kind: "payment",
          id: p.id,
          date: sortDate,
          credit: p.amount,
          balance: running,
          method: p.payment_method,
          notes: p.notes,
          recordedBy: p.recorded_by,
        } satisfies LedgerEntry;
      }
    });
  }, [selectedGroup, payments]);

  // Reverse for display (newest first)
  const ledgerDesc = useMemo(() => [...ledger].reverse(), [ledger]);

  // Ledger pagination
  const {
    paginatedData: ledgerPage,
    page: ledgerCurrentPage,
    setPage: setLedgerPage,
    pageSize: ledgerPageSize,
    setPageSize: setLedgerPageSize,
    totalPages: ledgerTotalPages,
    totalItems: ledgerTotalItems,
    startIndex: ledgerStart,
    endIndex: ledgerEnd,
  } = usePagination(ledgerDesc);

  // ─── Load payments on customer select ────────────────────────────────────
  const loadPayments = useCallback(
    async (customerId: string) => {
      setPaymentsLoading(true);
      const { data, error } = await supabase
        .from("credit_payments")
        .select("*")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false });
      if (error) toast.error("Failed to load payment history");
      else setPayments((data as CreditPayment[]) ?? []);
      setPaymentsLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (selectedCustomerId) {
      setExpandedId(null);
      loadPayments(selectedCustomerId);
    } else {
      setPayments([]);
    }
  }, [selectedCustomerId, loadPayments]);

  // ─── Overdue check ────────────────────────────────────────────────────────
  function isOverdue(group: CustomerGroup) {
    const oldest = group.sales.reduce<string | null>((min, s) => {
      const d = s.sale?.sale_date ?? s.created_at.slice(0, 10);
      return !min || d < min ? d : min;
    }, null);
    if (!oldest) return false;
    const days = Math.floor(
      (Date.now() - new Date(oldest + "T00:00:00").getTime()) / 86400000,
    );
    return days > overdueThreshold;
  }

  // ─── Record payment ───────────────────────────────────────────────────────
  async function handleRecordPayment() {
    if (!selectedGroup) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }

    setPayLoading(true);
    const branchId = session.branch_id ?? selectedGroup.branchId;

    const { data: payment, error } = await supabase
      .from("credit_payments")
      .insert({
        shop_id: session.shop_id,
        branch_id: branchId,
        customer_id: selectedGroup.customerId,
        amount,
        payment_method: payMethod,
        payment_date: payDate,
        recorded_by: session.user_id,
      })
      .select()
      .single();

    if (error) { toast.error(error.message); setPayLoading(false); return; }

    await logAuditAction({
      branchId,
      action: "RECORD_CREDIT_PAYMENT",
      entityType: "credit_payment",
      entityId: payment?.id ?? "00000000-0000-0000-0000-000000000000",
      newValues: { amount, payment_method: payMethod, customer_id: selectedGroup.customerId },
    });

    let remaining = amount;
    const sorted = [...selectedGroup.sales].sort(
      (a, b) =>
        new Date(a.sale?.sale_date ?? a.created_at).getTime() -
        new Date(b.sale?.sale_date ?? b.created_at).getTime(),
    );
    for (const sale of sorted) {
      if (remaining <= 0) break;
      if (sale.balance <= 0) continue;
      const deduct = Math.min(remaining, sale.balance);
      await supabase
        .from("credit_sales")
        .update({ amount_paid: sale.amount_paid + deduct, balance: sale.balance - deduct })
        .eq("id", sale.id);
      remaining -= deduct;
    }

    toast.success("Payment recorded");
    setPayOpen(false);
    setPayAmount("");
    setPayDate(todayIso());
    setPayLoading(false);
    router.refresh();
  }

  // ─── Edit customer ────────────────────────────────────────────────────────
  function openEditDialog() {
    if (!selectedGroup) return;
    setEditName(selectedGroup.name);
    setEditPhone(selectedGroup.phone ?? "");
    setEditOpen(true);
  }

  async function handleEditCustomer() {
    if (!selectedGroup || !editName.trim()) {
      toast.error("Name is required");
      return;
    }
    setEditLoading(true);
    const { error } = await supabase
      .from("customers")
      .update({ name: editName.trim(), phone: editPhone.trim() || null })
      .eq("id", selectedGroup.customerId);
    if (error) { toast.error(error.message); setEditLoading(false); return; }
    toast.success("Customer updated");
    setEditOpen(false);
    setEditLoading(false);
    router.refresh();
  }

  // ─── Delete customer ──────────────────────────────────────────────────────
  async function handleDeleteCustomer() {
    if (!selectedGroup) return;
    if (selectedGroup.sales.length > 0) {
      toast.error("Cannot delete customer with credit history");
      setDeleteOpen(false);
      return;
    }
    setDeleteLoading(true);
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", selectedGroup.customerId);
    if (error) { toast.error(error.message); setDeleteLoading(false); return; }
    toast.success("Customer deleted");
    setDeleteOpen(false);
    setSelectedCustomerId(null);
    setDeleteLoading(false);
    router.refresh();
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-4 md:-m-6">

      {/* ── Left panel: customer list ── */}
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">Customers</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {customerGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-xs text-center px-4">
              <CreditCard className="size-8 mb-2 opacity-40" />
              No outstanding credit
            </div>
          ) : (
            customerGroups.map((group) => {
              const isActive = group.customerId === selectedCustomerId;
              const overdue = isOverdue(group);
              return (
                <button
                  key={group.customerId}
                  onClick={() => setSelectedCustomerId(group.customerId)}
                  className={`border rounded-lg p-3 w-full text-left transition-colors ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm leading-tight line-clamp-1">
                      {group.name}
                    </span>
                    <Badge
                      variant="destructive"
                      className="shrink-0 tabular-nums"
                    >
                      {formatCurrency(group.outstanding, currency)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    {group.phone ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        <span>{group.phone}</span>
                      </div>
                    ) : <span />}
                    {overdue && (
                      <span className="text-xs font-medium text-red-600">
                        Overdue
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!selectedGroup ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <User className="size-12 opacity-30" />
            <p className="text-sm">Select a customer to view their credit history</p>
          </div>
        ) : (
          <>
            {/* Sticky header */}
            <div className="border-b px-6 py-4 shrink-0 bg-background">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-base leading-tight truncate">
                      {selectedGroup.name}
                    </h2>
                    {selectedGroup.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="size-3" />
                        {selectedGroup.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={openEditDialog} aria-label="Edit">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPayAmount("");
                      setPayDate(todayIso());
                      setPayMethod("cash");
                      setPayOpen(true);
                    }}
                  >
                    <Wallet className="size-3.5 mr-1.5" />
                    Record Payment
                  </Button>
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingDown className="size-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Total Credit</p>
                  </div>
                  <p className="font-bold text-sm tabular-nums">
                    {formatCurrency(selectedGroup.totalOwed, currency)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="size-3.5 text-green-600" />
                    <p className="text-xs text-muted-foreground">Total Paid</p>
                  </div>
                  <p className="font-bold text-sm text-green-700 tabular-nums">
                    {formatCurrency(selectedGroup.totalPaid, currency)}
                  </p>
                </div>
                <div
                  className={`rounded-lg border px-4 py-3 ${
                    selectedGroup.outstanding > 0
                      ? "bg-red-50 border-red-200"
                      : "bg-green-50 border-green-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowDownLeft
                      className={`size-3.5 ${
                        selectedGroup.outstanding > 0 ? "text-red-500" : "text-green-600"
                      }`}
                    />
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                  </div>
                  <p
                    className={`font-bold text-sm tabular-nums ${
                      selectedGroup.outstanding > 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {formatCurrency(selectedGroup.outstanding, currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Ledger ── */}
            <div className="flex-1 overflow-y-auto">
              {paymentsLoading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : ledgerDesc.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                  <CreditCard className="size-8 opacity-30" />
                  No transactions yet
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b z-10">
                      <tr className="text-xs text-muted-foreground">
                        <th className="px-5 py-3 text-left font-medium w-8" />
                        <th className="px-3 py-3 text-left font-medium">Date</th>
                        <th className="px-3 py-3 text-left font-medium">Type</th>
                        <th className="px-3 py-3 text-right font-medium text-red-600">Debit</th>
                        <th className="px-3 py-3 text-right font-medium text-green-600">Credit</th>
                        <th className="px-5 py-3 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ledgerPage.map((entry) => {
                        const isExpanded = expandedId === entry.id;
                        return (
                          <>
                            {/* Main row */}
                            <tr
                              key={entry.id}
                              onClick={() =>
                                setExpandedId(isExpanded ? null : entry.id)
                              }
                              className="hover:bg-muted/40 cursor-pointer transition-colors"
                            >
                              {/* Chevron */}
                              <td className="px-5 py-3 text-muted-foreground">
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </td>

                              {/* Date */}
                              <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                                {formatDate(entry.date)}
                              </td>

                              {/* Type badge */}
                              <td className="px-3 py-3">
                                {entry.kind === "sale" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
                                    <ShoppingCart className="size-3" />
                                    Sale
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700">
                                    <CheckCircle2 className="size-3" />
                                    Payment
                                  </span>
                                )}
                              </td>

                              {/* Debit */}
                              <td className="px-3 py-3 text-right tabular-nums">
                                {entry.kind === "sale" ? (
                                  <span className="font-medium text-red-600">
                                    {formatCurrency(entry.debit, currency)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>

                              {/* Credit */}
                              <td className="px-3 py-3 text-right tabular-nums">
                                {entry.kind === "payment" ? (
                                  <span className="font-medium text-green-700">
                                    {formatCurrency(entry.credit, currency)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>

                              {/* Running balance */}
                              <td className="px-5 py-3 text-right tabular-nums">
                                <span
                                  className={`font-semibold ${
                                    entry.balance > 0
                                      ? "text-red-600"
                                      : "text-green-700"
                                  }`}
                                >
                                  {formatCurrency(entry.balance, currency)}
                                </span>
                              </td>
                            </tr>

                            {/* Expanded detail row */}
                            {isExpanded && (
                              <tr key={`${entry.id}-detail`} className="bg-muted/20">
                                <td colSpan={6} className="px-5 py-4">
                                  {entry.kind === "sale" ? (
                                    <div className="flex items-start gap-6 text-sm">
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-0.5">Amount charged</p>
                                        <p className="font-semibold text-red-600 tabular-nums">
                                          {formatCurrency(entry.debit, currency)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-0.5">Paid off</p>
                                        <p className="font-semibold text-green-700 tabular-nums">
                                          {formatCurrency(entry.amountPaid, currency)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-0.5">Remaining on this sale</p>
                                        <p className="font-semibold tabular-nums">
                                          {formatCurrency(entry.debit - entry.amountPaid, currency)}
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start gap-6 text-sm flex-wrap">
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-1">Method</p>
                                        <MethodBadge method={entry.method} />
                                      </div>
                                      {entry.recordedBy && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-0.5">Recorded by</p>
                                          <p className="text-sm">{entry.recordedBy}</p>
                                        </div>
                                      )}
                                      {entry.notes && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                                          <p className="text-sm text-muted-foreground">{entry.notes}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                  <PaginationBar
                    page={ledgerCurrentPage}
                    totalPages={ledgerTotalPages}
                    totalItems={ledgerTotalItems}
                    pageSize={ledgerPageSize}
                    startIndex={ledgerStart}
                    endIndex={ledgerEnd}
                    onPageChange={setLedgerPage}
                    onPageSizeChange={setLedgerPageSize}
                    label="transaction"
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {selectedGroup && (
              <p className="text-sm text-muted-foreground">
                Outstanding:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(selectedGroup.outstanding, currency)}
                </span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step="any"
                required
                autoFocus
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Payment Method</Label>
              <Select
                value={payMethod}
                onValueChange={(v) => setPayMethod(v as "cash" | "mobile_money")}
              >
                <SelectTrigger id="pay-method" className="w-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleRecordPayment} disabled={payLoading}>
              {payLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Customer Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                required
                autoFocus
                placeholder="Customer name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone Number (optional)</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="+1 555 000 0000"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleEditCustomer} disabled={editLoading}>
              {editLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{selectedGroup?.name}</span>?
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteCustomer} disabled={deleteLoading}>
                {deleteLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
