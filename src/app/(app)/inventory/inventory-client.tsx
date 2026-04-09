"use client";

import { useState, useMemo } from "react";
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
  Boxes,
  AlertTriangle,
  CircleOff,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import type { SessionContext } from "@/types";
import { canManageInventory } from "@/lib/permissions";

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
  } | null;
}

interface BulkRestockRow {
  branch_product_id: string;
  product_id: string;
  product_name: string;
  unit_type: string;
  qty: number;
  boxes: number;
  cost_per_unit: number;
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

function emptyBulkRow(branchProducts: BranchProduct[]): BulkRestockRow {
  const bp = branchProducts[0];
  if (!bp?.product)
    return {
      branch_product_id: "",
      product_id: "",
      product_name: "",
      unit_type: "units",
      qty: 0,
      boxes: 0,
      cost_per_unit: 0,
      supplier: "",
      notes: "",
    };
  return {
    branch_product_id: bp.id,
    product_id: bp.product.id,
    product_name: bp.product.name,
    unit_type: bp.product.unit_type,
    qty: 0,
    boxes: 0,
    cost_per_unit: bp.product.cost_price,
    supplier: "",
    notes: "",
  };
}

export function InventoryClient({
  branchProducts,
  currency,
  session,
  branches,
  categories: initialCategories,
}: Props) {
  const router = useRouter();
  const canManage = canManageInventory(session.role!);

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
  const [filterBranch, setFilterBranch] = useState("all");
  type SortKey =
    | "name_asc"
    | "name_desc"
    | "stock_asc"
    | "stock_desc"
    | "best_selling"
    | "low_selling";
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");

  // ─── Add/Edit Product dialog ─────────────────────────────────────
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingBp, setEditingBp] = useState<BranchProduct | null>(null);
  const [pName, setPName] = useState("");
  const [pCategory, setPCategory] = useState("");
  const [pUnitType, setPUnitType] = useState("units");
  const [pUnitsPerBox, setPUnitsPerBox] = useState("");
  const [pSellingPrice, setPSellingPrice] = useState("");
  const [pLowStockThreshold, setPLowStockThreshold] = useState("5");
  const [pOpeningQty, setPOpeningQty] = useState("");
  const [pOpeningBoxes, setPOpeningBoxes] = useState("");
  const [pOpeningCost, setPOpeningCost] = useState("");
  const [pSaving, setPSaving] = useState(false);

  // ─── Single Restock dialog ───────────────────────────────────────
  const [restockBp, setRestockBp] = useState<BranchProduct | null>(null);
  const [rQty, setRQty] = useState("");
  const [rBoxes, setRBoxes] = useState("");
  const [rCostPerUnit, setRCostPerUnit] = useState("");
  const [rSupplier, setRSupplier] = useState("");
  const [rNotes, setRNotes] = useState("");
  const [rSaving, setRSaving] = useState(false);

  // ─── Bulk Restock dialog ─────────────────────────────────────────
  const [bulkRestockOpen, setBulkRestockOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRestockRow[]>([
    emptyBulkRow(branchProducts),
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // ─── Summary stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = branchProducts.filter((bp) => bp.product).length;
    const lowStock = branchProducts.filter(
      (bp) => bp.product && isLowStock(bp) && !isOutOfStock(bp),
    ).length;
    const outOfStock = branchProducts.filter((bp) => isOutOfStock(bp)).length;
    const totalValue = branchProducts.reduce((sum, bp) => {
      if (!bp.product) return sum;
      return sum + getStock(bp) * bp.product.cost_price;
    }, 0);
    return { active, lowStock, outOfStock, totalValue };
  }, [branchProducts]);

  // ─── Filtered rows ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = branchProducts.filter((bp) => {
      if (!bp.product) return false;
      const q = search.toLowerCase();
      if (
        q &&
        !bp.product.name.toLowerCase().includes(q) &&
        !(bp.product.category ?? "").toLowerCase().includes(q)
      )
        return false;
      if (filterBranch !== "all" && bp.branch_id !== filterBranch) return false;
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
  }, [branchProducts, search, filterBranch, sortKey]);

  // ─── Product dialog helpers ──────────────────────────────────────
  function openAddProduct() {
    setEditingBp(null);
    setPName("");
    setPCategory("");
    setPUnitType("units");
    setPUnitsPerBox("");
    setPSellingPrice("");
    setPLowStockThreshold("5");
    setPOpeningQty("");
    setPOpeningBoxes("");
    setPOpeningCost("");
    setProductDialogOpen(true);
  }

  function openEditProduct(bp: BranchProduct) {
    if (!bp.product) return;
    setEditingBp(bp);
    setPName(bp.product.name);
    setPCategory(bp.product.category ?? "");
    setPUnitType(bp.product.unit_type);
    setPUnitsPerBox(
      bp.product.units_per_box != null ? String(bp.product.units_per_box) : "",
    );
    setPSellingPrice(String(bp.override_price ?? bp.product.base_price));
    setPLowStockThreshold(String(bp.product.reorder_threshold));
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
          category: pCategory || null,
          unit_type: pUnitType,
          units_per_box: pUnitsPerBox ? parseFloat(pUnitsPerBox) : null,
          base_price: parseFloat(pSellingPrice),
          reorder_threshold: parseFloat(pLowStockThreshold) || 0,
        })
        .eq("id", editingBp.product!.id);
      if (error) {
        toast.error(error.message);
        setPSaving(false);
        return;
      }
      if (editingBp.override_price !== null) {
        await supabase
          .from("branch_products")
          .update({ override_price: parseFloat(pSellingPrice) })
          .eq("id", editingBp.id);
      }
      toast.success("Product updated");
    } else {
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          shop_id: session.shop_id,
          name: pName.trim(),
          category: pCategory || null,
          unit_type: pUnitType,
          units_per_box: pUnitsPerBox ? parseFloat(pUnitsPerBox) : null,
          base_price: parseFloat(pSellingPrice),
          cost_price: parseFloat(pOpeningCost) || 0,
          reorder_threshold: parseFloat(pLowStockThreshold) || 0,
          is_active: true,
        })
        .select()
        .single();
      if (error || !product) {
        toast.error(error?.message ?? "Failed");
        setPSaving(false);
        return;
      }

      const branchList = session.branch_id
        ? [{ id: session.branch_id }]
        : branches;
      const openingQty = parseFloat(pOpeningQty) || 0;
      const openingBoxes = parseFloat(pOpeningBoxes) || 0;
      const upb = pUnitsPerBox ? parseFloat(pUnitsPerBox) : 0;
      const totalPrimary = openingQty + (upb > 0 ? openingBoxes * upb : 0);
      await supabase.from("branch_products").insert(
        branchList.map((b) => ({
          shop_id: session.shop_id,
          branch_id: b.id,
          product_id: product.id,
          is_active: true,
          current_stock_kg: pUnitType === "kg" ? totalPrimary : 0,
          current_stock_units: pUnitType === "units" ? totalPrimary : 0,
          current_stock_boxes: 0,
        })),
      );
      toast.success("Product created");
    }

    setProductDialogOpen(false);
    setPSaving(false);
    router.refresh();
  }

  // ─── Restock helpers ─────────────────────────────────────────────
  function openRestock(bp: BranchProduct) {
    setRestockBp(bp);
    setRQty("");
    setRBoxes("");
    setRCostPerUnit(String(bp.product?.cost_price ?? ""));
    setRSupplier("");
    setRNotes("");
  }

  async function saveRestock() {
    if (!restockBp) return;
    const qty = parseFloat(rQty) || 0;
    const boxes = parseFloat(rBoxes) || 0;
    if (qty === 0 && boxes === 0) {
      toast.error("Enter quantity or boxes");
      return;
    }
    const costPerUnit = parseFloat(rCostPerUnit) || 0;
    if (!costPerUnit) {
      toast.error("Cost per unit is required");
      return;
    }

    setRSaving(true);
    const supabase = createClient();
    const ut = restockBp.product?.unit_type ?? "units";
    const boxPrimary = boxesToPrimary(boxes, restockBp.product?.units_per_box);
    const totalPrimary = qty + boxPrimary;
    const update: Record<string, number> = {};
    if (ut === "kg")
      update.current_stock_kg = restockBp.current_stock_kg + totalPrimary;
    else
      update.current_stock_units = restockBp.current_stock_units + totalPrimary;

    const { error } = await supabase
      .from("branch_products")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", restockBp.id);
    if (error) {
      toast.error(error.message);
      setRSaving(false);
      return;
    }

    await supabase
      .from("restocks")
      .insert({
        shop_id: session.shop_id,
        branch_id: restockBp.branch_id,
        product_id: restockBp.product?.id,
        quantity_kg: ut === "kg" ? totalPrimary : 0,
        quantity_units: ut === "units" ? totalPrimary : 0,
        quantity_boxes: boxes,
        cost_per_unit: costPerUnit,
        supplier: rSupplier || null,
        notes: rNotes || null,
        recorded_by: session.user_id,
      })
      .maybeSingle();

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
          next[idx] = {
            ...next[idx],
            branch_product_id: bp.id,
            product_id: bp.product.id,
            product_name: bp.product.name,
            unit_type: bp.product.unit_type,
            cost_per_unit: bp.product.cost_price,
          };
        }
      } else {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  }

  async function saveBulkRestock() {
    const validRows = bulkRows.filter(
      (r) =>
        r.branch_product_id &&
        (r.qty > 0 || r.boxes > 0) &&
        r.cost_per_unit > 0,
    );
    if (validRows.length === 0) {
      toast.error("Add at least one valid row");
      return;
    }
    setBulkSaving(true);
    const supabase = createClient();

    for (const row of validRows) {
      const bp = branchProducts.find((p) => p.id === row.branch_product_id);
      if (!bp) continue;
      const ut = row.unit_type;
      const boxPrimary = boxesToPrimary(row.boxes, bp.product?.units_per_box);
      const totalPrimary = row.qty + boxPrimary;
      const update: Record<string, number> = {};
      if (ut === "kg")
        update.current_stock_kg = bp.current_stock_kg + totalPrimary;
      else update.current_stock_units = bp.current_stock_units + totalPrimary;
      await supabase
        .from("branch_products")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", bp.id);
      await supabase
        .from("restocks")
        .insert({
          shop_id: session.shop_id,
          branch_id: bp.branch_id,
          product_id: row.product_id,
          quantity_kg: ut === "kg" ? totalPrimary : 0,
          quantity_units: ut === "units" ? totalPrimary : 0,
          quantity_boxes: row.boxes,
          cost_per_unit: row.cost_per_unit,
          supplier: row.supplier || null,
          notes: row.notes || null,
          recorded_by: session.user_id,
        })
        .maybeSingle();
    }

    toast.success(`${validRows.length} product(s) restocked`);
    setBulkRestockOpen(false);
    setBulkRows([emptyBulkRow(branchProducts)]);
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

        {branches.length > 0 && (
          <Select
            value={filterBranch}
            onValueChange={(v) => setFilterBranch(v ?? "all")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
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
              className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${stats.lowStock > 0 ? "bg-amber-50" : "bg-muted"}`}
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
              className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${stats.outOfStock > 0 ? "bg-red-50" : "bg-muted"}`}
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
            <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Products Table ── */}
      <div className="border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
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
                filtered.map((bp) => {
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
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs">
                            Out
                          </Badge>
                        ) : low ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                            Low
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
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
                              onClick={() => openRestock(bp)}
                              title="Add stock"
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                      Cost Price (per {pUnitType === "kg" ? "kg" : "unit"}){" "}
                      <span className="text-destructive">*</span>
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
      <Dialog
        open={!!restockBp}
        onOpenChange={(v) => {
          if (!v) setRestockBp(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{restockBp?.product?.name ?? "Restock"}</DialogTitle>
          </DialogHeader>
          {restockBp && (
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Qty ({restockBp.product?.unit_type})</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={rQty}
                    onChange={(e) => setRQty(e.target.value)}
                    placeholder="0"
                  />
                </div>
                {hasBoxes(restockBp.product?.units_per_box) && (
                  <div className="space-y-1.5">
                    <Label>Boxes</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={rBoxes}
                      onChange={(e) => setRBoxes(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
              {hasBoxes(restockBp.product?.units_per_box) &&
                parseFloat(rBoxes) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {rBoxes} box{parseFloat(rBoxes) !== 1 ? "es" : ""} ×{" "}
                    {restockBp.product?.units_per_box}{" "}
                    {restockBp.product?.unit_type} ={" "}
                    {boxesToPrimary(
                      parseFloat(rBoxes),
                      restockBp.product?.units_per_box,
                    )}{" "}
                    {restockBp.product?.unit_type}
                    {parseFloat(rQty) > 0 &&
                      ` + ${rQty} direct = ${(parseFloat(rQty) || 0) + boxesToPrimary(parseFloat(rBoxes), restockBp.product?.units_per_box)} total`}
                  </p>
                )}
              <div className="space-y-1.5">
                <Label>
                  Cost Price per Unit{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={rCostPerUnit}
                  onChange={(e) => setRCostPerUnit(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Supplier{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </Label>
                <Input
                  value={rSupplier}
                  onChange={(e) => setRSupplier(e.target.value)}
                  placeholder="Supplier name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </Label>
                <Input
                  value={rNotes}
                  onChange={(e) => setRNotes(e.target.value)}
                  placeholder="Any notes…"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRestockBp(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={saveRestock}
                  disabled={rSaving}
                >
                  {rSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Restock
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk Restock Dialog ── */}
      <Dialog
        open={bulkRestockOpen}
        onOpenChange={(v) => {
          setBulkRestockOpen(v);
          if (!v) setBulkRows([emptyBulkRow(branchProducts)]);
        }}
      >
        <DialogContent className="w-5xl max-w-6xl sm:max-w-none p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Bulk Restock
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-8" />
              </colgroup>
              <thead className="sticky top-0 bg-background border-b z-10">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">
                    Product
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                    Qty
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                    Boxes
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                    Cost/Unit
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                    Supplier
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2.5">
                    Notes
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {bulkRows.map((row, idx) => (
                  <tr key={idx} className="group hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Select
                        value={row.branch_product_id}
                        onValueChange={(v) =>
                          updateBulkRow(idx, "branch_product_id", v ?? "")
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
                        value={row.qty || ""}
                        onChange={(e) =>
                          updateBulkRow(
                            idx,
                            "qty",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.boxes || ""}
                        onChange={(e) =>
                          updateBulkRow(
                            idx,
                            "boxes",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.cost_per_unit || ""}
                        onChange={(e) =>
                          updateBulkRow(
                            idx,
                            "cost_per_unit",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-sm"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={row.supplier}
                        onChange={(e) =>
                          updateBulkRow(idx, "supplier", e.target.value)
                        }
                        className="h-8 text-sm"
                        placeholder="Supplier…"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={row.notes}
                        onChange={(e) =>
                          updateBulkRow(idx, "notes", e.target.value)
                        }
                        className="h-8 text-sm"
                        placeholder="Notes…"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() =>
                          setBulkRows((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t shrink-0 flex items-center justify-between gap-3 bg-background">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setBulkRows((prev) => [...prev, emptyBulkRow(branchProducts)])
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Row
            </Button>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkRestockOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={saveBulkRestock} disabled={bulkSaving}>
                {bulkSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
