"use client";

import { useState, useMemo } from "react";
import { usePagination } from "@/hooks/usePagination";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { hasBoxes, boxesToPrimary, primaryToBoxes } from "@/utils/boxes";
import {
  Search,
  Plus,
  Pencil,
  PlusCircle,
  Truck,
  Loader2,
  X,
  Package,
  Tag,
  Trash2,
  ArrowUpDown,
  AlertTriangle,
  CircleOff,
  DollarSign,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { logAuditAction } from "@/lib/audit-action";
import type { SessionContext } from "@/types";
import { canManageInventory } from "@/lib/permissions";
import { useBranch } from "@/hooks/useBranch";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";

const UNIT_TYPES = ["units", "kg"] as const;

interface Category {
  id: string;
  name: string;
}

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
    sku: string | null;
    category: string | null;
    unit_type: string;
    units_per_box: number | null;
    base_price: number;
    cost_price: number;
    reorder_threshold: number;
    audit_threshold_pct: number | null;
  } | null;
}

interface BulkRestockRow {
  branch_product_id: string;
  product_id: string;
  product_name: string;
  unit_type: string;
  units_per_box: number | null;   // pre-filled from product, editable
  qty: number;
  boxes: number;
  cost_per_unit: number;          // used when qty > 0
  cost_per_box: number;           // used when boxes > 0
  supplier: string;
  notes: string;
}

interface Props {
  branchProducts: BranchProduct[];
  currency: string;
  session: SessionContext;
  branches: { id: string; name: string }[];
  categories: Category[];
}

function getStock(bp: BranchProduct): number {
  if (!bp.product) return 0;
  return bp.product.unit_type === "kg"
    ? bp.current_stock_kg
    : bp.current_stock_units;
}

function estBoxes(bp: BranchProduct): string {
  if (!bp.product || !hasBoxes(bp.product.units_per_box)) return "—";
  const qty = getStock(bp);
  const boxes = primaryToBoxes(qty, bp.product.units_per_box);
  return `~${boxes.toFixed(2)}`;
}

function isLowStock(bp: BranchProduct): boolean {
  if (!bp.product) return false;
  return getStock(bp) <= bp.product.reorder_threshold;
}

function isOutOfStock(bp: BranchProduct): boolean {
  return getStock(bp) <= 0;
}

function stockDisplay(bp: BranchProduct) {
  if (!bp.product) return { text: "—", low: false, out: false };
  const qty = getStock(bp);
  const out = qty <= 0;
  const low = !out && qty <= bp.product.reorder_threshold;
  const text =
    bp.product.unit_type === "kg" ? `${qty.toFixed(3)} kg` : `${qty} units`;
  return { text, low, out };
}

function emptyBulkRow(): BulkRestockRow {
  return {
    branch_product_id: "",
    product_id: "",
    product_name: "",
    unit_type: "units",
    units_per_box: null,
    qty: 0,
    boxes: 0,
    cost_per_unit: 0,
    cost_per_box: 0,
    supplier: "",
    notes: "",
  };
}

/** Total cost for a single bulk row */
function rowTotalCost(row: BulkRestockRow): number {
  return (row.boxes > 0 ? row.boxes * row.cost_per_box : 0)
       + (row.qty    > 0 ? row.qty    * row.cost_per_unit  : 0);
}

/** Derive cost_per_unit from cost_per_box when restocking in boxes */
function costPerUnitFromBox(costPerBox: number, unitsPerBox: number | null): number {
  if (!unitsPerBox || unitsPerBox <= 0) return 0;
  return costPerBox / unitsPerBox;
}

export function InventoryClient({
  branchProducts,
  currency,
  session,
  branches,
  categories: initialCategories,
}: Props) {
  const router = useRouter();
  const { selectedBranchId } = useBranch();
  const canManage = canManageInventory(session.role!);
  const canShopDelete = ["owner", "general_manager"].includes(session.role!);

  // True when a shop-level user hasn't picked a specific branch in the topnav
  const isAllBranchesView = !session.branch_id && !selectedBranchId;

  // ─── Categories state ───────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [catDeleting, setCatDeleting] = useState<string | null>(null);

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setCatSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("product_categories")
      .insert({ shop_id: session.shop_id, name })
      .select("id, name")
      .single();
    setCatSaving(false);
    if (error) {
      toast.error(
        error.message.includes("unique")
          ? "Category already exists"
          : error.message,
      );
      return;
    }
    setCategories((prev) =>
      [...prev, data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setNewCatName("");
    toast.success("Category added");
  }

  async function deleteCategory(id: string) {
    setCatDeleting(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("id", id);
    setCatDeleting(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast.success("Category removed");
  }

  // ─── Filters ────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  type SortKey =
    | "name_asc"
    | "name_desc"
    | "stock_asc"
    | "stock_desc"
    | "best_selling"
    | "low_selling";
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");

  // ─── Deletion confirm state ──────────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<"branch" | "shop" | null>(null);
  const [removing, setRemoving] = useState(false);

  // ─── Add/Edit Product dialog ─────────────────────────────────────
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingBp, setEditingBp] = useState<BranchProduct | null>(null);
  const [pName, setPName] = useState("");
  const [pSku, setPSku] = useState("");
  const [pCategory, setPCategory] = useState("");
  const [pUnitType, setPUnitType] = useState("units");
  const [pUnitsPerBox, setPUnitsPerBox] = useState("");
  const [pSellingPrice, setPSellingPrice] = useState("");
  const [pLowStockThreshold, setPLowStockThreshold] = useState("5");
  const [pAuditThreshold, setPAuditThreshold] = useState("");
  const [pOpeningQty, setPOpeningQty] = useState("");
  const [pOpeningBoxes, setPOpeningBoxes] = useState("");
  const [pOpeningCost, setPOpeningCost] = useState("");
  const [pSaving, setPSaving] = useState(false);

  // ─── Barcode scanner ──────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"search" | "sku">("search");

  // ─── Single Restock dialog ───────────────────────────────────────
  const [restockBp, setRestockBp] = useState<BranchProduct | null>(null);
  const [rQty, setRQty] = useState("");
  const [rBoxes, setRBoxes] = useState("");
  const [rUnitsPerBox, setRUnitsPerBox] = useState("");   // editable qty/box
  const [rCostPerUnit, setRCostPerUnit] = useState("");
  const [rCostPerBox, setRCostPerBox] = useState("");
  const [rSupplier, setRSupplier] = useState("");
  const [rNotes, setRNotes] = useState("");
  const [rSaving, setRSaving] = useState(false);

  // ─── Bulk Restock dialog ─────────────────────────────────────────
  const [bulkRestockOpen, setBulkRestockOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRestockRow[]>([
    emptyBulkRow(),
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // ─── Base product list (aggregated in All-Branches view) ────────
  const baseProducts = useMemo((): BranchProduct[] => {
    if (isAllBranchesView) {
      // One row per product — sum stock across all branches
      const map = new Map<string, BranchProduct>();
      for (const bp of branchProducts) {
        if (!bp.product) continue;
        const existing = map.get(bp.product.id);
        if (existing) {
          existing.current_stock_kg += bp.current_stock_kg;
          existing.current_stock_units += bp.current_stock_units;
          existing.current_stock_boxes += bp.current_stock_boxes;
        } else {
          map.set(bp.product.id, { ...bp }); // shallow copy
        }
      }
      return Array.from(map.values());
    }
    if (session.branch_id) return branchProducts; // branch-scoped session
    // Shop-level with a specific branch selected in topnav
    return branchProducts.filter((bp) => bp.branch_id === selectedBranchId);
  }, [branchProducts, isAllBranchesView, selectedBranchId, session.branch_id]);

  // ─── Total stock for the product currently being edited ─────────
  const totalStockForEditing = useMemo(() => {
    if (!editingBp?.product) return 0;
    return branchProducts
      .filter((bp) => bp.product?.id === editingBp.product!.id)
      .reduce((sum, bp) => sum + getStock(bp), 0);
  }, [editingBp, branchProducts]);

  // ─── Summary stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = baseProducts.filter((bp) => bp.product).length;
    const lowStock = baseProducts.filter(
      (bp) => bp.product && isLowStock(bp) && !isOutOfStock(bp),
    ).length;
    const outOfStock = baseProducts.filter((bp) => isOutOfStock(bp)).length;
    const totalValue = baseProducts.reduce((sum, bp) => {
      if (!bp.product) return sum;
      return sum + getStock(bp) * bp.product.cost_price;
    }, 0);
    return { active, lowStock, outOfStock, totalValue };
  }, [baseProducts]);

  // ─── Filtered rows ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const items = baseProducts.filter((bp) => {
      if (!bp.product) return false;
      const q = search.toLowerCase();
      if (
        q &&
        !bp.product.name.toLowerCase().includes(q) &&
        !(bp.product.category ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    switch (sortKey) {
      case "name_asc":
        return [...items].sort((a, b) =>
          (a.product?.name ?? "").localeCompare(b.product?.name ?? ""),
        );
      case "name_desc":
        return [...items].sort((a, b) =>
          (b.product?.name ?? "").localeCompare(a.product?.name ?? ""),
        );
      case "stock_asc":
        return [...items].sort((a, b) => getStock(a) - getStock(b));
      case "stock_desc":
        return [...items].sort((a, b) => getStock(b) - getStock(a));
      case "best_selling":
        // Highest sell price first as a proxy for best-selling
        return [...items].sort((a, b) => {
          const aPrice = a.override_price ?? a.product?.base_price ?? 0;
          const bPrice = b.override_price ?? b.product?.base_price ?? 0;
          return bPrice - aPrice;
        });
      case "low_selling":
        return [...items].sort((a, b) => {
          const aPrice = a.override_price ?? a.product?.base_price ?? 0;
          const bPrice = b.override_price ?? b.product?.base_price ?? 0;
          return aPrice - bPrice;
        });
      default:
        return items;
    }
  }, [baseProducts, search, sortKey]);

  // ─── Inventory pagination ────────────────────────────────────────
  const {
    paginatedData: invPage,
    page: invCurrentPage,
    setPage: setInvPage,
    pageSize: invPageSize,
    setPageSize: setInvPageSize,
    totalPages: invTotalPages,
    totalItems: invTotalItems,
    startIndex: invStart,
    endIndex: invEnd,
  } = usePagination(filtered);

  // ─── Product dialog helpers ──────────────────────────────────────
  function handleScan(code: string) {
    if (scanMode === "sku") {
      setPSku(code)
      toast.success("SKU filled from barcode")
    } else {
      // Search mode: look up by SKU in the current product list
      const found = baseProducts.find((bp) => bp.product?.sku === code)
      if (found) {
        setSearch(found.product!.name)
        toast.success(`Found: ${found.product!.name}`)
      } else {
        setSearch(code)
        toast.info(`Barcode scanned: ${code}`)
      }
    }
  }

  function openAddProduct() {
    // Shop-level users must pick a branch first — "All Branches" would
    // duplicate the product across every branch simultaneously.
    if (!session.branch_id && !selectedBranchId) {
      toast.error("Select a branch first — you're currently viewing all branches")
      return
    }
    setEditingBp(null);
    setPName("");
    setPSku("");
    setPCategory("");
    setPUnitType("units");
    setPUnitsPerBox("");
    setPSellingPrice("");
    setPLowStockThreshold("5");
    setPAuditThreshold("");
    setPOpeningQty("");
    setPOpeningBoxes("");
    setPOpeningCost("");
    setProductDialogOpen(true);
  }

  function openEditProduct(bp: BranchProduct) {
    if (!bp.product) return;
    setEditingBp(bp);
    setConfirmAction(null);
    setPName(bp.product.name);
    setPSku(bp.product.sku ?? "");
    setPCategory(bp.product.category ?? "");
    setPUnitType(bp.product.unit_type);
    setPUnitsPerBox(
      bp.product.units_per_box != null ? String(bp.product.units_per_box) : "",
    );
    // In All Branches view there's no single override price; show base_price
    setPSellingPrice(
      String(isAllBranchesView ? bp.product.base_price : (bp.override_price ?? bp.product.base_price)),
    );
    setPLowStockThreshold(String(bp.product.reorder_threshold));
    setPAuditThreshold(bp.product.audit_threshold_pct != null ? String(bp.product.audit_threshold_pct) : "");
    setProductDialogOpen(true);
  }

  async function saveProduct() {
    if (!pName.trim() || !pSellingPrice) {
      toast.error("Product name and selling price are required");
      return;
    }
    setPSaving(true);
    const supabase = createClient();

    if (editingBp) {
      const { error } = await supabase
        .from("products")
        .update({
          name: pName.trim(),
          sku: pSku.trim() || null,
          category: pCategory || null,
          unit_type: pUnitType,
          units_per_box: pUnitsPerBox ? parseFloat(pUnitsPerBox) : null,
          base_price: parseFloat(pSellingPrice),
          reorder_threshold: parseFloat(pLowStockThreshold) || 0,
          audit_threshold_pct: pAuditThreshold ? parseFloat(pAuditThreshold) : null,
        })
        .eq("id", editingBp.product!.id);
      if (error) {
        toast.error(error.message);
        setPSaving(false);
        return;
      }
      // Only update branch-level override when editing from a specific branch
      if (!isAllBranchesView && editingBp.override_price !== null) {
        await supabase
          .from("branch_products")
          .update({ override_price: parseFloat(pSellingPrice) })
          .eq("id", editingBp.id);
      }
      void logAuditAction({
        branchId: session.branch_id ?? selectedBranchId ?? null,
        action: "UPDATE_PRODUCT",
        entityType: "product",
        entityId: editingBp.product!.id,
        oldValues: {
          name: editingBp.product!.name,
          sku: editingBp.product!.sku,
          category: editingBp.product!.category,
          unit_type: editingBp.product!.unit_type,
          units_per_box: editingBp.product!.units_per_box,
          base_price: editingBp.product!.base_price,
          reorder_threshold: editingBp.product!.reorder_threshold,
          audit_threshold_pct: editingBp.product!.audit_threshold_pct,
        },
        newValues: {
          name: pName.trim(),
          sku: pSku.trim() || null,
          category: pCategory || null,
          unit_type: pUnitType,
          units_per_box: pUnitsPerBox ? parseFloat(pUnitsPerBox) : null,
          base_price: parseFloat(pSellingPrice),
          reorder_threshold: parseFloat(pLowStockThreshold) || 0,
          audit_threshold_pct: pAuditThreshold ? parseFloat(pAuditThreshold) : null,
        },
      });
      toast.success("Product updated");
    } else {
      const targetBranchId = session.branch_id ?? selectedBranchId
      const branchIds = targetBranchId ? [targetBranchId] : branches.map((b) => b.id)

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pName.trim(),
          sku: pSku.trim() || null,
          category: pCategory || null,
          unit_type: pUnitType,
          units_per_box: pUnitsPerBox || null,
          base_price: pSellingPrice,
          cost_price: pOpeningCost || "0",
          reorder_threshold: pLowStockThreshold || "0",
          audit_threshold_pct: pAuditThreshold || null,
          opening_qty: pOpeningQty,
          opening_boxes: pOpeningBoxes,
          branch_ids: branchIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create product")
        setPSaving(false)
        return
      }
      toast.success("Product created");
    }

    setProductDialogOpen(false);
    setPSaving(false);
    router.refresh();
  }

  // ─── Branch-level removal ────────────────────────────────────────
  async function removeFromBranch() {
    if (!editingBp) return;
    if (getStock(editingBp) > 0) {
      toast.error("Zero out this branch's stock before removing the product");
      setConfirmAction(null);
      return;
    }
    setRemoving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("branch_products")
      .update({ is_active: false })
      .eq("id", editingBp.id);
    setRemoving(false);
    if (error) { toast.error(error.message); return; }
    void logAuditAction({
      branchId: editingBp.branch_id,
      action: "DISCONTINUE_PRODUCT",
      entityType: "product",
      entityId: editingBp.product!.id,
      oldValues: { name: editingBp.product!.name, scope: "branch", branch_id: editingBp.branch_id },
    });
    toast.success("Product removed from this branch");
    setProductDialogOpen(false);
    setConfirmAction(null);
    router.refresh();
  }

  // ─── Shop-level discontinue / delete ─────────────────────────────
  async function discontinueShopWide() {
    if (!editingBp?.product) return;
    if (totalStockForEditing > 0) {
      toast.error("Stock must be zero across all branches before discontinuing");
      setConfirmAction(null);
      return;
    }
    setRemoving(true);
    const supabase = createClient();
    // Check if this product has any sales history
    const { count } = await supabase
      .from("sale_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", editingBp.product.id);

    if ((count ?? 0) > 0) {
      // Soft delete — preserve history
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", editingBp.product.id);
      if (error) { toast.error(error.message); setRemoving(false); return; }
      void logAuditAction({
        action: "DISCONTINUE_PRODUCT",
        entityType: "product",
        entityId: editingBp.product.id,
        oldValues: { name: editingBp.product.name, scope: "shop", method: "soft_delete" },
      });
      toast.success("Product discontinued (hidden from active lists)");
    } else {
      // Hard delete — no history to preserve
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", editingBp.product.id);
      if (error) { toast.error(error.message); setRemoving(false); return; }
      void logAuditAction({
        action: "DISCONTINUE_PRODUCT",
        entityType: "product",
        entityId: editingBp.product.id,
        oldValues: { name: editingBp.product.name, scope: "shop", method: "hard_delete" },
      });
      toast.success("Product permanently deleted");
    }
    setRemoving(false);
    setProductDialogOpen(false);
    setConfirmAction(null);
    router.refresh();
  }

  // ─── Restock helpers ─────────────────────────────────────────────
  function openRestock(bp: BranchProduct) {
    setRestockBp(bp);
    setRQty("");
    setRBoxes("");
    setRUnitsPerBox(String(bp.product?.units_per_box ?? ""));
    setRCostPerUnit(String(bp.product?.cost_price ?? ""));
    const upb = bp.product?.units_per_box;
    setRCostPerBox(upb && bp.product ? String((bp.product.cost_price * upb).toFixed(2)) : "");
    setRSupplier("");
    setRNotes("");
  }

  async function saveRestock() {
    if (!restockBp) return;
    const qty   = parseFloat(rQty)   || 0;
    const boxes = parseFloat(rBoxes) || 0;
    if (qty === 0 && boxes === 0) { toast.error("Enter quantity or boxes"); return; }

    const unitsPerBox    = parseFloat(rUnitsPerBox) || restockBp.product?.units_per_box || null;
    const costPerBox     = parseFloat(rCostPerBox)  || 0;
    const costPerUnitRaw = parseFloat(rCostPerUnit) || 0;

    // If restocking in boxes, derive cost_per_unit from cost_per_box
    const costPerUnit = boxes > 0 && costPerBox > 0 && unitsPerBox
      ? costPerUnitFromBox(costPerBox, unitsPerBox)
      : costPerUnitRaw;

    setRSaving(true);
    const supabase = createClient();
    const ut = restockBp.product?.unit_type ?? "units";
    const boxPrimary  = boxesToPrimary(boxes, unitsPerBox);
    const totalPrimary = qty + boxPrimary;

    // Update units_per_box on the product if it was changed
    const originalUpb = restockBp.product?.units_per_box ?? null;
    if (unitsPerBox && unitsPerBox !== originalUpb && restockBp.product) {
      await supabase.from("products").update({ units_per_box: unitsPerBox }).eq("id", restockBp.product.id);
    }

    const update: Record<string, number> = {};
    if (ut === "kg") update.current_stock_kg    = restockBp.current_stock_kg    + totalPrimary;
    else             update.current_stock_units  = restockBp.current_stock_units + totalPrimary;

    const { error } = await supabase
      .from("branch_products")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", restockBp.id);
    if (error) { toast.error(error.message); setRSaving(false); return; }

    // Weighted-average cost price update — only if a cost was provided
    if (costPerUnit > 0) {
      const currentStock = ut === "kg" ? restockBp.current_stock_kg : restockBp.current_stock_units;
      const oldCost = restockBp.product?.cost_price ?? 0;
      const newAvgCost = currentStock + totalPrimary > 0
        ? (currentStock * oldCost + totalPrimary * costPerUnit) / (currentStock + totalPrimary)
        : costPerUnit;
      await supabase.from("products").update({ cost_price: newAvgCost }).eq("id", restockBp.product!.id);
    }

    await supabase.from("restocks").insert({
      shop_id:                  session.shop_id,
      branch_id:                restockBp.branch_id,
      product_id:               restockBp.product?.id,
      quantity_kg:              ut === "kg" ? totalPrimary : 0,
      quantity_units:           ut === "units" ? totalPrimary : 0,
      quantity_boxes:           boxes,
      cost_per_unit:            costPerUnit,
      cost_per_box:             boxes > 0 ? costPerBox : null,
      units_per_box_at_restock: boxes > 0 ? unitsPerBox : null,
      supplier:                 rSupplier || null,
      notes:                    rNotes    || null,
      recorded_by:              session.user_id,
      recorded_by_name:         session.full_name ?? null,
    }).maybeSingle();

    void logAuditAction({
      branchId: restockBp.branch_id,
      action: "RESTOCK_PRODUCT",
      entityType: "product",
      entityId: restockBp.product!.id,
      newValues: {
        product_name: restockBp.product!.name,
        quantity_added: totalPrimary,
        quantity_boxes: boxes,
        unit_type: ut,
        cost_per_unit: costPerUnit,
        supplier: rSupplier || null,
      },
    });

    toast.success("Stock updated");
    setRestockBp(null);
    setRSaving(false);
    router.refresh();
  }

  // ─── Bulk restock helpers ────────────────────────────────────────
  function updateBulkRow(
    idx: number,
    field: keyof BulkRestockRow,
    value: string | number,
  ) {
    setBulkRows((prev) => {
      const next = [...prev];
      if (field === "branch_product_id") {
        const bp = branchProducts.find((p) => p.id === value);
        if (bp?.product) {
          const upb = bp.product.units_per_box ?? null;
          next[idx] = {
            ...next[idx],
            branch_product_id: bp.id,
            product_id:        bp.product.id,
            product_name:      bp.product.name,
            unit_type:         bp.product.unit_type,
            units_per_box:     upb,
            cost_per_unit:     bp.product.cost_price,
            cost_per_box:      upb ? bp.product.cost_price * upb : 0,
          };
        }
      } else if (field === "cost_per_box") {
        // Auto-derive cost_per_unit when cost_per_box changes
        const row = next[idx];
        const cpb = Number(value);
        next[idx] = {
          ...row,
          cost_per_box:  cpb,
          cost_per_unit: costPerUnitFromBox(cpb, row.units_per_box),
        };
      } else if (field === "cost_per_unit") {
        // Auto-derive cost_per_box when cost_per_unit changes
        const row = next[idx];
        const cpu = Number(value);
        next[idx] = {
          ...row,
          cost_per_unit: cpu,
          cost_per_box:  row.units_per_box ? cpu * row.units_per_box : 0,
        };
      } else {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  }

  async function saveBulkRestock() {
    const validRows = bulkRows.filter(
      (r) => r.branch_product_id && (r.qty > 0 || r.boxes > 0),
    );
    if (validRows.length === 0) {
      toast.error("Add at least one row with a product and quantity");
      return;
    }
    setBulkSaving(true);
    const supabase = createClient();

    for (const row of validRows) {
      const bp = branchProducts.find((p) => p.id === row.branch_product_id);
      if (!bp) continue;
      const ut = row.unit_type;

      // Resolve units_per_box: use row value (user may have edited it)
      const unitsPerBox = row.units_per_box;
      const boxPrimary  = boxesToPrimary(row.boxes, unitsPerBox);
      const totalPrimary = row.qty + boxPrimary;

      // Resolve effective cost_per_unit
      // If restocked in boxes → derive from cost_per_box; otherwise use cost_per_unit directly
      const effectiveCpu = row.boxes > 0 && row.cost_per_box > 0 && unitsPerBox
        ? costPerUnitFromBox(row.cost_per_box, unitsPerBox)
        : row.cost_per_unit;

      // Update units_per_box on product if it was changed
      const originalUpb = bp.product?.units_per_box ?? null;
      if (unitsPerBox && unitsPerBox !== originalUpb && bp.product) {
        await supabase.from("products").update({ units_per_box: unitsPerBox }).eq("id", bp.product.id);
      }

      // Stock update
      const update: Record<string, number> = {};
      if (ut === "kg") update.current_stock_kg    = bp.current_stock_kg    + totalPrimary;
      else             update.current_stock_units  = bp.current_stock_units + totalPrimary;
      await supabase
        .from("branch_products")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", bp.id);

      // Weighted-average cost price update
      if (effectiveCpu > 0) {
        const currentStock = ut === "kg" ? bp.current_stock_kg : bp.current_stock_units;
        const oldCost = bp.product?.cost_price ?? 0;
        const newAvgCost = currentStock + totalPrimary > 0
          ? (currentStock * oldCost + totalPrimary * effectiveCpu) / (currentStock + totalPrimary)
          : effectiveCpu;
        await supabase.from("products").update({ cost_price: newAvgCost }).eq("id", row.product_id);
      }

      await supabase.from("restocks").insert({
        shop_id:                  session.shop_id,
        branch_id:                bp.branch_id,
        product_id:               row.product_id,
        quantity_kg:              ut === "kg" ? totalPrimary : 0,
        quantity_units:           ut === "units" ? totalPrimary : 0,
        quantity_boxes:           row.boxes,
        cost_per_unit:            effectiveCpu,
        cost_per_box:             row.boxes > 0 ? row.cost_per_box : null,
        units_per_box_at_restock: row.boxes > 0 ? unitsPerBox : null,
        supplier:                 row.supplier || null,
        notes:                    row.notes    || null,
        recorded_by:              session.user_id,
        recorded_by_name:         session.full_name ?? null,
      }).maybeSingle();

      void logAuditAction({
        branchId: bp.branch_id,
        action: "RESTOCK_PRODUCT",
        entityType: "product",
        entityId: row.product_id,
        newValues: {
          product_name: row.product_name,
          quantity_added: totalPrimary,
          quantity_boxes: row.boxes,
          unit_type: ut,
          cost_per_unit: effectiveCpu,
          supplier: row.supplier || null,
        },
      });
    }

    toast.success(`${validRows.length} product(s) restocked`);
    setBulkRestockOpen(false);
    setBulkRows([emptyBulkRow()]);
    setBulkSaving(false);
    router.refresh();
  }

  // ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products or categories…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => { setScanMode("search"); setScannerOpen(true) }}
          title="Scan barcode to find product"
          className="h-10 w-10 shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ScanLine className="h-4 w-4" />
        </button>

        {/* Sort */}
        <Select
          value={sortKey}
          onValueChange={(v) => setSortKey((v ?? "name_asc") as SortKey)}
        >
          <SelectTrigger className="w-[190px]">
            <ArrowUpDown className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name: A → Z</SelectItem>
            <SelectItem value="name_desc">Name: Z → A</SelectItem>
            <SelectItem value="stock_asc">Stock: Low → High</SelectItem>
            <SelectItem value="stock_desc">Stock: High → Low</SelectItem>
            <SelectItem value="best_selling">Best Selling First</SelectItem>
            <SelectItem value="low_selling">Low Selling First</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {canManage && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCatDialogOpen(true)}
            >
              <Tag className="mr-1.5 h-4 w-4" />
              Categories
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkRestockOpen(true)}
            >
              <Truck className="mr-1.5 h-4 w-4" />
              Bulk Restock
            </Button>
            <Button size="sm" onClick={openAddProduct}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Product
            </Button>
          </>
        )}
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Active Products
              </p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Low Stock</p>
              <p
                className={`text-2xl font-bold ${stats.lowStock > 0 ? "text-amber-600" : ""}`}
              >
                {stats.lowStock}
              </p>
            </div>
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${stats.lowStock > 0 ? "bg-amber-500/10" : "bg-muted"}`}
            >
              <AlertTriangle
                className={`h-5 w-5 ${stats.lowStock > 0 ? "text-amber-500" : "text-muted-foreground"}`}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Out of Stock</p>
              <p
                className={`text-2xl font-bold ${stats.outOfStock > 0 ? "text-red-600" : ""}`}
              >
                {stats.outOfStock}
              </p>
            </div>
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${stats.outOfStock > 0 ? "bg-red-500/10" : "bg-muted"}`}
            >
              <CircleOff
                className={`h-5 w-5 ${stats.outOfStock > 0 ? "text-red-500" : "text-muted-foreground"}`}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Total Stock Value
              </p>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.totalValue, currency)}
              </p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Products Table ── */}
      <div className="border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              {canManage && <col className="w-[7%]" />}
            </colgroup>
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Product
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Category
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Stock
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Est. Boxes
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Avg Cost
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Selling Price
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Status
                </th>
                {canManage && (
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className="py-16 text-center text-muted-foreground text-sm"
                  >
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No products found
                  </td>
                </tr>
              ) : (
                invPage.map((bp) => {
                  if (!bp.product) return null;
                  const price = bp.override_price ?? bp.product.base_price;
                  const { text: stockText, low, out } = stockDisplay(bp);
                  const margin =
                    bp.product.cost_price > 0
                      ? Math.round(
                          ((price - bp.product.cost_price) / price) * 100,
                        )
                      : null;
                  const marginColor =
                    margin === null
                      ? ""
                      : margin >= 15
                        ? "text-green-600"
                        : margin >= 10
                          ? "text-amber-600"
                          : "text-red-500";

                  return (
                    <tr
                      key={bp.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* Product name */}
                      <td className="px-4 py-3.5">
                        <p className="font-medium truncate">
                          {bp.product.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {bp.product.unit_type}
                        </p>
                      </td>
                      {/* Category */}
                      <td className="px-4 py-3.5 text-sm text-muted-foreground truncate">
                        {bp.product.category ?? (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      {/* Stock */}
                      <td
                        className={`px-4 py-3.5 font-mono text-sm ${out ? "text-red-600 font-semibold" : low ? "text-amber-600 font-semibold" : ""}`}
                      >
                        {stockText}
                      </td>
                      {/* Est. Boxes */}
                      <td className="px-4 py-3.5 text-sm text-muted-foreground font-mono">
                        {estBoxes(bp)}
                      </td>
                      {/* Avg Cost */}
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">
                        {formatCurrency(bp.product.cost_price, currency)}
                      </td>
                      {/* Sell Price + margin */}
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium">
                          {formatCurrency(price, currency)}
                        </p>
                        {margin !== null && (
                          <p className={`text-xs font-medium ${marginColor}`}>
                            {margin}% margin
                          </p>
                        )}
                      </td>
                      {/* Status badge */}
                      <td className="px-4 py-3.5">
                        {out ? (
                          <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/15 text-xs">
                            Out
                          </Badge>
                        ) : low ? (
                          <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 text-xs">
                            Low
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/15 text-xs">
                            OK
                          </Badge>
                        )}
                      </td>
                      {/* Actions */}
                      {canManage && (
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEditProduct(bp)}
                              title="Edit product"
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (isAllBranchesView) {
                                  toast.error("Select a branch in the top bar to restock");
                                  return;
                                }
                                openRestock(bp);
                              }}
                              title={isAllBranchesView ? "Select a branch to restock" : "Add stock"}
                              className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${isAllBranchesView ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                            >
                              <PlusCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <PaginationBar
            page={invCurrentPage}
            totalPages={invTotalPages}
            totalItems={invTotalItems}
            pageSize={invPageSize}
            startIndex={invStart}
            endIndex={invEnd}
            onPageChange={setInvPage}
            onPageSizeChange={setInvPageSize}
            label="product"
          />
        </div>
      </div>

      {/* ── Categories Dialog ── */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Manage Categories
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New category name…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCategory();
                }}
              />
              <Button
                size="sm"
                onClick={addCategory}
                disabled={catSaving || !newCatName.trim()}
              >
                {catSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No categories yet
                </p>
              ) : (
                categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted group"
                  >
                    <span className="text-sm">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      disabled={catDeleting === cat.id}
                      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {catDeleting === cat.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCatDialogOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Product Dialog ── */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBp ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. Frozen Chicken Wings"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                SKU / Barcode{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={pSku}
                  onChange={(e) => setPSku(e.target.value)}
                  placeholder="e.g. 5901234123457"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => { setScanMode("sku"); setScannerOpen(true) }}
                  title="Scan barcode to fill SKU"
                  className="h-9 w-9 shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ScanLine className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={pCategory}
                  onValueChange={(v) => setPCategory(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Unit Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={pUnitType}
                  onValueChange={(v) => setPUnitType(v ?? "units")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                {pUnitType === "kg" ? "kg per Box" : "Units per Box"}{" "}
                <span className="text-muted-foreground text-xs">
                  (optional)
                </span>
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={pUnitsPerBox}
                onChange={(e) => setPUnitsPerBox(e.target.value)}
                placeholder={
                  pUnitType === "kg"
                    ? "e.g. 25 → 1 box = 25 kg"
                    : "e.g. 12 → 1 box = 12 units"
                }
              />
              {pUnitsPerBox && parseFloat(pUnitsPerBox) > 0 && (
                <p className="text-xs text-muted-foreground">
                  1 box = {pUnitsPerBox} {pUnitType === "kg" ? "kg" : "units"}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Selling Price <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={pSellingPrice}
                  onChange={(e) => setPSellingPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Low Stock Threshold</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={pLowStockThreshold}
                  onChange={(e) => setPLowStockThreshold(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Audit Variance Threshold{" "}
                <span className="text-muted-foreground text-xs">(optional — default 5%)</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={pAuditThreshold}
                  onChange={(e) => setPAuditThreshold(e.target.value)}
                  placeholder="5"
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Variance above this % is flagged in stock audits. Leave blank to use the shop default.
              </p>
            </div>

            {!editingBp && (
              <div className="border-t pt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Opening Stock{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Opening {pUnitType === "kg" ? "kg" : "Units"}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={pOpeningQty}
                      onChange={(e) => setPOpeningQty(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Opening Boxes</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={pOpeningBoxes}
                      onChange={(e) => setPOpeningBoxes(e.target.value)}
                      placeholder="0"
                      disabled={!(pUnitsPerBox && parseFloat(pUnitsPerBox) > 0)}
                      title={
                        !(pUnitsPerBox && parseFloat(pUnitsPerBox) > 0)
                          ? "Set box size above first"
                          : undefined
                      }
                    />
                  </div>
                </div>

                {(parseFloat(pOpeningQty) > 0 ||
                  parseFloat(pOpeningBoxes) > 0) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Cost Price (per {pUnitType === "kg" ? "kg" : "unit"})
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={pOpeningCost}
                      onChange={(e) => setPOpeningCost(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                )}

                {pUnitsPerBox &&
                  parseFloat(pUnitsPerBox) > 0 &&
                  (parseFloat(pOpeningQty) > 0 ||
                    parseFloat(pOpeningBoxes) > 0) && (
                    <p className="text-xs text-muted-foreground">
                      Total:{" "}
                      {(parseFloat(pOpeningQty) || 0) +
                        (parseFloat(pOpeningBoxes) || 0) *
                          parseFloat(pUnitsPerBox)}{" "}
                      {pUnitType === "kg" ? "kg" : "units"}
                    </p>
                  )}
              </div>
            )}

            {/* ── Danger zone (edit mode only) ── */}
            {editingBp && (canManage || canShopDelete) && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Danger Zone
                </p>

                {/* Branch-level removal — only when viewing a specific branch */}
                {canManage && !isAllBranchesView && (
                  confirmAction === "branch" ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <p className="text-xs text-foreground">
                        {getStock(editingBp) > 0
                          ? `Cannot remove — ${stockDisplay(editingBp).text} still in stock. Zero out stock first.`
                          : "Remove this product from this branch? This can be reversed by an admin."}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction(null)}
                          disabled={removing}
                        >
                          Cancel
                        </Button>
                        {getStock(editingBp) === 0 && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={removeFromBranch}
                            disabled={removing}
                          >
                            {removing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmAction("branch")}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove from this branch
                    </Button>
                  )
                )}

                {/* Shop-level discontinue — owner / general_manager only */}
                {canShopDelete && (
                  confirmAction === "shop" ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <p className="text-xs text-foreground">
                        {totalStockForEditing > 0
                          ? `Cannot discontinue — ${totalStockForEditing} units / kg still across branches. Zero all branch stock first.`
                          : "Discontinue this product across all branches? If it has sales history it will be hidden; otherwise permanently deleted."}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction(null)}
                          disabled={removing}
                        >
                          Cancel
                        </Button>
                        {totalStockForEditing === 0 && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={discontinueShopWide}
                            disabled={removing}
                          >
                            {removing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            Confirm
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmAction("shop")}
                    >
                      <CircleOff className="mr-1.5 h-3.5 w-3.5" />
                      Discontinue shop-wide
                    </Button>
                  )
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setProductDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={saveProduct}
                disabled={pSaving}
              >
                {pSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingBp ? "Save Changes" : "Create Product"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Single Restock Dialog ── */}
      <Dialog open={!!restockBp} onOpenChange={(v) => { if (!v) setRestockBp(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{restockBp?.product?.name ?? "Restock"}</DialogTitle>
          </DialogHeader>
          {restockBp && (() => {
            const upb      = restockBp.product?.units_per_box;
            const hasBox   = hasBoxes(upb);
            const qtyVal   = parseFloat(rQty)   || 0;
            const boxesVal = parseFloat(rBoxes)  || 0;
            const upbVal   = parseFloat(rUnitsPerBox) || upb || null;
            const boxPrim  = boxesToPrimary(boxesVal, upbVal);
            const totalPrim = qtyVal + boxPrim;
            const showCostPerBox  = boxesVal > 0;
            const showCostPerUnit = qtyVal > 0 || !showCostPerBox;
            return (
              <div className="space-y-3 mt-2">
                {/* Qty + Boxes */}
                <div className={`grid gap-3 ${hasBox ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div className="space-y-1.5">
                    <Label>Qty ({restockBp.product?.unit_type})</Label>
                    <Input type="number" min={0} step="any" value={rQty}
                      onChange={(e) => setRQty(e.target.value)} placeholder="0" />
                  </div>
                  {hasBox && (
                    <div className="space-y-1.5">
                      <Label>Boxes</Label>
                      <Input type="number" min={0} step="any" value={rBoxes}
                        onChange={(e) => setRBoxes(e.target.value)} placeholder="0" />
                    </div>
                  )}
                </div>

                {/* Units/Box — shown when product supports boxes */}
                {hasBox && (
                  <div className="space-y-1.5">
                    <Label>
                      Units / Box
                      <span className="ml-1 text-xs text-muted-foreground">(from system — edit to update)</span>
                    </Label>
                    <Input type="number" min={1} step="any" value={rUnitsPerBox}
                      onChange={(e) => {
                        setRUnitsPerBox(e.target.value);
                        // Keep cost_per_box in sync with new upb if cost_per_unit was set
                        const cpu = parseFloat(rCostPerUnit) || 0;
                        if (cpu > 0) setRCostPerBox(String((cpu * (parseFloat(e.target.value) || 1)).toFixed(2)));
                      }}
                      placeholder={String(upb ?? "")} />
                  </div>
                )}

                {/* Conversion hint */}
                {hasBox && boxesVal > 0 && upbVal && (
                  <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-1.5">
                    {boxesVal} box{boxesVal !== 1 ? "es" : ""} × {upbVal} {restockBp.product?.unit_type} = {boxPrim} {restockBp.product?.unit_type}
                    {qtyVal > 0 && ` + ${qtyVal} direct = ${totalPrim} total`}
                  </p>
                )}

                {/* Cost inputs — adaptive */}
                <div className={showCostPerBox && showCostPerUnit ? "grid grid-cols-2 gap-3" : ""}>
                  {showCostPerBox && (
                    <div className="space-y-1.5">
                      <Label>Cost / Box</Label>
                      <Input type="number" min={0} step="any" value={rCostPerBox}
                        onChange={(e) => {
                          setRCostPerBox(e.target.value);
                          const cpb = parseFloat(e.target.value) || 0;
                          if (upbVal) setRCostPerUnit(String((cpb / upbVal).toFixed(4)));
                        }}
                        placeholder="0.00" />
                    </div>
                  )}
                  {showCostPerUnit && (
                    <div className="space-y-1.5">
                      <Label>Cost / {restockBp.product?.unit_type === "kg" ? "kg" : "unit"}</Label>
                      <Input type="number" min={0} step="any" value={rCostPerUnit}
                        onChange={(e) => {
                          setRCostPerUnit(e.target.value);
                          const cpu = parseFloat(e.target.value) || 0;
                          if (upbVal) setRCostPerBox(String((cpu * upbVal).toFixed(2)));
                        }}
                        placeholder="0.00" />
                    </div>
                  )}
                </div>

                {/* Supplier + Notes */}
                <div className="space-y-1.5">
                  <Label>Supplier <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={rSupplier} onChange={(e) => setRSupplier(e.target.value)} placeholder="Supplier name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="Any notes…" />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setRestockBp(null)}>Cancel</Button>
                  <Button className="flex-1" onClick={saveRestock} disabled={rSaving}>
                    {rSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Restock
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Barcode Scanner ── */}
      <BarcodeScanner
        open={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
        title={scanMode === "sku" ? "Scan to Fill SKU" : "Scan to Find Product"}
      />

      {/* ── Bulk Restock Dialog ── */}
      <Dialog open={bulkRestockOpen} onOpenChange={(v) => { setBulkRestockOpen(v); if (!v) setBulkRows([emptyBulkRow()]); }}>
        <DialogContent className="w-5xl max-w-6xl sm:max-w-none p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Bulk Restock
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b z-10">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5 w-8">#</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 min-w-[180px]">Product <span className="text-destructive">*</span></th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[100px]">Qty (primary)</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[80px]">Boxes</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[90px]">Units / Box</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[120px]">Cost <span className="text-destructive">*</span></th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[100px]">Total Cost</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[130px]">Supplier</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5 w-[130px]">Notes</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {bulkRows.map((row, idx) => {
                  const showCostBox  = row.boxes > 0;
                  const showCostUnit = row.qty > 0 || !showCostBox;
                  const total = rowTotalCost(row);
                  return (
                    <tr key={idx} className="hover:bg-muted/20 align-top">
                      {/* # */}
                      <td className="px-3 py-2 text-muted-foreground text-xs pt-3">{idx + 1}</td>

                      {/* Product */}
                      <td className="px-2 py-2">
                        <Select value={row.branch_product_id}
                          onValueChange={(v) => updateBulkRow(idx, "branch_product_id", v ?? "")}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select product…" /></SelectTrigger>
                          <SelectContent>
                            {branchProducts.map((bp) => bp.product && (
                              <SelectItem key={bp.id} value={bp.id}>{bp.product.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Qty (primary) */}
                      <td className="px-2 py-2">
                        <Input type="number" min={0} step="any" value={row.qty || ""}
                          onChange={(e) => updateBulkRow(idx, "qty", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm" placeholder="0" />
                      </td>

                      {/* Boxes */}
                      <td className="px-2 py-2">
                        <Input type="number" min={0} step="any" value={row.boxes || ""}
                          onChange={(e) => updateBulkRow(idx, "boxes", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm" placeholder="0"
                          disabled={!row.branch_product_id} />
                      </td>

                      {/* Units / Box */}
                      <td className="px-2 py-2">
                        {row.units_per_box !== null && row.units_per_box !== undefined ? (
                          <Input type="number" min={1} step="any" value={row.units_per_box || ""}
                            onChange={(e) => {
                              const upb = parseFloat(e.target.value) || 0;
                              setBulkRows((prev) => {
                                const next = [...prev];
                                const cpu = next[idx].cost_per_unit;
                                next[idx] = { ...next[idx], units_per_box: upb, cost_per_box: upb > 0 && cpu > 0 ? cpu * upb : next[idx].cost_per_box };
                                return next;
                              });
                            }}
                            className="h-8 text-sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground px-1">—</span>
                        )}
                      </td>

                      {/* Cost — adaptive: Cost/Box when boxes>0, Cost/Unit when only qty>0, both when mixed */}
                      <td className="px-2 py-2">
                        <div className="space-y-1">
                          {showCostBox && (
                            <div className="relative">
                              <Input type="number" min={0} step="any" value={row.cost_per_box || ""}
                                onChange={(e) => updateBulkRow(idx, "cost_per_box", parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm pr-10" placeholder="0.00" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">/box</span>
                            </div>
                          )}
                          {showCostUnit && (
                            <div className="relative">
                              <Input type="number" min={0} step="any" value={row.cost_per_unit || ""}
                                onChange={(e) => updateBulkRow(idx, "cost_per_unit", parseFloat(e.target.value) || 0)}
                                className={`h-8 text-sm pr-12 ${showCostBox ? "bg-muted/40" : ""}`}
                                placeholder="0.00"
                                readOnly={showCostBox && !!row.units_per_box}
                                title={showCostBox && row.units_per_box ? "Auto-derived from Cost/Box ÷ Units/Box" : undefined} />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">/{row.unit_type === "kg" ? "kg" : "unit"}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Total Cost */}
                      <td className="px-2 py-2 pt-3 text-sm font-medium">
                        {total > 0 ? formatCurrency(total, currency) : <span className="text-muted-foreground">—</span>}
                      </td>

                      {/* Supplier */}
                      <td className="px-2 py-2">
                        <Input value={row.supplier}
                          onChange={(e) => updateBulkRow(idx, "supplier", e.target.value)}
                          className="h-8 text-sm" placeholder="Supplier…" />
                      </td>

                      {/* Notes */}
                      <td className="px-2 py-2">
                        <Input value={row.notes}
                          onChange={(e) => updateBulkRow(idx, "notes", e.target.value)}
                          className="h-8 text-sm" placeholder="Notes…" />
                      </td>

                      {/* Delete */}
                      <td className="px-2 py-2">
                        <button onClick={() => setBulkRows((prev) => prev.filter((_, i) => i !== idx))}
                          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t shrink-0 bg-background">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => setBulkRows((prev) => [...prev, emptyBulkRow()])}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add another product
                </Button>
                <span className="text-xs text-muted-foreground">
                  {bulkRows.filter((r) => r.branch_product_id && (r.qty > 0 || r.boxes > 0)).length} product(s)
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total restock value</p>
                  <p className="text-sm font-semibold text-primary">
                    {formatCurrency(bulkRows.reduce((s, r) => s + rowTotalCost(r), 0), currency)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setBulkRestockOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={saveBulkRestock} disabled={bulkSaving}>
                    {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Truck className="mr-1.5 h-4 w-4" />
                    Save {bulkRows.filter((r) => r.branch_product_id && (r.qty > 0 || r.boxes > 0)).length} Restocks
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
