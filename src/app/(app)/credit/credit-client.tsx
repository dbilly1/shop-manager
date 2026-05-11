"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/utils/format";
import { toast } from "sonner";
import {
  User,
  Phone,
  Wallet,
  Pencil,
  Trash2,
  Loader2,
  CreditCard,
  TrendingDown,
  CheckCircle2,
  ArrowDownLeft,
  ChevronDown,
  ShoppingCart,
  Store,
  ArrowLeft,
  Search,
} from "lucide-react";
import type { SessionContext } from "@/types";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SaleItem {
  id: string;
  quantity_kg: number;
  quantity_units: number;
  quantity_boxes: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  product: { name: string; unit_type: string; units_per_box: number | null } | null;
}

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
  sale: {
    sale_date: string;
    recorded_by_name: string | null;
    sale_items: SaleItem[];
  } | null;
}

interface CreditPayment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  recorded_by: string | null;
  received_at_shop: boolean;
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

// ─── Ledger entry ─────────────────────────────────────────────────────────────

type LedgerEntry =
  | {
      kind: "sale";
      id: string;
      date: string;
      debit: number;
      balance: number;
      amountPaid: number;
      description: string;
      items: SaleItem[];
      recordedByName: string | null;
    }
  | {
      kind: "payment";
      id: string;
      date: string;
      credit: number;
      balance: number;
      method: string;
      notes: string | null;
      recordedBy: string | null;
      receivedAtShop: boolean;
    };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function formatQty(item: SaleItem): string {
  const parts: string[] = [];
  if (item.quantity_boxes > 0) parts.push(`${item.quantity_boxes} box${item.quantity_boxes !== 1 ? "es" : ""}`);
  if (item.quantity_kg > 0) parts.push(`${item.quantity_kg % 1 === 0 ? item.quantity_kg : item.quantity_kg.toFixed(2)} kg`);
  if (item.quantity_units > 0) parts.push(`${item.quantity_units} unit${item.quantity_units !== 1 ? "s" : ""}`);
  return parts.join(" + ") || "—";
}

function saleDescription(items: SaleItem[]): string {
  const names = items
    .map((i) => i.product?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) return "Credit sale";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(", ");
  return `${names[0]}, +${names.length - 1} more`;
}

function methodLabel(method: string): string {
  if (method === "cash") return "Cash";
  if (method === "mobile_money") return "Mobile Money";
  return method;
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

  // ── Selection + expand ────────────────────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Mobile: "list" shows customer panel full-screen; "detail" shows ledger panel
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // ── Record payment dialog ─────────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "mobile_money">("cash");
  const [payDate, setPayDate] = useState(todayIso());
  const [payNotes, setPayNotes] = useState("");
  const [payReceivedAtShop, setPayReceivedAtShop] = useState(true);
  const [payLoading, setPayLoading] = useState(false);

  // ── Edit payment dialog ───────────────────────────────────────────────────
  const [editPayment, setEditPayment] = useState<CreditPayment | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState<"cash" | "mobile_money">("cash");
  const [editDate, setEditDate] = useState(todayIso());
  const [editNotes, setEditNotes] = useState("");
  const [editReceivedAtShop, setEditReceivedAtShop] = useState(true);
  const [editLoading, setEditLoading] = useState(false);

  // ── Delete payment dialog ─────────────────────────────────────────────────
  const [deletePayment, setDeletePayment] = useState<CreditPayment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Edit customer dialog ──────────────────────────────────────────────────
  const [editCustOpen, setEditCustOpen] = useState(false);
  const [editCustName, setEditCustName] = useState("");
  const [editCustPhone, setEditCustPhone] = useState("");
  const [editCustLoading, setEditCustLoading] = useState(false);

  // ── Delete customer dialog ────────────────────────────────────────────────
  const [deleteCustOpen, setDeleteCustOpen] = useState(false);
  const [deleteCustLoading, setDeleteCustLoading] = useState(false);

  // ── Payment history ───────────────────────────────────────────────────────
  const [payments, setPayments] = useState<CreditPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ─── Group credit sales by customer ──────────────────────────────────────
  const { owingGroups, settledGroups, allGroups } = useMemo(() => {
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

    const q = searchQuery.trim().toLowerCase();
    const all = Array.from(map.values()).filter(
      (g) => !q || g.name.toLowerCase().includes(q) || (g.phone ?? "").includes(q),
    );

    return {
      allGroups: all,
      owingGroups: all
        .filter((g) => g.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding),
      settledGroups: all
        .filter((g) => g.outstanding <= 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [creditSales, searchQuery]);

  const selectedGroup = useMemo(
    () => allGroups.find((g) => g.customerId === selectedCustomerId) ?? null,
    [allGroups, selectedCustomerId],
  );

  // ─── Build chronological ledger ───────────────────────────────────────────
  const ledger = useMemo<LedgerEntry[]>(() => {
    if (!selectedGroup) return [];

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
          description: saleDescription(s.sale?.sale_items ?? []),
          items: s.sale?.sale_items ?? [],
          recordedByName: s.sale?.recorded_by_name ?? null,
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
          receivedAtShop: p.received_at_shop,
        } satisfies LedgerEntry;
      }
    });
  }, [selectedGroup, payments]);

  const ledgerDesc = useMemo(() => [...ledger].reverse(), [ledger]);

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
        .order("payment_date", { ascending: true });
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

  // ─── Recalculate all credit_sale balances for current customer ────────────
  // Called after any payment is added, edited, or deleted to keep balances accurate.
  // Always fetches ALL credit_sales from DB (not just the balance > 0 subset from props).
  async function recalculateBalances(excludePaymentId?: string) {
    if (!selectedGroup) return;

    // Fetch every credit_sale for this customer (props only contain balance > 0 ones)
    const { data: allSales } = await supabase
      .from("credit_sales")
      .select("id, amount_owed, sale_id, created_at, sale:sales(sale_date)")
      .eq("customer_id", selectedGroup.customerId)
      .order("created_at", { ascending: true });

    const sortedSales = (allSales ?? []).sort((a, b) => {
      const saleA = a.sale as unknown as { sale_date: string } | null;
      const saleB = b.sale as unknown as { sale_date: string } | null;
      const da = saleA?.sale_date ?? a.created_at.slice(0, 10);
      const db = saleB?.sale_date ?? b.created_at.slice(0, 10);
      return da.localeCompare(db);
    });

    let paymentsQ = supabase
      .from("credit_payments")
      .select("amount, payment_date")
      .eq("customer_id", selectedGroup.customerId)
      .order("payment_date", { ascending: true });
    if (excludePaymentId) paymentsQ = paymentsQ.neq("id", excludePaymentId);
    const { data: remainingPayments } = await paymentsQ;

    const states = sortedSales.map((s) => ({
      id: s.id,
      amount_owed: s.amount_owed,
      amount_paid: 0,
      balance: s.amount_owed,
    }));

    for (const payment of remainingPayments ?? []) {
      let remaining = payment.amount;
      for (const state of states) {
        if (remaining <= 0) break;
        if (state.balance <= 0) continue;
        const deduct = Math.min(remaining, state.balance);
        state.amount_paid += deduct;
        state.balance -= deduct;
        remaining -= deduct;
      }
    }

    for (const state of states) {
      await supabase
        .from("credit_sales")
        .update({ amount_paid: state.amount_paid, balance: state.balance })
        .eq("id", state.id);
    }
  }

  // ─── Overdue check ────────────────────────────────────────────────────────
  // Only looks at sales that still carry an outstanding balance — a customer
  // shouldn't be flagged overdue based on a sale they've already fully paid.
  function isOverdue(group: CustomerGroup): boolean {
    const unpaidSales = group.sales.filter((s) => s.balance > 0);
    const oldest = unpaidSales.reduce<string | null>((min, s) => {
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
        notes: payNotes.trim() || null,
        recorded_by: session.user_id,
        received_at_shop: payReceivedAtShop,
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

    await recalculateBalances();

    toast.success("Payment recorded");
    setPayOpen(false);
    setPayAmount("");
    setPayNotes("");
    setPayReceivedAtShop(true);
    setPayDate(todayIso());
    setPayLoading(false);
    await loadPayments(selectedGroup.customerId);
    router.refresh();
  }

  // ─── Edit payment ─────────────────────────────────────────────────────────
  function openEditPayment(p: CreditPayment) {
    setEditPayment(p);
    setEditAmount(String(p.amount));
    setEditMethod(p.payment_method as "cash" | "mobile_money");
    setEditDate(p.payment_date);
    setEditNotes(p.notes ?? "");
    setEditReceivedAtShop(p.received_at_shop);
  }

  async function handleEditPayment() {
    if (!editPayment || !selectedGroup) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }

    setEditLoading(true);
    const { data: updated, error } = await supabase
      .from("credit_payments")
      .update({
        amount,
        payment_method: editMethod,
        payment_date: editDate,
        notes: editNotes.trim() || null,
        received_at_shop: editReceivedAtShop,
      })
      .eq("id", editPayment.id)
      .select();

    if (error) { toast.error(error.message); setEditLoading(false); return; }
    if (!updated || updated.length === 0) {
      toast.error("Update failed — you may not have permission to edit this payment.");
      setEditLoading(false);
      return;
    }

    await logAuditAction({
      branchId: selectedGroup.branchId,
      action: "EDIT_CREDIT_PAYMENT",
      entityType: "credit_payment",
      entityId: editPayment.id,
      oldValues: {
        amount: editPayment.amount,
        payment_method: editPayment.payment_method,
        payment_date: editPayment.payment_date,
        notes: editPayment.notes,
        received_at_shop: editPayment.received_at_shop,
      },
      newValues: {
        amount,
        payment_method: editMethod,
        payment_date: editDate,
        notes: editNotes.trim() || null,
        received_at_shop: editReceivedAtShop,
      },
    });

    await recalculateBalances();

    toast.success("Payment updated");
    setEditPayment(null);
    setEditLoading(false);
    await loadPayments(selectedGroup.customerId);
    router.refresh();
  }

  // ─── Delete payment ───────────────────────────────────────────────────────
  async function handleDeletePayment() {
    if (!deletePayment || !selectedGroup) return;
    setDeleteLoading(true);

    const { error } = await supabase
      .from("credit_payments")
      .delete()
      .eq("id", deletePayment.id);

    if (error) { toast.error(error.message); setDeleteLoading(false); return; }

    await logAuditAction({
      branchId: selectedGroup.branchId,
      action: "DELETE_CREDIT_PAYMENT",
      entityType: "credit_payment",
      entityId: deletePayment.id,
      oldValues: {
        amount: deletePayment.amount,
        payment_method: deletePayment.payment_method,
        payment_date: deletePayment.payment_date,
        notes: deletePayment.notes,
        received_at_shop: deletePayment.received_at_shop,
        customer_id: deletePayment.customer_id,
      },
    });

    await recalculateBalances(deletePayment.id);

    toast.success("Payment deleted");
    setDeletePayment(null);
    setDeleteLoading(false);
    await loadPayments(selectedGroup.customerId);
    router.refresh();
  }

  // ─── Edit customer ────────────────────────────────────────────────────────
  function openEditCustomer() {
    if (!selectedGroup) return;
    setEditCustName(selectedGroup.name);
    setEditCustPhone(selectedGroup.phone ?? "");
    setEditCustOpen(true);
  }

  async function handleEditCustomer() {
    if (!selectedGroup || !editCustName.trim()) { toast.error("Name is required"); return; }
    setEditCustLoading(true);
    const { error } = await supabase
      .from("customers")
      .update({ name: editCustName.trim(), phone: editCustPhone.trim() || null })
      .eq("id", selectedGroup.customerId);
    if (error) { toast.error(error.message); setEditCustLoading(false); return; }

    await logAuditAction({
      branchId: selectedGroup.branchId,
      action: "UPDATE_CUSTOMER",
      entityType: "customer",
      entityId: selectedGroup.customerId,
      oldValues: { name: selectedGroup.name, phone: selectedGroup.phone },
      newValues: { name: editCustName.trim(), phone: editCustPhone.trim() || null },
    });

    toast.success("Customer updated");
    setEditCustOpen(false);
    setEditCustLoading(false);
    router.refresh();
  }

  // ─── Delete customer ──────────────────────────────────────────────────────
  async function handleDeleteCustomer() {
    if (!selectedGroup) return;
    if (selectedGroup.sales.length > 0) {
      toast.error("Cannot delete customer with credit history");
      setDeleteCustOpen(false);
      return;
    }
    setDeleteCustLoading(true);
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", selectedGroup.customerId);
    if (error) { toast.error(error.message); setDeleteCustLoading(false); return; }

    await logAuditAction({
      branchId: selectedGroup.branchId,
      action: "DELETE_CUSTOMER",
      entityType: "customer",
      entityId: selectedGroup.customerId,
      oldValues: { name: selectedGroup.name, phone: selectedGroup.phone },
    });

    toast.success("Customer deleted");
    setDeleteCustOpen(false);
    setSelectedCustomerId(null);
    setDeleteCustLoading(false);
    router.refresh();
  }

  // ─── Customer card (shared between owing + settled lists) ────────────────
  function CustomerCard({ group }: { group: CustomerGroup }) {
    const isActive = group.customerId === selectedCustomerId;
    const overdue = group.outstanding > 0 && isOverdue(group);
    const settled = group.outstanding <= 0;
    return (
      <button
        key={group.customerId}
        onClick={() => {
          setSelectedCustomerId(group.customerId);
          setMobileView("detail");
        }}
        className={`border rounded-lg p-3 w-full text-left transition-colors ${
          isActive
            ? "border-primary bg-primary/5"
            : settled
            ? "border-border/50 bg-muted/20 hover:bg-muted/40 opacity-60"
            : "border-border bg-background hover:bg-muted/50"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-sm leading-tight line-clamp-1">{group.name}</span>
          {settled ? (
            <Badge className="shrink-0 bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Settled</Badge>
          ) : (
            <Badge variant="destructive" className="shrink-0 tabular-nums">
              {formatCurrency(group.outstanding, currency)}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          {group.phone ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="size-3" />
              <span>{group.phone}</span>
            </div>
          ) : <span />}
          {overdue && <span className="text-xs font-medium text-red-600">Overdue</span>}
        </div>
      </button>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-4 md:-m-6">

      {/* ── Left panel: customer list ── */}
      <div className={`border-r flex-col md:flex md:w-72 md:shrink-0 md:flex-none ${mobileView === "list" ? "flex flex-1" : "hidden"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">Customers</h2>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-muted/30 focus:outline-none focus:border-primary/50 focus:bg-background transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {owingGroups.length === 0 && settledGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-xs text-center px-4">
              <CreditCard className="size-8 mb-2 opacity-40" />
              {searchQuery ? "No customers match your search" : "No credit records found"}
            </div>
          ) : (
            <>
              {/* Owing customers */}
              {owingGroups.map((group) => <CustomerCard key={group.customerId} group={group} />)}

              {/* Settled customers — shown below with a divider */}
              {settledGroups.length > 0 && (
                <>
                  <div className="px-1 pt-3 pb-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Settled</span>
                    <div className="mt-1 h-px bg-border" />
                  </div>
                  {settledGroups.map((group) => <CustomerCard key={group.customerId} group={group} />)}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel: ledger ── */}
      <div className={`flex-col overflow-hidden md:flex md:flex-1 ${mobileView === "detail" ? "flex flex-1" : "hidden"}`}>
        {!selectedGroup ? (
          <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <User className="size-12 opacity-30" />
            <p className="text-sm">Select a customer to view their credit history</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b px-4 md:px-6 py-4 shrink-0 bg-background">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Back button — mobile only */}
                  <button
                    onClick={() => setMobileView("list")}
                    className="md:hidden shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Back to customers"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-base leading-tight truncate">{selectedGroup.name}</h2>
                    {selectedGroup.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="size-3" />{selectedGroup.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={openEditCustomer} aria-label="Edit customer">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteCustOpen(true)}
                    className="text-destructive hover:text-destructive" aria-label="Delete customer">
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button size="sm" onClick={() => {
                    setPayAmount(""); setPayDate(todayIso());
                    setPayMethod("cash"); setPayNotes(""); setPayReceivedAtShop(true);
                    setPayOpen(true);
                  }} aria-label="Record Payment">
                    <Wallet className="size-3.5 md:mr-1.5" />
                    <span className="hidden md:inline">Record Payment</span>
                  </Button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingDown className="size-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Total Credit</p>
                  </div>
                  <p className="font-bold text-sm tabular-nums">{formatCurrency(selectedGroup.totalOwed, currency)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="size-3.5 text-green-600" />
                    <p className="text-xs text-muted-foreground">Total Paid</p>
                  </div>
                  <p className="font-bold text-sm text-green-700 tabular-nums">{formatCurrency(selectedGroup.totalPaid, currency)}</p>
                </div>
                <div className={`rounded-lg border px-4 py-3 ${selectedGroup.outstanding > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowDownLeft className={`size-3.5 ${selectedGroup.outstanding > 0 ? "text-red-500" : "text-green-600"}`} />
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                  </div>
                  <p className={`font-bold text-sm tabular-nums ${selectedGroup.outstanding > 0 ? "text-red-700" : "text-green-700"}`}>
                    {formatCurrency(selectedGroup.outstanding, currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Transaction History ── */}
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
                  {/* Section title */}
                  <div className="px-6 py-3 border-b">
                    <h3 className="text-sm font-semibold">Transaction History</h3>
                  </div>

                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="sticky top-0 bg-background border-b z-10">
                      <tr className="text-xs text-muted-foreground">
                        <th className="px-5 py-3 text-left font-medium">Date</th>
                        <th className="px-3 py-3 text-left font-medium">Type</th>
                        <th className="px-3 py-3 text-left font-medium">Description</th>
                        <th className="px-3 py-3 text-right font-medium">Amount</th>
                        <th className="px-5 py-3 text-right font-medium">Balance</th>
                        <th className="px-4 py-3 w-24 text-right text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ledgerPage.map((entry) => {
                        const isExpanded = expandedId === entry.id;
                        return (
                          <Fragment key={entry.id}>
                            {/* ── Main row ── */}
                            <tr
                              onClick={() =>
                                entry.kind === "sale"
                                  ? setExpandedId(isExpanded ? null : entry.id)
                                  : undefined
                              }
                              className={`transition-colors ${
                                entry.kind === "sale"
                                  ? "hover:bg-muted/40 cursor-pointer"
                                  : "hover:bg-muted/20"
                              }`}
                            >
                              {/* Date */}
                              <td className="px-5 py-3 whitespace-nowrap text-muted-foreground text-xs">
                                {formatDate(entry.date)}
                              </td>

                              {/* Type badge */}
                              <td className="px-3 py-3">
                                {entry.kind === "sale" ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium bg-background text-foreground">
                                    <ShoppingCart className="size-3 text-muted-foreground" />
                                    Sale
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                    <CheckCircle2 className="size-3" />
                                    Payment
                                  </span>
                                )}
                              </td>

                              {/* Description */}
                              <td className="px-3 py-3 text-sm">
                                {entry.kind === "sale"
                                  ? entry.description
                                  : methodLabel(entry.method)}
                              </td>

                              {/* Amount */}
                              <td className="px-3 py-3 text-right tabular-nums font-medium">
                                {entry.kind === "sale" ? (
                                  <span className="text-red-600">{formatCurrency(entry.debit, currency)}</span>
                                ) : (
                                  <span className="text-green-700">{formatCurrency(entry.credit, currency)}</span>
                                )}
                              </td>

                              {/* Running balance */}
                              <td className="px-5 py-3 text-right tabular-nums">
                                <span className={`font-semibold ${entry.balance > 0 ? "text-red-600" : "text-green-700"}`}>
                                  {formatCurrency(entry.balance, currency)}
                                </span>
                              </td>

                              {/* Actions column */}
                              <td className="pr-4 py-3">
                                {entry.kind === "sale" ? (
                                  <ChevronDown
                                    className={`size-4 text-muted-foreground ml-auto transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const p = payments.find((p) => p.id === entry.id);
                                        if (p) openEditPayment(p);
                                      }}
                                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                      aria-label="Edit payment"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const p = payments.find((p) => p.id === entry.id);
                                        if (p) setDeletePayment(p);
                                      }}
                                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                      aria-label="Delete payment"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* ── Expanded sale detail ── */}
                            {entry.kind === "sale" && isExpanded && (
                              <tr key={`${entry.id}-detail`}>
                                <td colSpan={6} className="bg-muted/30 px-8 py-4 border-b">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                                    Items in this sale
                                  </p>
                                  {entry.items.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No item details available</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-muted-foreground border-b">
                                          <th className="text-left pb-2 font-medium">Product</th>
                                          <th className="text-left pb-2 font-medium">Qty</th>
                                          <th className="text-right pb-2 font-medium">Unit Price</th>
                                          <th className="text-right pb-2 font-medium">Discount</th>
                                          <th className="text-right pb-2 font-medium">Line Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/50">
                                        {entry.items.map((item) => (
                                          <tr key={item.id}>
                                            <td className="py-2 font-medium pr-4">{item.product?.name ?? "—"}</td>
                                            <td className="py-2 text-muted-foreground">{formatQty(item)}</td>
                                            <td className="py-2 text-right tabular-nums">{formatCurrency(item.unit_price, currency)}</td>
                                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                                              {item.discount_amount > 0
                                                ? formatCurrency(item.discount_amount, currency)
                                                : "—"}
                                            </td>
                                            <td className="py-2 text-right tabular-nums font-semibold">{formatCurrency(item.line_total, currency)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                  {entry.recordedByName && (
                                    <p className="text-xs text-muted-foreground mt-3">
                                      Recorded by {entry.recordedByName}
                                    </p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </div>

            {/* Pagination — outside scroll area so it sits as a fixed bottom bar */}
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

      {/* ── Record Payment Dialog ── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment — {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {selectedGroup && (
              <p className="text-sm text-muted-foreground">
                Outstanding:{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(selectedGroup.outstanding, currency)}
                </span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount ({currency})</Label>
              <Input id="pay-amount" type="number" min={0} step="any" required autoFocus
                placeholder="0.00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Payment Method</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as "cash" | "mobile_money")}>
                <SelectTrigger id="pay-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date</Label>
              <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Textarea id="pay-notes" placeholder="Any notes…" rows={2}
                value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
            </div>
            {/* Received at shop */}
            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${payReceivedAtShop ? "border-primary/40 bg-primary/5" : "border-border"}`}>
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded accent-primary cursor-pointer"
                checked={payReceivedAtShop}
                onChange={(e) => setPayReceivedAtShop(e.target.checked)}
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Store className="size-3.5" />
                  Received at shop
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tick this if the cash is physically in the till. This will include it in daily reconciliation.
                </p>
              </div>
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleRecordPayment} disabled={payLoading}>
                {payLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Record Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Payment Dialog ── */}
      <Dialog open={!!editPayment} onOpenChange={(o) => { if (!o) setEditPayment(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-pay-amount">Amount ({currency})</Label>
              <Input id="edit-pay-amount" type="number" min={0} step="any" required autoFocus
                placeholder="0.00" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pay-method">Payment Method</Label>
              <Select value={editMethod} onValueChange={(v) => setEditMethod(v as "cash" | "mobile_money")}>
                <SelectTrigger id="edit-pay-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pay-date">Date</Label>
              <Input id="edit-pay-date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pay-notes">Notes (optional)</Label>
              <Textarea id="edit-pay-notes" placeholder="Any notes…" rows={2}
                value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${editReceivedAtShop ? "border-primary/40 bg-primary/5" : "border-border"}`}>
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded accent-primary cursor-pointer"
                checked={editReceivedAtShop}
                onChange={(e) => setEditReceivedAtShop(e.target.checked)}
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Store className="size-3.5" />
                  Received at shop
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tick this if the cash is physically in the till. This will include it in daily reconciliation.
                </p>
              </div>
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditPayment(null)}>Cancel</Button>
              <Button className="flex-1" onClick={handleEditPayment} disabled={editLoading}>
                {editLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Payment Dialog ── */}
      <Dialog open={!!deletePayment} onOpenChange={(o) => { if (!o) setDeletePayment(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Payment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the{" "}
            <span className="font-medium text-foreground">
              {deletePayment ? formatCurrency(deletePayment.amount, currency) : ""} payment
            </span>{" "}
            and recalculate the outstanding balance. This cannot be undone.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeletePayment(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeletePayment} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Customer Dialog ── */}
      <Dialog open={editCustOpen} onOpenChange={setEditCustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cust-name">Full Name</Label>
              <Input id="edit-cust-name" required autoFocus placeholder="Customer name"
                value={editCustName} onChange={(e) => setEditCustName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cust-phone">Phone Number (optional)</Label>
              <Input id="edit-cust-phone" type="tel" placeholder="+1 555 000 0000"
                value={editCustPhone} onChange={(e) => setEditCustPhone(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleEditCustomer} disabled={editCustLoading}>
              {editCustLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Customer Dialog ── */}
      <Dialog open={deleteCustOpen} onOpenChange={setDeleteCustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{selectedGroup?.name}</span>?
            This action cannot be undone.
          </p>
          <div className="flex gap-2 pt-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteCustOpen(false)} disabled={deleteCustLoading}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCustomer} disabled={deleteCustLoading}>
              {deleteCustLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
