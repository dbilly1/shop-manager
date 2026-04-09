"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatAdjustmentReason } from "@/utils/format";
import { Plus, Loader2, CheckCircle, XCircle, Package } from "lucide-react";
import { toast } from "sonner";
import type { SessionContext, AdjustmentReason } from "@/types";
import {
  canApproveAdjustments,
  canAutoApproveAdjustments,
} from "@/lib/permissions";

const REASONS: AdjustmentReason[] = [
  "damage_spoilage",
  "theft",
  "recount_correction",
  "purchase_receiving",
  "return_to_supplier",
  "handling_loss",
  "other",
];

interface Adjustment {
  id: string;
  adjustment_type: string;
  quantity: number;
  reason: string;
  notes: string | null;
  status: string;
  adjusted_by: string;
  adjuster_name: string | null;
  created_at: string;
  product: { name: string; unit_type: string } | null;
}

interface BranchProduct {
  id: string;
  branch_id: string;
  product: { id: string; name: string; unit_type: string } | null;
}

interface Props {
  adjustments: Adjustment[];
  branchProducts: BranchProduct[];
  currency: string;
  session: SessionContext;
  userNames: Record<string, string>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs font-medium px-2.5 py-0.5">
        Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs font-medium px-2.5 py-0.5">
        Rejected
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs font-medium px-2.5 py-0.5">
      Pending
    </Badge>
  );
}

export function AdjustmentsClient({
  adjustments,
  branchProducts,
  session,
  userNames,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  // Form state
  const [bpId, setBpId] = useState("");
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<AdjustmentReason>("recount_correction");
  const [notes, setNotes] = useState("");

  const autoApprove = session.role
    ? canAutoApproveAdjustments(session.role)
    : false;
  const canApprove = session.role ? canApproveAdjustments(session.role) : false;

  function resolveAdjusterName(adj: Adjustment) {
    return (
      adj.adjuster_name ??
      userNames[adj.adjusted_by] ??
      adj.adjusted_by.slice(0, 8) + "…"
    );
  }

  function formatDelta(adj: Adjustment) {
    const sign = adj.adjustment_type === "increase" ? "+" : "-";
    const unit = adj.product?.unit_type ?? "units";
    return `${sign}${adj.quantity.toFixed(3)} ${unit}`;
  }

  async function handleSubmit() {
    const bp = branchProducts.find((b) => b.id === bpId);
    if (!bp?.product || !quantity) {
      toast.error("Select a product and enter a quantity");
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Get the current user's display name from auth metadata
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const adjusterName =
      (user?.user_metadata?.full_name as string | undefined) ??
      user?.email ??
      null;

    if (autoApprove) {
      // Owner / GM: insert as approved and immediately update stock
      const { data: adj, error: insertErr } = await supabase
        .from("stock_adjustments")
        .insert({
          shop_id: session.shop_id,
          branch_id: bp.branch_id,
          product_id: bp.product.id,
          adjustment_type: adjType,
          quantity: qty,
          reason,
          notes: notes || null,
          adjusted_by: session.user_id,
          adjuster_name: adjusterName,
          approved_by: session.user_id,
          status: "approved",
        })
        .select()
        .single();

      if (insertErr || !adj) {
        toast.error(insertErr?.message ?? "Failed to create adjustment");
        setLoading(false);
        return;
      }

      // Update stock directly
      const ut = bp.product.unit_type;
      const stockCol = ut === "kg" ? "current_stock_kg" : "current_stock_units";
      const { data: currentBp, error: bpErr } = await supabase
        .from("branch_products")
        .select("current_stock_kg, current_stock_units")
        .eq("id", bpId)
        .single();

      if (!bpErr && currentBp) {
        const currentStock =
          ut === "kg"
            ? currentBp.current_stock_kg
            : currentBp.current_stock_units;
        const newStock =
          adjType === "increase"
            ? currentStock + qty
            : Math.max(0, currentStock - qty);
        await supabase
          .from("branch_products")
          .update({
            [stockCol]: newStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", bpId);
      }

      toast.success("Adjustment applied");
    } else {
      // Everyone else: insert as pending for GM / owner to review
      const { error } = await supabase.from("stock_adjustments").insert({
        shop_id: session.shop_id,
        branch_id: bp.branch_id,
        product_id: bp.product.id,
        adjustment_type: adjType,
        quantity: qty,
        reason,
        notes: notes || null,
        adjusted_by: session.user_id,
        adjuster_name: adjusterName,
        status: "pending",
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      toast.success("Adjustment submitted for approval");
    }

    setOpen(false);
    setBpId("");
    setQuantity("");
    setNotes("");
    setReason("recount_correction");
    setAdjType("increase");
    setLoading(false);
    router.refresh();
  }

  async function handleApprove(id: string) {
    setApproving(id);
    const res = await fetch("/api/adjustments/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustment_id: id }),
    });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? "Failed to approve");
    } else {
      toast.success("Adjustment approved");
      router.refresh();
    }
    setApproving(null);
  }

  async function handleReject(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("stock_adjustments")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Adjustment rejected");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recent Adjustments</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Adjustment
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[22%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Product
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Reason
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Detail
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Delta (kg/units)
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  By
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Date
                </th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {adjustments.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-16 text-center text-muted-foreground text-sm"
                  >
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No adjustments recorded yet
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => {
                  const isIncrease = adj.adjustment_type === "increase";
                  const canAct =
                    canApprove &&
                    adj.status === "pending" &&
                    adj.adjusted_by !== session.user_id;
                  return (
                    <tr
                      key={adj.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium truncate">
                        {adj.product?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {formatAdjustmentReason(adj.reason)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs truncate">
                        {adj.notes || "—"}
                      </td>
                      <td
                        className={`px-4 py-3.5 font-mono font-semibold ${isIncrease ? "text-green-600" : "text-red-500"}`}
                      >
                        {formatDelta(adj)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={adj.status} />
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground truncate">
                        {resolveAdjusterName(adj)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(adj.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        {canAct ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title="Approve"
                              disabled={approving === adj.id}
                              onClick={() => handleApprove(adj.id)}
                              className="h-7 w-7 rounded flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                            >
                              {approving === adj.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              title="Reject"
                              onClick={() => handleReject(adj.id)}
                              className="h-7 w-7 rounded flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs block text-center">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Adjustment Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setBpId("");
            setQuantity("");
            setNotes("");
            setReason("recount_correction");
            setAdjType("increase");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Stock Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Product */}
            <div className="space-y-1.5">
              <Label>
                Product <span className="text-destructive">*</span>
              </Label>
              <Select value={bpId} onValueChange={(v) => setBpId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select product…" />
                </SelectTrigger>
                <SelectContent>
                  {branchProducts.map((bp) =>
                    bp.product ? (
                      <SelectItem key={bp.id} value={bp.id}>
                        {bp.product.name}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Type toggle */}
            <div className="space-y-1.5">
              <Label>Adjustment Type</Label>
              <div className="flex rounded-md border overflow-hidden">
                {(["increase", "decrease"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAdjType(t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors border-r last:border-r-0 ${
                      adjType === t
                        ? t === "increase"
                          ? "bg-green-600 text-white"
                          : "bg-red-500 text-white"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t === "increase" ? "+ Increase" : "− Decrease"}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label>
                Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.000"
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as AdjustmentReason)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {formatAdjustmentReason(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Detail / notes */}
            <div className="space-y-1.5">
              <Label>
                Detail{" "}
                <span className="text-muted-foreground text-xs">
                  (optional)
                </span>
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Stock loss – 28/03/26"
                rows={2}
              />
            </div>

            {/* Approval notice for non-admins */}
            {!autoApprove && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2 border border-amber-100">
                This adjustment will be sent to the GM or Owner for approval
                before it affects stock.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {autoApprove ? "Apply Adjustment" : "Submit for Approval"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
