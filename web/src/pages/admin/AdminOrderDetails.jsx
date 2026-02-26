import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  deleteOrderItemAdmin,
  getAllowedNextOrderStatuses,
  getOrderItemsForViewer,
  saveAdminFinalNegotiationItem,
  saveCalculatedSellingPrices,
  setOrderCustomerPriceCurrency,
  updateOrderStatus,
} from "@/firebase/orders";
import {
  createAllocationsBulk,
  deleteAllocation as deleteShipmentAllocation,
  deleteAllocationsBulk,
  listAllocationsForOrder,
  listAllocationsForShipment,
  listShipments,
  recalcShipmentAllocations,
  suggestAllocationsForShipment,
  updateAllocation as updateShipmentAllocation,
} from "@/firebase/shipments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Pencil, Save, Trash2 } from "lucide-react";

function imgUrl(url) {
  if (!url) return "";
  const m1 = url.match(/[?&]id=([^&]+)/);
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  const fileId = m1?.[1] || m2?.[1];
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : url;
}

function gbp(v) {
  return `£${(Number(v) || 0).toFixed(2)}`;
}
function bdt(v) {
  return `৳${Math.round(Number(v) || 0)}`;
}
function r2(v) {
  return Number((Number(v) || 0).toFixed(2));
}
function isIncompleteNumberInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return true;
  if (s === "-" || s === "." || s === "-.") return true;
  if (s.endsWith(".")) return true;
  return false;
}
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function neededQty(a) {
  return Number(a?.needed_qty ?? a?.allocated_qty ?? 0);
}
function arrivedQty(a) {
  return Number(a?.arrived_qty ?? a?.shipped_qty ?? 0);
}
function weightKgToG(v) {
  return Math.round((Number(v) || 0) * 1000);
}
function shipmentAvgRate(sh) {
  const avg = Number(sh?.gbp_avg_rate || 0);
  if (avg > 0) return avg;
  const p = Number(sh?.gbp_rate_product || 0);
  const c = Number(sh?.gbp_rate_cargo || 0);
  if (p > 0 && c > 0) return r2((p + c) / 2);
  return p > 0 ? p : c > 0 ? c : 0;
}

function kgToGramInput(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "";
  const g = x * 1000;
  return Number.isInteger(g) ? String(g) : String(Number(g.toFixed(3)));
}

function gramInputToKg(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const g = Number(s);
  return Number.isFinite(g) ? g / 1000 : "";
}

function splitLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((x) => x.trim());
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <Skeleton className="h-14 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function AdminOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("raw");

  const [shipments, setShipments] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocMsg, setAllocMsg] = useState("");
  const [assignedRows, setAssignedRows] = useState([]);
  const [orderAllocations, setOrderAllocations] = useState([]);
  const [shipmentEditMode, setShipmentEditMode] = useState(false);
  const [removeBusyId, setRemoveBusyId] = useState("");
  const [weightDraft, setWeightDraft] = useState({});
  const [weightSaving, setWeightSaving] = useState(false);
  const [productWeightsText, setProductWeightsText] = useState("");
  const [packageWeightsText, setPackageWeightsText] = useState("");
  const [profitRatePct, setProfitRatePct] = useState("10");
  const [priceBase, setPriceBase] = useState("purchase");
  const [priceEditMode, setPriceEditMode] = useState(true);
  const [savingCalculatedPrice, setSavingCalculatedPrice] = useState(false);
  const [calculatedPriceMsg, setCalculatedPriceMsg] = useState("");
  const [calcDraft, setCalcDraft] = useState({});
  const [calcRate, setCalcRate] = useState("");
  const [rowSaving, setRowSaving] = useState({});
  const [rowEditMode, setRowEditMode] = useState({});
  const [negotiationDraft, setNegotiationDraft] = useState({});
  const [negotiationRowSaving, setNegotiationRowSaving] = useState({});
  const [negotiationRowEdit, setNegotiationRowEdit] = useState({});
  const [negotiationRemoving, setNegotiationRemoving] = useState({});
  const [negotiationMsg, setNegotiationMsg] = useState("");
  const [customerPriceCurrency, setCustomerPriceCurrency] = useState("bdt");
  const [currencySaving, setCurrencySaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");
      try {
        const [data, ships, allocs] = await Promise.all([
          getOrderItemsForViewer({
            email: user.email,
            role: user.role,
            order_id: orderId,
          }),
          listShipments(),
          listAllocationsForOrder(orderId),
        ]);
        if (!alive) return;
        if (!data.order) {
          setErr("Order not found");
          setOrder(null);
          setItems([]);
          return;
        }
        setOrder(data.order);
        setItems(data.items || []);
        const savedCalc = data?.order?.calculated_selling_price || null;
        const itemSavedPct = (data.items || []).find(
          (it) => Number.isFinite(Number(it?.calculated_selling_price?.profit_rate_pct)),
        )?.calculated_selling_price?.profit_rate_pct;
        const savedPct = Number.isFinite(Number(savedCalc?.profit_rate_pct))
          ? Number(savedCalc?.profit_rate_pct)
          : (Number.isFinite(Number(itemSavedPct)) ? Number(itemSavedPct) : 10);
        const cur = String(savedCalc?.customer_price_currency || "bdt").toLowerCase();
        setCustomerPriceCurrency(cur === "gbp" ? "gbp" : "bdt");
        // Price mode/rate are FE preview controls; do not load persisted mode/rate.
        setPriceBase("purchase");
        setProfitRatePct(String(savedPct));
        setPriceEditMode(true);
        setShipments(Array.isArray(ships) ? ships : []);
        const orderAllocs = Array.isArray(allocs) ? allocs : [];
        setOrderAllocations(orderAllocs);
        const assignedShipmentIds = [
          ...new Set(orderAllocs.map((a) => String(a.shipment_id || "").trim()).filter(Boolean)),
        ];
        if (assignedShipmentIds.length > 0) setSelectedShipmentId(assignedShipmentIds[0]);
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load order");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email, user?.role, orderId]);

  useEffect(() => {
    const s = String(order?.status || "").toLowerCase();
    if (s) setStatusDraft(s);
  }, [order?.status]);

  const totalFromItems = useMemo(
    () => (items || []).reduce((a, it) => a + Number(it.line_purchase_value_gbp || 0), 0),
    [items],
  );

  const itemByOrderItemId = useMemo(() => {
    const out = {};
    (items || []).forEach((it) => {
      const key = String(it.order_item_id || "").trim();
      if (key) out[key] = it;
    });
    return out;
  }, [items]);

  async function refreshOrderAllocations() {
    const fresh = await listAllocationsForOrder(orderId);
    setOrderAllocations(Array.isArray(fresh) ? fresh : []);
  }

  async function loadAssignedForShipment(shipmentId) {
    const sid = String(shipmentId || "").trim();
    if (!sid || !orderId) {
      setAssignedRows([]);
      return;
    }
    const all = await listAllocationsForShipment(sid);
    setAssignedRows(
      all.filter((a) => String(a.order_id || "").trim() === String(orderId || "").trim()),
    );
  }

  useEffect(() => {
    if (!selectedShipmentId) return;
    loadAssignedForShipment(selectedShipmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShipmentId]);

  useEffect(() => {
    const next = {};
    assignedRows.forEach((a) => {
      next[a.allocation_id] = {
        unit_product_weight: kgToGramInput(a.unit_product_weight),
        unit_package_weight: kgToGramInput(a.unit_package_weight),
      };
    });
    setWeightDraft(next);
  }, [assignedRows]);

  async function addOrderToShipment() {
    const sid = String(selectedShipmentId || "").trim();
    if (!sid || !orderId) return;
    setAllocLoading(true);
    setAllocMsg("");
    try {
      const suggestions = await suggestAllocationsForShipment(sid, orderId);
      if (!suggestions.length) {
        setAllocMsg("No remaining items to allocate for this order.");
        return;
      }
      await createAllocationsBulk(
        suggestions.map((r) => ({
          shipment_id: sid,
          order_id: orderId,
          order_item_id: r.order_item_id,
          needed_qty: Number(r.needed_qty ?? r.allocated_qty ?? 0),
          arrived_qty: 0,
          unit_product_weight: 0,
          unit_package_weight: 0,
        })),
      );
      await recalcShipmentAllocations(sid);
      await refreshOrderAllocations();
      await loadAssignedForShipment(sid);
      setAllocMsg(`Added ${suggestions.length} shipment item rows.`);
    } catch (e) {
      setAllocMsg(e?.message || "Failed to add order to shipment.");
    } finally {
      setAllocLoading(false);
    }
  }

  async function updateOrderShipment() {
    const sid = String(selectedShipmentId || "").trim();
    if (!sid || !orderId) return;
    setAllocLoading(true);
    setAllocMsg("");
    try {
      const oldShipmentIds = [
        ...new Set(orderAllocations.map((a) => String(a.shipment_id || "").trim()).filter(Boolean)),
      ];
      await deleteAllocationsBulk(orderAllocations);

      const suggestions = await suggestAllocationsForShipment(sid, orderId);
      if (suggestions.length) {
        await createAllocationsBulk(
          suggestions.map((r) => ({
          shipment_id: sid,
          order_id: orderId,
          order_item_id: r.order_item_id,
          needed_qty: Number(r.needed_qty ?? r.allocated_qty ?? 0),
          arrived_qty: 0,
          unit_product_weight: 0,
          unit_package_weight: 0,
          })),
        );
      }
      await Promise.all(
        [...new Set([...oldShipmentIds, sid])].map((x) =>
          recalcShipmentAllocations(x).catch(() => null),
        ),
      );
      setShipmentEditMode(false);
      setAllocMsg("Shipment updated for this order.");
      await refreshOrderAllocations();
      await loadAssignedForShipment(sid);
    } catch (e) {
      setAllocMsg(e?.message || "Failed to update shipment.");
    } finally {
      setAllocLoading(false);
    }
  }

  async function removeFromShipment(allocation) {
    const allocationId = String(allocation?.allocation_id || "").trim();
    const sid = String(allocation?.shipment_id || "").trim();
    if (!allocationId || !sid) return;
    setRemoveBusyId(allocationId);
    setAllocMsg("");
    try {
      await deleteShipmentAllocation(allocationId);
      await recalcShipmentAllocations(sid);
      await refreshOrderAllocations();
      await loadAssignedForShipment(sid);
      setAllocMsg("Removed item from shipment.");
    } catch (e) {
      setAllocMsg(e?.message || "Failed to remove item from shipment.");
    } finally {
      setRemoveBusyId("");
    }
  }

  async function copyWeightNames() {
    const names = assignedRows
      .map((a) => itemByOrderItemId[String(a.order_item_id || "")]?.name || "Item")
      .join("\n");
    await copyToClipboard(names);
    setAllocMsg(`Copied ${assignedRows.length} product name(s).`);
  }

  function applyPastedWeightColumns() {
    const pCol = splitLines(productWeightsText);
    const kCol = splitLines(packageWeightsText);
    setWeightDraft((prev) => {
      const next = { ...prev };
      assignedRows.forEach((a, idx) => {
        const id = a.allocation_id;
        const cur = next[id] || {};
        next[id] = {
          unit_product_weight: pCol[idx] === undefined || pCol[idx] === "" ? (cur.unit_product_weight ?? "") : pCol[idx],
          unit_package_weight: kCol[idx] === undefined || kCol[idx] === "" ? (cur.unit_package_weight ?? "") : kCol[idx],
        };
      });
      return next;
    });
    setAllocMsg("Applied pasted weight columns.");
  }

  async function saveAllWeights() {
    if (!selectedShipmentId || !assignedRows.length) return;
    setWeightSaving(true);
    setAllocMsg("");
    try {
      for (const a of assignedRows) {
        const id = a.allocation_id;
        const d = weightDraft[id] || {};
        await updateShipmentAllocation(id, {
          unit_product_weight: gramInputToKg(d.unit_product_weight),
          unit_package_weight: gramInputToKg(d.unit_package_weight),
        });
      }
      await recalcShipmentAllocations(selectedShipmentId);
      await loadAssignedForShipment(selectedShipmentId);
      setAllocMsg(`Saved weight rows: ${assignedRows.length}`);
    } catch (e) {
      setAllocMsg(e?.message || "Failed to save weights.");
    } finally {
      setWeightSaving(false);
    }
  }

  const assignedShipmentIds = useMemo(
    () =>
      [...new Set(orderAllocations.map((a) => String(a.shipment_id || "").trim()).filter(Boolean))],
    [orderAllocations],
  );
  const hasAssignedShipment = assignedShipmentIds.length > 0;
  const selectedShipment = useMemo(
    () => shipments.find((s) => String(s.shipment_id || "") === String(selectedShipmentId || "")) || null,
    [shipments, selectedShipmentId],
  );
  const calcMode = priceBase;
  const calcProfitPct = n(profitRatePct, 10);
  const priceRows = useMemo(() => {
    const allocByItem = {};
    assignedRows.forEach((a) => {
      const key = String(a.order_item_id || "").trim();
      if (!key) return;
      if (!allocByItem[key]) {
        allocByItem[key] = {
          needed_qty: 0,
          unit_product_weight: Number(a.unit_product_weight || 0),
          unit_package_weight: Number(a.unit_package_weight || 0),
          unit_total_weight: Number(a.unit_total_weight || 0),
        };
      }
      allocByItem[key].needed_qty += neededQty(a);
      allocByItem[key].unit_product_weight = Number(a.unit_product_weight || allocByItem[key].unit_product_weight || 0);
      allocByItem[key].unit_package_weight = Number(a.unit_package_weight || allocByItem[key].unit_package_weight || 0);
      allocByItem[key].unit_total_weight = Number(a.unit_total_weight || allocByItem[key].unit_total_weight || 0);
    });
    return (items || []).map((it) => {
      const key = String(it.order_item_id || "").trim();
      const alloc = allocByItem[key] || {};
      const qty = Number(alloc.needed_qty || it.ordered_quantity || 0);
      const buyUnit = Number(it.buy_price_gbp || 0);
      const upw = Number(alloc.unit_product_weight || 0);
      const ukw = Number(alloc.unit_package_weight || 0);
      const utw = Number(alloc.unit_total_weight || upw + ukw || 0);
      const totalWeightKg = r2(qty * utw);
      const cargoTotalGbp = r2(totalWeightKg * Number(selectedShipment?.cargo_cost_per_kg || 0));
      const purchaseTotalGbp = r2(qty * buyUnit);
      const landedTotalGbp = r2(purchaseTotalGbp + cargoTotalGbp);
      const cargoUnitGbp = r2(qty > 0 ? cargoTotalGbp / qty : 0);
      return {
        order_item_id: key,
        name: it.name || "Item",
        image_url: it.image_url || "",
        qty,
        buyUnit,
        upw,
        ukw,
        utw,
        totalWeightKg,
        cargoTotalGbp,
        purchaseTotalGbp,
        landedTotalGbp,
        cargoUnitGbp,
      };
    });
  }, [assignedRows, items, selectedShipment?.cargo_cost_per_kg]);
  const priceTotals = useMemo(() => {
    return priceRows.reduce(
      (acc, r) => {
        acc.qty += r.qty;
        acc.weightKg += r.totalWeightKg;
        acc.purchase += r.purchaseTotalGbp;
        acc.cargo += r.cargoTotalGbp;
        acc.landed += r.landedTotalGbp;
        return acc;
      },
      { qty: 0, weightKg: 0, purchase: 0, cargo: 0, landed: 0 },
    );
  }, [priceRows]);
  const priceCalculatedRows = useMemo(() => {
    const pct = Number(calcProfitPct || 0) / 100;
    const rate = shipmentAvgRate(selectedShipment);
    return priceRows.map((r) => {
      const productBaseUnit = calcMode === "total" ? r.buyUnit + r.cargoUnitGbp : r.buyUnit;
      const cargoUnitGbp = r2(r.cargoUnitGbp);
      const offeredProductUnitGbp =
        calcMode === "purchase"
          ? r2(r.buyUnit * (1 + pct))
          : r2(productBaseUnit * (1 + pct));
      const offeredProductUnitBdt = Math.round(offeredProductUnitGbp * rate);
      const cargoUnitBdt = Math.round(cargoUnitGbp * rate);
      const sellingUnitGbp =
        calcMode === "purchase"
          ? r2(offeredProductUnitGbp + cargoUnitGbp)
          : r2(offeredProductUnitGbp);
      const sellingUnitBdt = Math.round(sellingUnitGbp * rate);
      return {
        ...r,
        offeredProductUnitGbp,
        offeredProductUnitBdt,
        cargoUnitGbp,
        cargoUnitBdt,
        sellingUnitGbp,
        sellingUnitBdt,
      };
    });
  }, [priceRows, calcMode, calcProfitPct, selectedShipment]);
  const priceModeColTotals = useMemo(() => {
    const rate = n(shipmentAvgRate(selectedShipment), 0);
    return priceCalculatedRows.reduce(
      (acc, r) => {
        acc.itemUnitGbp += n(r.buyUnit, 0);
        acc.itemUnitBdt += Math.round(n(r.buyUnit, 0) * rate);
        acc.itemPlusCargoUnitGbp += r2(n(r.buyUnit, 0) + n(r.cargoUnitGbp, 0));
        acc.itemPlusCargoUnitBdt += Math.round(r2(n(r.buyUnit, 0) + n(r.cargoUnitGbp, 0)) * rate);
        acc.productWtG += weightKgToG(n(r.upw, 0));
        acc.packageWtG += weightKgToG(n(r.ukw, 0));
        acc.totalWtG += weightKgToG(n(r.utw, 0));
        acc.totalCargoGbp += n(r.cargoTotalGbp, 0);
        acc.totalItemGbp += n(r.purchaseTotalGbp, 0);
        acc.totalItemBdt += Math.round(n(r.purchaseTotalGbp, 0) * rate);
        acc.totalItemPlusCargoGbp += n(r.landedTotalGbp, 0);
        acc.totalItemPlusCargoBdt += Math.round(n(r.landedTotalGbp, 0) * rate);
        acc.offeredProductUnitGbp += n(r.offeredProductUnitGbp, 0);
        acc.offeredProductUnitBdt += n(r.offeredProductUnitBdt, 0);
        acc.cargoUnitGbp += n(r.cargoUnitGbp, 0);
        acc.cargoUnitBdt += n(r.cargoUnitBdt, 0);
        acc.sellingUnitGbp += n(r.sellingUnitGbp, 0);
        acc.sellingUnitBdt += n(r.sellingUnitBdt, 0);
        return acc;
      },
      {
        itemUnitGbp: 0,
        itemUnitBdt: 0,
        itemPlusCargoUnitGbp: 0,
        itemPlusCargoUnitBdt: 0,
        productWtG: 0,
        packageWtG: 0,
        totalWtG: 0,
        totalCargoGbp: 0,
        totalItemGbp: 0,
        totalItemBdt: 0,
        totalItemPlusCargoGbp: 0,
        totalItemPlusCargoBdt: 0,
        offeredProductUnitGbp: 0,
        offeredProductUnitBdt: 0,
        cargoUnitGbp: 0,
        cargoUnitBdt: 0,
        sellingUnitGbp: 0,
        sellingUnitBdt: 0,
      },
    );
  }, [priceCalculatedRows, selectedShipment]);
  useEffect(() => {
    const baseRate = shipmentAvgRate(selectedShipment);
    setCalcRate(String(baseRate || ""));
  }, [selectedShipment?.shipment_id, selectedShipment?.gbp_avg_rate, selectedShipment?.gbp_rate_product, selectedShipment?.gbp_rate_cargo]);
  useEffect(() => {
    const rate = n(calcRate, shipmentAvgRate(selectedShipment));
    setCalcDraft((prev) => {
      const next = { ...prev };
      priceCalculatedRows.forEach((r) => {
        const id = String(r.order_item_id || "");
        if (!id || next[id]) return;
        const pct = n(calcProfitPct, 10);
        const base = calcMode === "total" ? r.buyUnit + r.cargoUnitGbp : r.buyUnit;
        const offerGbp = r2(base * (1 + pct / 100));
        const offerBdt = Math.round(offerGbp * rate);
        next[id] = {
          profitPct: String(pct),
          offerGbp: String(offerGbp.toFixed(2)),
          offerBdt: String(offerBdt),
          lastEdited: "pct",
        };
      });
      return next;
    });
  }, [priceCalculatedRows, calcMode, calcProfitPct, selectedShipment, calcRate]);
  useEffect(() => {
    const rate = n(calcRate, shipmentAvgRate(selectedShipment));
    setCalcDraft((prev) => {
      const next = { ...prev };
      priceCalculatedRows.forEach((row) => {
        const id = String(row.order_item_id || "");
        const d = prev[id];
        if (!id || !d) return;
        const base = calcMode === "total" ? row.buyUnit + row.cargoUnitGbp : row.buyUnit;
        const src = String(d.lastEdited || "pct");
        const pct = n(d.profitPct, n(calcProfitPct, 10));
        const offerGbp = r2(n(d.offerGbp, 0));
        const offerBdt = Math.round(n(d.offerBdt, 0));
        if (src === "gbp") {
          if (isIncompleteNumberInput(d.offerGbp)) return;
          next[id] = syncCalcFields(row, { source: "gbp", offerGbp: String(offerGbp), rateOverride: rate, baseOverride: base });
          next[id].lastEdited = "gbp";
        } else if (src === "bdt") {
          if (isIncompleteNumberInput(d.offerBdt)) return;
          next[id] = syncCalcFields(row, { source: "bdt", offerBdt: String(offerBdt), rateOverride: rate, baseOverride: base });
          next[id].lastEdited = "bdt";
        } else {
          if (isIncompleteNumberInput(d.profitPct)) return;
          next[id] = syncCalcFields(row, { source: "pct", profitPct: String(pct), rateOverride: rate, baseOverride: base });
          next[id].lastEdited = "pct";
        }
      });
      return next;
    });
  }, [calcRate, calcMode, calcProfitPct, priceCalculatedRows, selectedShipment]);

  const calcRows = useMemo(() => {
    const rate = n(calcRate, shipmentAvgRate(selectedShipment));
    return priceCalculatedRows.map((r) => {
      const id = String(r.order_item_id || "");
      const d = calcDraft[id] || {};
      const saved = itemByOrderItemId[id]?.calculated_selling_price || {};
      const base = calcMode === "total" ? r.buyUnit + r.cargoUnitGbp : r.buyUnit;
      const defaultPct = n(calcProfitPct, 10);
      const defaultOfferGbp = r2(base * (1 + defaultPct / 100));
      const defaultOfferBdt = Math.round(defaultOfferGbp * rate);
      const pctInput = d.profitPct != null ? String(d.profitPct) : String(defaultPct);
      const offerGbpInput = d.offerGbp != null ? String(d.offerGbp) : String(defaultOfferGbp.toFixed(2));
      const offerBdtInput = d.offerBdt != null ? String(d.offerBdt) : String(defaultOfferBdt);
      const offerGbp = r2(n(offerGbpInput, defaultOfferGbp));
      const offerBdt = Math.round(n(offerBdtInput, defaultOfferBdt));
      const finalOfferUnitGbp = calcMode === "purchase" ? r2(offerGbp + r.cargoUnitGbp) : offerGbp;
      const finalOfferUnitBdt = calcMode === "purchase" ? Math.round(offerBdt + r.cargoUnitBdt) : offerBdt;
      const calcPriceGbp = Number.isFinite(Number(saved?.selling_unit_gbp))
        ? r2(saved.selling_unit_gbp)
        : null;
      const calcPriceBdt = Number.isFinite(Number(saved?.selling_unit_bdt))
        ? Math.round(Number(saved.selling_unit_bdt))
        : null;
      return {
        ...r,
        draft: { profitPct: pctInput, offerGbp: offerGbpInput, offerBdt: offerBdtInput },
        finalOfferUnitGbp,
        finalOfferUnitBdt,
        calcPriceGbp,
        calcPriceBdt,
      };
    });
  }, [priceCalculatedRows, calcDraft, calcMode, calcProfitPct, selectedShipment, calcRate, itemByOrderItemId]);
  const customerPreviewRows = useMemo(() => {
    const currency = customerPriceCurrency === "gbp" ? "gbp" : "bdt";
    return (items || []).map((it) => {
      const cs = it?.calculated_selling_price || {};
      const qty = Math.round(n(it?.ordered_quantity, 0));
      const unit =
        currency === "gbp"
          ? Number.isFinite(Number(cs?.selling_unit_gbp))
            ? r2(cs.selling_unit_gbp)
            : Number.isFinite(Number(cs?.offered_product_unit_gbp))
              ? r2(cs.offered_product_unit_gbp)
              : null
          : Number.isFinite(Number(cs?.selling_unit_bdt))
            ? Math.round(Number(cs.selling_unit_bdt))
            : Number.isFinite(Number(cs?.offered_product_unit_bdt))
              ? Math.round(Number(cs.offered_product_unit_bdt))
              : null;
      const total =
        unit == null ? null : currency === "gbp" ? r2(unit * qty) : Math.round(unit * qty);
      return {
        order_item_id: it.order_item_id,
        name: it.name || "Item",
        image_url: it.image_url || "",
        qty,
        unit,
        total,
        currency,
      };
    });
  }, [items, customerPriceCurrency]);
  const negotiationCurrency = customerPriceCurrency === "gbp" ? "gbp" : "bdt";
  const negotiationRate = n(shipmentAvgRate(selectedShipment), 0);
  const negotiationRows = useMemo(() => {
    return (items || []).map((it) => {
      const id = String(it.order_item_id || "");
      const cs = it?.calculated_selling_price || {};
      const orderedQty = Math.max(0, Math.round(n(it?.ordered_quantity, 0)));
      const customerChangedQty = Math.max(0, Math.round(n(it?.customer_changed_quantity, orderedQty)));
      const rate = n(negotiationRate, 0);
      const cargoUnitGbp = r2(
        n(
          cs?.cargo_unit_gbp,
          rate > 0 ? n(cs?.cargo_unit_bdt, 0) / rate : 0,
        ),
      );
      const cargoUnitBdt = Math.round(
        n(
          cs?.cargo_unit_bdt,
          rate > 0 ? cargoUnitGbp * rate : 0,
        ),
      );
      const buyUnitGbp = r2(n(it?.buy_price_gbp, 0));
      const baseUnitCostGbp = r2(buyUnitGbp + cargoUnitGbp);
      const baseUnitCostBdt = Math.round(baseUnitCostGbp * rate);
      const offeredUnitGbp = r2(
        n(
          cs?.selling_unit_gbp,
          rate > 0 ? n(cs?.selling_unit_bdt, n(cs?.offered_product_unit_bdt, 0)) / rate : n(cs?.offered_product_unit_gbp, 0),
        ),
      );
      const offeredUnitBdt = Math.round(
        n(
          cs?.selling_unit_bdt,
          rate > 0 ? offeredUnitGbp * rate : n(cs?.offered_product_unit_bdt, 0),
        ),
      );
      const customerUnitGbp = r2(
        n(
          it?.customer_unit_gbp,
          rate > 0 ? n(it?.customer_unit_bdt, offeredUnitBdt) / rate : offeredUnitGbp,
        ),
      );
      const customerUnitBdt = Math.round(
        n(
          it?.customer_unit_bdt,
          rate > 0 ? customerUnitGbp * rate : offeredUnitBdt,
        ),
      );
      const finalUnitGbp = r2(
        n(
          it?.final_unit_gbp,
          rate > 0 ? n(it?.final_unit_bdt, customerUnitBdt) / rate : customerUnitGbp,
        ),
      );
      const finalUnitBdt = Math.round(
        n(
          it?.final_unit_bdt,
          rate > 0 ? finalUnitGbp * rate : customerUnitBdt,
        ),
      );
      const finalQty = Math.max(0, Math.round(n(it?.final_quantity, customerChangedQty)));
      return {
        order_item_id: id,
        name: it?.name || "Item",
        image_url: it?.image_url || "",
        buy_price_gbp: r2(n(it?.buy_price_gbp, 0)),
        cargoUnitGbp,
        cargoUnitBdt,
        baseUnitCostGbp,
        baseUnitCostBdt,
        orderedQty,
        customerChangedQty,
        offeredUnitGbp,
        offeredUnitBdt,
        customerUnitGbp,
        customerUnitBdt,
        finalUnitGbp,
        finalUnitBdt,
        finalQty,
      };
    });
  }, [items, negotiationCurrency, negotiationRate]);
  const negotiationTotals = useMemo(() => {
    const baseTotalCostGbp = negotiationRows.reduce(
      (acc, r) => acc + r2(n(r.baseUnitCostGbp, 0) * n(r.finalQty, 0)),
      0,
    );
    const baseTotalCostBdt = negotiationRows.reduce(
      (acc, r) => acc + Math.round(n(r.baseUnitCostBdt, 0) * n(r.finalQty, 0)),
      0,
    );
    const finalTotalGbp = negotiationRows.reduce(
      (acc, r) => acc + n(r.finalUnitGbp, 0) * n(r.finalQty, 0),
      0,
    );
    const finalTotalBdt = negotiationRows.reduce(
      (acc, r) => acc + n(r.finalUnitBdt, 0) * n(r.finalQty, 0),
      0,
    );
    const profitGbp = finalTotalGbp - baseTotalCostGbp;
    const profitBdt = finalTotalBdt - baseTotalCostBdt;
    const profitPct = baseTotalCostBdt > 0 ? r2((profitBdt / baseTotalCostBdt) * 100) : 0;
    return {
      baseTotalCostGbp: r2(baseTotalCostGbp),
      baseTotalCostBdt: Math.round(baseTotalCostBdt),
      finalTotalGbp: r2(finalTotalGbp),
      finalTotalBdt: Math.round(finalTotalBdt),
      profitGbp: r2(profitGbp),
      profitBdt: Math.round(profitBdt),
      profitPct,
    };
  }, [negotiationRows, negotiationRate]);
  useEffect(() => {
    setNegotiationDraft((prev) => {
      const next = { ...prev };
      negotiationRows.forEach((r) => {
        const id = String(r.order_item_id || "");
        if (!id) return;
        if (!next[id]) {
          next[id] = {
            finalQty: String(r.finalQty),
            finalUnit: String(negotiationCurrency === "gbp" ? r.finalUnitGbp : r.finalUnitBdt),
          };
        }
      });
      return next;
    });
    setNegotiationRowEdit((prev) => {
      const next = { ...prev };
      negotiationRows.forEach((r) => {
        const id = String(r.order_item_id || "");
        if (!id || next[id] !== undefined) return;
        const hasSaved = n(r.finalUnit, 0) > 0;
        next[id] = !hasSaved;
      });
      return next;
    });
  }, [negotiationRows]);
  useEffect(() => {
    setRowEditMode((prev) => {
      const next = { ...prev };
      calcRows.forEach((r) => {
        const id = String(r.order_item_id || "");
        if (!id || next[id] !== undefined) return;
        const hasSaved = !!itemByOrderItemId[id]?.calculated_selling_price;
        next[id] = !hasSaved;
      });
      return next;
    });
  }, [calcRows, itemByOrderItemId]);

  function syncCalcFields(row, next = {}) {
    const rate = n(next.rateOverride, n(calcRate, shipmentAvgRate(selectedShipment)));
    const base = n(next.baseOverride, calcMode === "total" ? row.buyUnit + row.cargoUnitGbp : row.buyUnit);
    const source = String(next.source || "pct");

    let pct = n(next.profitPct, n(profitRatePct, 10));
    let offerGbp = r2(n(next.offerGbp, 0));
    let offerBdt = Math.round(n(next.offerBdt, 0));

    if (source === "pct") {
      offerGbp = r2(base * (1 + pct / 100));
      offerBdt = Math.round(offerGbp * rate);
    } else if (source === "gbp") {
      pct = base > 0 ? r2(((offerGbp / base) - 1) * 100) : 0;
      offerBdt = Math.round(offerGbp * rate);
    } else if (source === "bdt") {
      offerGbp = rate > 0 ? r2(offerBdt / rate) : 0;
      pct = base > 0 ? r2(((offerGbp / base) - 1) * 100) : 0;
    }

    return {
      profitPct: String(pct),
      offerGbp: String(offerGbp.toFixed(2)),
      offerBdt: String(offerBdt),
    };
  }

  function updateCalcPct(row, pctRaw) {
    const id = String(row.order_item_id || "");
    if (isIncompleteNumberInput(pctRaw)) {
      setCalcDraft((p) => ({
        ...p,
        [id]: { ...(p[id] || {}), profitPct: String(pctRaw), lastEdited: "pct" },
      }));
      return;
    }
    const synced = syncCalcFields(row, { source: "pct", profitPct: pctRaw });
    setCalcDraft((p) => ({
      ...p,
      [id]: { ...(p[id] || {}), ...synced, profitPct: String(pctRaw), lastEdited: "pct" },
    }));
  }

  function updateCalcOfferGbp(row, gbpRaw) {
    const id = String(row.order_item_id || "");
    if (isIncompleteNumberInput(gbpRaw)) {
      setCalcDraft((p) => ({
        ...p,
        [id]: { ...(p[id] || {}), offerGbp: String(gbpRaw), lastEdited: "gbp" },
      }));
      return;
    }
    const synced = syncCalcFields(row, { source: "gbp", offerGbp: gbpRaw });
    setCalcDraft((p) => ({
      ...p,
      [id]: { ...(p[id] || {}), ...synced, offerGbp: String(gbpRaw), lastEdited: "gbp" },
    }));
  }

  function updateCalcOfferBdt(row, bdtRaw) {
    const id = String(row.order_item_id || "");
    if (isIncompleteNumberInput(bdtRaw)) {
      setCalcDraft((p) => ({
        ...p,
        [id]: { ...(p[id] || {}), offerBdt: String(bdtRaw), lastEdited: "bdt" },
      }));
      return;
    }
    const synced = syncCalcFields(row, { source: "bdt", offerBdt: bdtRaw });
    setCalcDraft((p) => ({
      ...p,
      [id]: { ...(p[id] || {}), ...synced, offerBdt: String(bdtRaw), lastEdited: "bdt" },
    }));
  }

  async function saveNegotiationRow(row) {
    const id = String(row?.order_item_id || "").trim();
    if (!id || !orderId) return;
    setNegotiationRowSaving((p) => ({ ...p, [id]: true }));
    setNegotiationMsg("");
    try {
      const d = negotiationDraft[id] || {};
      const finalQty = Math.max(0, Math.round(n(d.finalQty, row.finalQty)));
      const finalUnitInput = n(d.finalUnit, row.finalUnit);
      if (finalQty > 0 && !(finalUnitInput > 0)) {
        throw new Error("Final price must be greater than 0.");
      }
      const rate = n(negotiationRate, shipmentAvgRate(selectedShipment));
      const finalUnitGbp =
        negotiationCurrency === "gbp"
          ? r2(finalUnitInput)
          : rate > 0
            ? r2(finalUnitInput / rate)
            : 0;
      const finalUnitBdt =
        negotiationCurrency === "bdt"
          ? Math.round(finalUnitInput)
          : Math.round(finalUnitInput * rate);
      await saveAdminFinalNegotiationItem({
        order_id: orderId,
        order_item_id: id,
        final_quantity: finalQty,
        final_unit_gbp: finalUnitGbp,
        final_unit_bdt: finalUnitBdt,
      });
      const refreshed = await getOrderItemsForViewer({
        email: user?.email,
        role: user?.role,
        order_id: orderId,
      });
      if (refreshed?.order) setOrder(refreshed.order);
      if (Array.isArray(refreshed?.items)) setItems(refreshed.items);
      setNegotiationRowEdit((p) => ({ ...p, [id]: false }));
      setNegotiationMsg(`Saved final price for ${row.name || "item"}.`);
    } catch (e) {
      setNegotiationMsg(e?.message || "Failed to save final price row.");
    } finally {
      setNegotiationRowSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  async function removeNegotiationRow(row) {
    const id = String(row?.order_item_id || "").trim();
    if (!id || !orderId) return;
    if (!window.confirm(`Remove "${row?.name || "this item"}" from order?`)) return;
    setNegotiationRemoving((p) => ({ ...p, [id]: true }));
    setNegotiationMsg("");
    try {
      await deleteOrderItemAdmin({
        order_id: orderId,
        order_item_id: id,
      });
      const refreshed = await getOrderItemsForViewer({
        email: user?.email,
        role: user?.role,
        order_id: orderId,
      });
      if (refreshed?.order) setOrder(refreshed.order);
      if (Array.isArray(refreshed?.items)) setItems(refreshed.items);
      setNegotiationMsg(`Removed ${row.name || "item"} from order.`);
    } catch (e) {
      setNegotiationMsg(e?.message || "Failed to remove item.");
    } finally {
      setNegotiationRemoving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  async function saveCalcRow(row) {
    const id = String(row?.order_item_id || "").trim();
    if (!id || !orderId) return;
    setRowSaving((p) => ({ ...p, [id]: true }));
    setCalculatedPriceMsg("");
    try {
      const offerGbp = r2(n(row?.draft?.offerGbp, 0));
      const offerBdt = Math.round(n(row?.draft?.offerBdt, 0));
      const buyUnitGbp = r2(n(row?.buyUnit, 0));
      const cargoGbp = r2(n(row?.cargoUnitGbp, 0));
      const cargoBdt = Math.round(n(row?.cargoUnitBdt, 0));
      const sellingGbp = calcMode === "purchase" ? r2(offerGbp + cargoGbp) : offerGbp;
      const sellingBdt = calcMode === "purchase" ? Math.round(offerBdt + cargoBdt) : offerBdt;
      await saveCalculatedSellingPrices({
        order_id: orderId,
        price_mode: calcMode,
        profit_rate_pct: n(row?.draft?.profitPct, calcProfitPct),
        update_order_meta: false,
        rows: [
          {
            order_item_id: id,
            initial_unit_gbp: buyUnitGbp,
            initial_unit_bdt: Math.round(buyUnitGbp * n(calcRate, shipmentAvgRate(selectedShipment))),
            initial_plus_cargo_unit_gbp: r2(buyUnitGbp + cargoGbp),
            initial_plus_cargo_unit_bdt: Math.round(
              r2(buyUnitGbp + cargoGbp) * n(calcRate, shipmentAvgRate(selectedShipment)),
            ),
            calculated_offer_unit_gbp: sellingGbp,
            calculated_offer_unit_bdt: sellingBdt,
            offer_unit_gbp: offerGbp,
            offer_unit_bdt: offerBdt,
            customer_counter_unit_gbp: itemByOrderItemId[id]?.customer_unit_gbp ?? null,
            customer_counter_unit_bdt: itemByOrderItemId[id]?.customer_unit_bdt ?? null,
            final_unit_gbp: itemByOrderItemId[id]?.final_unit_gbp ?? null,
            final_unit_bdt: itemByOrderItemId[id]?.final_unit_bdt ?? null,
            offered_product_unit_gbp: offerGbp,
            offered_product_unit_bdt: offerBdt,
            cargo_unit_gbp: cargoGbp,
            cargo_unit_bdt: cargoBdt,
            selling_unit_gbp: sellingGbp,
            selling_unit_bdt: sellingBdt,
          },
        ],
      });
      const refreshed = await getOrderItemsForViewer({
        email: user?.email,
        role: user?.role,
        order_id: orderId,
      });
      if (refreshed?.order) setOrder(refreshed.order);
      if (Array.isArray(refreshed?.items)) setItems(refreshed.items);
      setRowEditMode((p) => ({ ...p, [id]: false }));
      setCalculatedPriceMsg(`Saved offered price for ${row.name || "item"}.`);
    } catch (e) {
      setCalculatedPriceMsg(e?.message || "Failed to save row.");
    } finally {
      setRowSaving((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  async function saveCalculatedPrice() {
    if (!orderId || !calcRows.length) return;
    setSavingCalculatedPrice(true);
    setCalculatedPriceMsg("");
    try {
      const rate = n(calcRate, shipmentAvgRate(selectedShipment));
      const rows = calcRows.map((r) => {
        const offerGbp = r2(n(r?.draft?.offerGbp, r.offeredProductUnitGbp));
        const offerBdt = Math.round(n(r?.draft?.offerBdt, r.offeredProductUnitBdt));
        const sellingGbp = calcMode === "purchase" ? r2(offerGbp + n(r.cargoUnitGbp, 0)) : offerGbp;
        const sellingBdt = calcMode === "purchase" ? Math.round(offerBdt + n(r.cargoUnitBdt, 0)) : offerBdt;
        return {
          order_item_id: r.order_item_id,
          initial_unit_gbp: r.buyUnit,
          initial_unit_bdt: Math.round(r.buyUnit * rate),
          initial_plus_cargo_unit_gbp: r2(r.buyUnit + r.cargoUnitGbp),
          initial_plus_cargo_unit_bdt: Math.round(
            r2(r.buyUnit + r.cargoUnitGbp) * rate,
          ),
          calculated_offer_unit_gbp: sellingGbp,
          calculated_offer_unit_bdt: sellingBdt,
          offer_unit_gbp: offerGbp,
          offer_unit_bdt: offerBdt,
          customer_counter_unit_gbp: itemByOrderItemId[r.order_item_id]?.customer_unit_gbp ?? null,
          customer_counter_unit_bdt: itemByOrderItemId[r.order_item_id]?.customer_unit_bdt ?? null,
          final_unit_gbp: itemByOrderItemId[r.order_item_id]?.final_unit_gbp ?? null,
          final_unit_bdt: itemByOrderItemId[r.order_item_id]?.final_unit_bdt ?? null,
          offered_product_unit_gbp: offerGbp,
          offered_product_unit_bdt: offerBdt,
          cargo_unit_gbp: r.cargoUnitGbp,
          cargo_unit_bdt: r.cargoUnitBdt,
          selling_unit_gbp: sellingGbp,
          selling_unit_bdt: sellingBdt,
        };
      });
      await saveCalculatedSellingPrices({
        order_id: orderId,
        price_mode: priceBase,
        profit_rate_pct: Number(profitRatePct || 0),
        customer_price_currency: customerPriceCurrency,
        update_order_meta: false,
        rows,
      });
      const refreshed = await getOrderItemsForViewer({
        email: user?.email,
        role: user?.role,
        order_id: orderId,
      });
      if (refreshed?.order) setOrder(refreshed.order);
      if (Array.isArray(refreshed?.items)) setItems(refreshed.items);
      setCalculatedPriceMsg(`Calculated selling price saved for ${rows.length} item(s).`);
      setPriceEditMode(false);
    } catch (e) {
      setCalculatedPriceMsg(e?.message || "Failed to save calculated selling price.");
    } finally {
      setSavingCalculatedPrice(false);
    }
  }

  async function chooseCustomerPriceCurrency(currency) {
    if (!orderId) return;
    const c = String(currency || "").toLowerCase() === "gbp" ? "gbp" : "bdt";
    setCurrencySaving(true);
    setCalculatedPriceMsg("");
    try {
      await setOrderCustomerPriceCurrency({ order_id: orderId, currency: c });
      setCustomerPriceCurrency(c);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              calculated_selling_price: {
                ...(prev.calculated_selling_price || {}),
                customer_price_currency: c,
              },
            }
          : prev,
      );
      setCalculatedPriceMsg(`Customer will see ${c.toUpperCase()} offer price for this order.`);
    } catch (e) {
      setCalculatedPriceMsg(e?.message || "Failed to save customer price display option.");
    } finally {
      setCurrencySaving(false);
    }
  }

  async function saveOrderStatus() {
    if (!orderId) return;
    const target = String(statusDraft || "").toLowerCase();
    if (!target) return;
    setStatusSaving(true);
    setCalculatedPriceMsg("");
    try {
      await updateOrderStatus({ order_id: orderId, status: target });
      setOrder((prev) => (prev ? { ...prev, status: target } : prev));
      setCalculatedPriceMsg(`Order status changed to ${target}.`);
    } catch (e) {
      setCalculatedPriceMsg(e?.message || "Failed to update order status.");
    } finally {
      setStatusSaving(false);
    }
  }

  const currentStatus = String(order?.status || "").toLowerCase();
  const allowedStatusOptions = getAllowedNextOrderStatuses(currentStatus, {
    role: "admin",
    includeCurrent: true,
  });
  const canOpenNegotiateTab = useMemo(() => {
    if (!items.length) return false;
    return items.every((it) => {
      const cs = it?.calculated_selling_price || {};
      const hasGbp = Number.isFinite(Number(cs?.offered_product_unit_gbp));
      const hasBdt = Number.isFinite(Number(cs?.offered_product_unit_bdt));
      return hasGbp || hasBdt;
    });
  }, [items]);

  useEffect(() => {
    if (tab === "negotiate" && !canOpenNegotiateTab) {
      setTab("calculate");
    }
  }, [tab, canOpenNegotiateTab]);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Details</h1>
          <div className="text-sm text-muted-foreground">{order?.order_name || orderId}</div>
          {order?.status ? <Badge className="mt-2" variant="secondary">{order.status}</Badge> : null}
        </div>
        <Button variant="outline" onClick={() => nav("/admin/orders")}>Back</Button>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      ) : null}

      {!loading && order ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div>Customer: {order.creator_email}</div>
            <div>Total Qty: {Math.round(Number(order.total_order_qty || 0))}</div>
            <div>Total Purchase Value: {gbp(order.total_purchase_value_gbp || totalFromItems)}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4 flex items-center gap-2">
        <Button variant={tab === "raw" ? "default" : "outline"} size="sm" onClick={() => setTab("raw")}>
          Raw Order
        </Button>
        <Button variant={tab === "shipment" ? "default" : "outline"} size="sm" onClick={() => setTab("shipment")}>
          Shipment
        </Button>
        <Button variant={tab === "weight" ? "default" : "outline"} size="sm" onClick={() => setTab("weight")}>
          Weight
        </Button>
        <Button variant={tab === "price" ? "default" : "outline"} size="sm" onClick={() => setTab("price")}>
          Price Mode
        </Button>
        <Button variant={tab === "calculate" ? "default" : "outline"} size="sm" onClick={() => setTab("calculate")}>
          Calculate Price
        </Button>
        <Button
          variant={tab === "negotiate" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("negotiate")}
          disabled={!canOpenNegotiateTab}
          title={!canOpenNegotiateTab ? "Complete Calculate Price first" : "Negotiate & Finalize"}
        >
          Negotiate & Finalize
        </Button>
      </div>

      {tab === "raw" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <RowsSkeleton />
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No items.</div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.order_item_id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="h-14 w-14 overflow-hidden rounded-lg bg-white">
                      {it.image_url ? (
                        <img
                          src={imgUrl(it.image_url)}
                          alt={it.name}
                          className="h-14 w-14 object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = it.image_url;
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{it.name || "Unnamed item"}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.brand || "-"} • Qty {Math.round(Number(it.ordered_quantity || 0))}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-muted-foreground">Purchase / unit</div>
                      <div className="font-semibold">{gbp(it.buy_price_gbp)}</div>
                      <div className="mt-1 text-muted-foreground">Line total</div>
                      <div className="font-semibold">{gbp(it.line_purchase_value_gbp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : tab === "shipment" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipment Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Select
                value={selectedShipmentId}
                onValueChange={async (v) => {
                  setSelectedShipmentId(v);
                  await loadAssignedForShipment(v);
                }}
                disabled={hasAssignedShipment && !shipmentEditMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shipment to assign this order" />
                </SelectTrigger>
                <SelectContent>
                  {shipments.map((s) => (
                    <SelectItem key={s.shipment_id} value={s.shipment_id}>
                      {s.name || s.shipment_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!hasAssignedShipment ? (
                <Button onClick={addOrderToShipment} disabled={!selectedShipmentId || allocLoading}>
                  {allocLoading ? "Adding..." : "Add Order To Shipment"}
                </Button>
              ) : shipmentEditMode ? (
                <Button onClick={updateOrderShipment} disabled={!selectedShipmentId || allocLoading}>
                  {allocLoading ? "Updating..." : "Update Shipment"}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setShipmentEditMode(true)}>
                  Edit
                </Button>
              )}
            </div>

            {allocMsg ? <div className="rounded-lg border px-3 py-2 text-sm">{allocMsg}</div> : null}

            {hasAssignedShipment && !shipmentEditMode ? (
              <div className="text-xs text-muted-foreground">
                Shipment already assigned. Click <span className="font-semibold">Edit</span> to change.
              </div>
            ) : null}

            {!selectedShipmentId ? (
              <div className="text-sm text-muted-foreground">Select a shipment first.</div>
            ) : assignedRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No shipment item rows for this order in selected shipment.
              </div>
            ) : (
              <div className="space-y-2">
                {assignedRows.map((a) => (
                  <div key={a.allocation_id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 overflow-hidden rounded border bg-white">
                          {itemByOrderItemId[String(a.order_item_id || "")]?.image_url ? (
                            <img
                              src={imgUrl(itemByOrderItemId[String(a.order_item_id || "")]?.image_url)}
                              alt={itemByOrderItemId[String(a.order_item_id || "")]?.name || "item"}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="font-semibold">
                          {itemByOrderItemId[String(a.order_item_id || "")]?.name || "Item"}
                        </div>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        Needed {Math.round(neededQty(a))} • Arrived {Math.round(arrivedQty(a))}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="destructive"
                      disabled={removeBusyId === a.allocation_id}
                      onClick={() => removeFromShipment(a)}
                      title="Delete from shipment"
                      aria-label="Delete from shipment"
                    >
                      {removeBusyId === a.allocation_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : tab === "weight" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weight (Bulk Paste)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedShipmentId ? (
              <div className="text-sm text-muted-foreground">Select a shipment in Shipment tab first.</div>
            ) : assignedRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No allocated rows for this order in selected shipment.</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={copyWeightNames}>Copy Product Names</Button>
                  <Button
                    size="icon"
                    onClick={saveAllWeights}
                    disabled={weightSaving}
                    title="Save all weights"
                    aria-label="Save all weights"
                  >
                    {weightSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="lg:col-span-2 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Product Wt (g)</th>
                          <th className="px-3 py-2">Package Wt (g)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {assignedRows.map((a) => {
                          const id = a.allocation_id;
                          const meta = itemByOrderItemId[String(a.order_item_id || "")] || {};
                          return (
                            <tr key={id}>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-9 w-9 overflow-hidden rounded border bg-white">
                                    {meta.image_url ? (
                                      <img src={imgUrl(meta.image_url)} alt={meta.name || "item"} className="h-full w-full object-cover" />
                                    ) : null}
                                  </div>
                                  <div className="font-medium">{meta.name || "Item"}</div>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="h-8 w-28 rounded-md border bg-background px-2"
                                  value={String(weightDraft[id]?.unit_product_weight ?? "")}
                                  onChange={(e) =>
                                    setWeightDraft((p) => ({
                                      ...p,
                                      [id]: { ...(p[id] || {}), unit_product_weight: e.target.value },
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="h-8 w-28 rounded-md border bg-background px-2"
                                  value={String(weightDraft[id]?.unit_package_weight ?? "")}
                                  onChange={(e) =>
                                    setWeightDraft((p) => ({
                                      ...p,
                                      [id]: { ...(p[id] || {}), unit_package_weight: e.target.value },
                                    }))
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Product Weight Column (g)</label>
                      <textarea
                        className="min-h-[140px] w-full rounded-md border bg-background p-2 text-xs"
                        value={productWeightsText}
                        onChange={(e) => setProductWeightsText(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Package Weight Column (g)</label>
                      <textarea
                        className="min-h-[140px] w-full rounded-md border bg-background p-2 text-xs"
                        value={packageWeightsText}
                        onChange={(e) => setPackageWeightsText(e.target.value)}
                      />
                    </div>
                    <Button variant="outline" className="w-full" onClick={applyPastedWeightColumns}>
                      Apply Pasted Columns
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : tab === "price" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedShipmentId ? (
              <div className="text-sm text-muted-foreground">Select a shipment in Shipment tab first.</div>
            ) : (
              <>
                <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[220px_1fr]">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Profit Rate (%)</label>
                    <input
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={profitRatePct}
                      onChange={(e) => setProfitRatePct(e.target.value)}
                      inputMode="decimal"
                      disabled={!priceEditMode}
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <Button
                      variant={priceBase === "purchase" ? "default" : "outline"}
                      onClick={() => setPriceBase("purchase")}
                      disabled={!priceEditMode}
                    >
                      Apply On Purchase Price
                    </Button>
                    <Button
                      variant={priceBase === "total" ? "default" : "outline"}
                      onClick={() => setPriceBase("total")}
                      disabled={!priceEditMode}
                    >
                      Apply On Total Price
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Shipment Avg Rate: {shipmentAvgRate(selectedShipment)} • Cargo/KG: {gbp(selectedShipment?.cargo_cost_per_kg)}
                    </div>
                    {priceEditMode ? (
                      <Button
                        size="icon"
                        onClick={saveCalculatedPrice}
                        disabled={savingCalculatedPrice || !priceCalculatedRows.length}
                        title="Save calculated selling price"
                        aria-label="Save calculated selling price"
                      >
                        {savingCalculatedPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setPriceEditMode(true)}>
                        Edit Calculated Selling Price
                      </Button>
                    )}
                  </div>
                </div>
                {calculatedPriceMsg ? <div className="rounded-lg border px-3 py-2 text-sm">{calculatedPriceMsg}</div> : null}
                <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                  Changing <span className="font-semibold">Price Mode</span> recalculates preview instantly in FE. Values are saved to DB only when you click <span className="font-semibold">Save Calculated Selling Price</span>.
                </div>
                <div className="rounded-lg border px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Profit Rule: </span>
                  <span className="font-semibold">
                    {calcMode === "purchase"
                      ? "(Item x rate) + Item + Cargo"
                      : "(Item+Cargo) x rate + (Item+Cargo)"}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  Weights shown in g. Cargo = total weight (kg) x shipment cargo cost per kg.
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-1" colSpan={9}>Cost Section</th>
                        <th className="bg-primary/10 px-3 py-1 text-primary" colSpan={2}>Offer Section</th>
                      </tr>
                      <tr className="text-left">
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Needed</th>
                        <th className="px-3 py-2">Weight (g)</th>
                        <th className="px-3 py-2">Item / Unit</th>
                        <th className="px-3 py-2">Cargo / Unit</th>
                        <th className="px-3 py-2">Item+Cargo / Unit</th>
                        <th className="px-3 py-2">Total Item</th>
                        <th className="px-3 py-2">Total Cargo</th>
                        <th className="px-3 py-2">Total Cost</th>
                        <th className="bg-primary/5 px-3 py-2 text-primary">Calculated Offer / Unit</th>
                        <th className="bg-primary/5 px-3 py-2 text-primary">Calculated Total / Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {priceCalculatedRows.map((r) => {
                        const rate = n(calcRate, shipmentAvgRate(selectedShipment));
                        const itemUnitGbp = r2(r.buyUnit);
                        const itemUnitBdt = Math.round(itemUnitGbp * rate);
                        const cargoUnitGbp = r2(r.cargoUnitGbp);
                        const cargoUnitBdt = Math.round(cargoUnitGbp * rate);
                        const itemPlusCargoUnitGbp = r2(itemUnitGbp + cargoUnitGbp);
                        const itemPlusCargoUnitBdt = Math.round(itemPlusCargoUnitGbp * rate);
                        const totalItemGbp = r2(r.purchaseTotalGbp);
                        const totalItemBdt = Math.round(totalItemGbp * rate);
                        const totalCargoGbp = r2(r.cargoTotalGbp);
                        const totalCargoBdt = Math.round(totalCargoGbp * rate);
                        const totalCostGbp = r2(r.landedTotalGbp);
                        const totalCostBdt = Math.round(totalCostGbp * rate);
                        return (
                          <tr key={r.order_item_id}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-9 w-9 overflow-hidden rounded border bg-white">
                                  {r.image_url ? <img src={imgUrl(r.image_url)} alt={r.name} className="h-full w-full object-cover" /> : null}
                                </div>
                                <div className="font-medium">{r.name}</div>
                              </div>
                            </td>
                            <td className="px-3 py-2">{Math.round(r.qty)}</td>
                            <td className="px-3 py-2">
                              <div>P {weightKgToG(r.upw)}</div>
                              <div>Pkg {weightKgToG(r.ukw)}</div>
                              <div>T {weightKgToG(r.utw)}</div>
                            </td>
                            <td className="px-3 py-2"><div>{gbp(itemUnitGbp)}</div><div>{bdt(itemUnitBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(cargoUnitGbp)}</div><div>{bdt(cargoUnitBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(itemPlusCargoUnitGbp)}</div><div>{bdt(itemPlusCargoUnitBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(totalItemGbp)}</div><div>{bdt(totalItemBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(totalCargoGbp)}</div><div>{bdt(totalCargoBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(totalCostGbp)}</div><div>{bdt(totalCostBdt)}</div></td>
                            <td className="bg-primary/5 px-3 py-2"><div>{gbp(r.offeredProductUnitGbp)}</div><div>{bdt(r.offeredProductUnitBdt)}</div></td>
                            <td className="bg-primary/5 px-3 py-2"><div>{gbp(r.sellingUnitGbp)}</div><div>{bdt(r.sellingUnitBdt)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        return (
                          <tr className="bg-muted/30 font-semibold">
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2">{Math.round(priceTotals.qty)}</td>
                            <td className="px-3 py-2">
                              <div>P {Math.round(priceModeColTotals.productWtG)}</div>
                              <div>Pkg {Math.round(priceModeColTotals.packageWtG)}</div>
                              <div>T {Math.round(priceModeColTotals.totalWtG)}</div>
                            </td>
                            <td className="px-3 py-2"><div>{gbp(priceModeColTotals.itemUnitGbp)}</div><div>{bdt(priceModeColTotals.itemUnitBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(priceModeColTotals.cargoUnitGbp)}</div><div>{bdt(priceModeColTotals.cargoUnitBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(priceModeColTotals.itemPlusCargoUnitGbp)}</div><div>{bdt(priceModeColTotals.itemPlusCargoUnitBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(priceModeColTotals.totalItemGbp)}</div><div>{bdt(priceModeColTotals.totalItemBdt)}</div></td>
                            <td className="px-3 py-2"><div>{gbp(priceModeColTotals.totalCargoGbp)}</div><div>{bdt(Math.round(priceModeColTotals.totalCargoGbp * n(shipmentAvgRate(selectedShipment), 0)))}</div></td>
                            <td className="px-3 py-2"><div>{gbp(priceModeColTotals.totalItemPlusCargoGbp)}</div><div>{bdt(priceModeColTotals.totalItemPlusCargoBdt)}</div></td>
                            <td className="bg-primary/10 px-3 py-2"><div>{gbp(priceModeColTotals.offeredProductUnitGbp)}</div><div>{bdt(priceModeColTotals.offeredProductUnitBdt)}</div></td>
                            <td className="bg-primary/10 px-3 py-2"><div>{gbp(priceModeColTotals.sellingUnitGbp)}</div><div>{bdt(priceModeColTotals.sellingUnitBdt)}</div></td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : tab === "negotiate" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Negotiate & Finalize</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canOpenNegotiateTab ? (
              <div className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                Complete <span className="font-semibold">Calculate Price</span> first to unlock this tab.
              </div>
            ) : (
              <>
            <div className="grid gap-2 md:grid-cols-4">
              <div className="rounded-lg border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Total Item Cost (Item + Cargo)</div>
                <div className="font-semibold">{gbp(negotiationTotals.baseTotalCostGbp)}</div>
                <div className="text-xs text-muted-foreground">{bdt(negotiationTotals.baseTotalCostBdt)}</div>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Final Total</div>
                <div className="font-semibold">{gbp(negotiationTotals.finalTotalGbp)}</div>
                <div className="text-xs text-muted-foreground">{bdt(negotiationTotals.finalTotalBdt)}</div>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Profit</div>
                <div className="font-semibold">{gbp(negotiationTotals.profitGbp)}</div>
                <div className="text-xs text-muted-foreground">{bdt(negotiationTotals.profitBdt)}</div>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Profit Rate</div>
                <div className="font-semibold">{negotiationTotals.profitPct}%</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Current status: {String(order?.status || "-")} • Rate: {negotiationRate || 0} BDT/GBP
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Select value={statusDraft || currentStatus || "submitted"} onValueChange={setStatusDraft}>
                  <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedStatusOptions.map((s) => (
                      <SelectItem key={`neg-status-${s}`} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveOrderStatus}
                  disabled={statusSaving || !statusDraft || statusDraft === currentStatus}
                >
                  {statusSaving ? "Updating..." : "Update Status"}
                </Button>
              </div>
            </div>
            {negotiationMsg ? <div className="rounded-lg border px-3 py-2 text-sm">{negotiationMsg}</div> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Ordered Qty</th>
                    <th className="px-3 py-2">Customer Qty</th>
                    <th className="px-3 py-2">Offered Price</th>
                    <th className="px-3 py-2">Customer Offer</th>
                    <th className="px-3 py-2">Final Qty</th>
                    <th className="px-3 py-2">Final Price</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {negotiationRows.map((r) => {
                    const id = String(r.order_item_id || "");
                    const isEditable = negotiationRowEdit[id] ?? true;
                    const pct = (sellGbp, sellBdt) => {
                      const base = n(r.baseUnitCostBdt, 0);
                      const s = n(sellBdt, 0) || Math.round(n(sellGbp, 0) * n(negotiationRate, 0));
                      if (!(base > 0) || !(s > 0)) return "-";
                      return `${r2(((s - base) / base) * 100)}%`;
                    };
                    const finalUnitDraft = n(
                      negotiationDraft[id]?.finalUnit,
                      negotiationCurrency === "gbp" ? r.finalUnitGbp : r.finalUnitBdt,
                    );
                    const finalUnitDraftGbp =
                      negotiationCurrency === "gbp"
                        ? finalUnitDraft
                        : n(negotiationRate, 0) > 0
                          ? finalUnitDraft / n(negotiationRate, 0)
                          : 0;
                    const finalUnitDraftBdt =
                      negotiationCurrency === "bdt"
                        ? finalUnitDraft
                        : Math.round(finalUnitDraft * n(negotiationRate, 0));
                    return (
                      <tr key={id}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 overflow-hidden rounded border bg-white">
                              {r.image_url ? <img src={imgUrl(r.image_url)} alt={r.name} className="h-full w-full object-cover" /> : null}
                            </div>
                            <div className="font-medium">{r.name}</div>
                          </div>
                        </td>
                        <td className="px-3 py-2">{r.orderedQty}</td>
                        <td className="px-3 py-2">{r.customerChangedQty}</td>
                        <td className="px-3 py-2">
                          <div>{gbp(r.offeredUnitGbp)}</div>
                          <div className="text-[10px] text-muted-foreground">{bdt(r.offeredUnitBdt)}</div>
                          <div className="text-[10px] text-muted-foreground">Profit {pct(r.offeredUnitGbp, r.offeredUnitBdt)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span>{gbp(r.customerUnitGbp)} / {bdt(r.customerUnitBdt)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() =>
                                setNegotiationDraft((p) => ({
                                  ...p,
                                  [id]: {
                                    ...(p[id] || {}),
                                    finalUnit: String(negotiationCurrency === "gbp" ? r.customerUnitGbp : r.customerUnitBdt),
                                  },
                                }))
                              }
                              disabled={!isEditable}
                            >
                              Accept
                            </Button>
                          </div>
                          <div className="text-[10px] text-muted-foreground">Profit {pct(r.customerUnitGbp, r.customerUnitBdt)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-8 w-24 rounded-md border bg-background px-2"
                            value={String(negotiationDraft[id]?.finalQty ?? r.finalQty)}
                            onChange={(e) =>
                              setNegotiationDraft((p) => ({
                                ...p,
                                [id]: { ...(p[id] || {}), finalQty: e.target.value },
                              }))
                            }
                            disabled={!isEditable}
                            inputMode="numeric"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-8 w-28 rounded-md border bg-background px-2"
                            value={String(
                              negotiationDraft[id]?.finalUnit ??
                                (negotiationCurrency === "gbp" ? r.finalUnitGbp : r.finalUnitBdt),
                            )}
                            onChange={(e) =>
                              setNegotiationDraft((p) => ({
                                ...p,
                                [id]: { ...(p[id] || {}), finalUnit: e.target.value },
                              }))
                            }
                            disabled={!isEditable}
                            inputMode="decimal"
                          />
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {gbp(finalUnitDraftGbp)} / {bdt(finalUnitDraftBdt)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Profit {pct(finalUnitDraftGbp, finalUnitDraftBdt)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {!isEditable ? (
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => setNegotiationRowEdit((p) => ({ ...p, [id]: true }))}
                                aria-label="Edit row"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                onClick={() => saveNegotiationRow(r)}
                                disabled={!!negotiationRowSaving[id]}
                                aria-label="Save row"
                                title="Save"
                              >
                                {negotiationRowSaving[id] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="destructive"
                              onClick={() => removeNegotiationRow(r)}
                              disabled={!!negotiationRemoving[id]}
                              aria-label="Remove item"
                              title="Remove item"
                            >
                              {negotiationRemoving[id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calculate Price</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedShipmentId ? (
              <div className="text-sm text-muted-foreground">Select a shipment in Shipment tab first.</div>
            ) : (
              <>
                <div className="mb-3 rounded-lg border p-3 text-xs text-muted-foreground">
                  Using saved price mode: <span className="font-semibold">{calcMode}</span>.
                </div>
                <div className="mb-3 flex items-center gap-2 rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Customer sees:</div>
                  <Button
                    size="sm"
                    variant={customerPriceCurrency === "gbp" ? "default" : "outline"}
                    onClick={() => chooseCustomerPriceCurrency("gbp")}
                    disabled={currencySaving}
                  >
                    Offer Price GBP
                  </Button>
                  <Button
                    size="sm"
                    variant={customerPriceCurrency === "bdt" ? "default" : "outline"}
                    onClick={() => chooseCustomerPriceCurrency("bdt")}
                    disabled={currencySaving}
                  >
                    Offer Price BDT
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCustomerPreview((v) => !v)}
                  >
                    {showCustomerPreview ? "Hide Preview" : "Preview"}
                  </Button>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="text-xs text-muted-foreground">Current status: {String(order?.status || "-")}</div>
                    <Select value={statusDraft || currentStatus || "submitted"} onValueChange={setStatusDraft}>
                      <SelectTrigger className="h-8 w-[180px]">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedStatusOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveOrderStatus}
                      disabled={statusSaving || !statusDraft || statusDraft === currentStatus}
                    >
                      {statusSaving ? "Updating..." : "Update Status"}
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                  To let customer see prices, set order status to <span className="font-semibold">priced</span>.
                </div>
                {showCustomerPreview ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2">Customer Preview Item</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Price / Unit</th>
                          <th className="px-3 py-2">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {customerPreviewRows.map((r) => (
                          <tr key={r.order_item_id}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 overflow-hidden rounded border bg-white">
                                  {r.image_url ? <img src={imgUrl(r.image_url)} alt={r.name} className="h-full w-full object-cover" /> : null}
                                </div>
                                <div>{r.name}</div>
                              </div>
                            </td>
                            <td className="px-3 py-2">{r.qty}</td>
                            <td className="px-3 py-2">
                              {r.unit == null ? "-" : r.currency === "gbp" ? gbp(r.unit) : bdt(r.unit)}
                            </td>
                            <td className="px-3 py-2">
                              {r.total == null ? "-" : r.currency === "gbp" ? gbp(r.total) : bdt(r.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Purchase / Unit (GBP)</th>
                      <th className="px-3 py-2">Calculated Price (GBP)</th>
                      <th className="px-3 py-2">Calculated Price (BDT)</th>
                      <th className="px-3 py-2">Calculated Total / Unit (Final Offer)</th>
                      <th className="px-3 py-2">Offer Price (GBP)</th>
                      <th className="px-3 py-2">Offer Price (BDT)</th>
                      <th className="px-3 py-2">Profit (%)</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {calcRows.map((r) => (
                      <tr key={r.order_item_id}>
                        {(() => {
                          const id = String(r.order_item_id || "");
                          const hasSaved = !!itemByOrderItemId[id]?.calculated_selling_price;
                          const isEditable = rowEditMode[id] ?? !hasSaved;
                          return (
                            <>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 overflow-hidden rounded border bg-white">
                              {r.image_url ? <img src={imgUrl(r.image_url)} alt={r.name} className="h-full w-full object-cover" /> : null}
                            </div>
                            <div className="font-medium">{r.name}</div>
                          </div>
                        </td>
                        <td className="px-3 py-2">{Math.round(r.qty)}</td>
                        <td className="px-3 py-2">{gbp(r.buyUnit)}</td>
                        <td className="px-3 py-2">{r.calcPriceGbp == null ? "-" : gbp(r.calcPriceGbp)}</td>
                        <td className="px-3 py-2">{r.calcPriceBdt == null ? "-" : bdt(r.calcPriceBdt)}</td>
                        <td className="px-3 py-2">
                          <div>{gbp(r.finalOfferUnitGbp)}</div>
                          <div>{bdt(r.finalOfferUnitBdt)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-8 w-28 rounded-md border bg-background px-2"
                            value={r.draft.offerGbp}
                            onChange={(e) => updateCalcOfferGbp(r, e.target.value)}
                            inputMode="decimal"
                            disabled={calcMode === "total" || !isEditable}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-8 w-28 rounded-md border bg-background px-2"
                            value={r.draft.offerBdt}
                            onChange={(e) => updateCalcOfferBdt(r, e.target.value)}
                            inputMode="numeric"
                            disabled={calcMode === "purchase" || !isEditable}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-8 w-24 rounded-md border bg-background px-2"
                            value={r.draft.profitPct}
                            onChange={(e) => updateCalcPct(r, e.target.value)}
                            inputMode="decimal"
                            disabled={!isEditable}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {hasSaved && !isEditable ? (
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setRowEditMode((p) => ({ ...p, [id]: true }))}
                              aria-label="Edit row"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              onClick={() => saveCalcRow(r)}
                              disabled={!!rowSaving[id]}
                              aria-label="Save row"
                              title="Save"
                            >
                              {rowSaving[id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </td>
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
