import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import {
  getShipment,
  listAllocationsForShipment,
  recalcShipmentAllocations,
  updateAllocation as updateShipmentAllocation,
} from "@/firebase/shipments";
import { getOrderItemsForViewer } from "@/firebase/orders";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save } from "lucide-react";

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
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

function parseGramOrBlank(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const g = Number(s);
  return Number.isFinite(g) ? String(g) : "";
}

function toDirectGoogleImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const m = raw.match(/(?:\/d\/|id=)([-\w]{20,})/i);
  if (m?.[1]) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  return raw;
}

function splitLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((x) => x.trim());
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function WeightsSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Skeleton className="h-5 w-56" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminShipmentWeights() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { shipmentId } = useParams();

  const [shipment, setShipment] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [itemsByOrder, setItemsByOrder] = useState({});

  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [productWeightsText, setProductWeightsText] = useState("");
  const [packageWeightsText, setPackageWeightsText] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email || !shipmentId) return;
      setLoading(true);
      setErr("");
      setMsg("");

      try {
        const [sRes, aRes] = await Promise.all([
          getShipment(shipmentId),
          listAllocationsForShipment(shipmentId),
        ]);

        const nextAlloc = Array.isArray(aRes) ? aRes : [];
        const orderIds = [...new Set(nextAlloc.map((a) => String(a.order_id || "").trim()).filter(Boolean))];
        const loaded = await Promise.all(orderIds.map(async (oid) => {
          try {
            const r = await getOrderItemsForViewer({ email: user.email, role: user.role, order_id: oid });
            return [oid, Array.isArray(r.items) ? r.items : []];
          } catch (_) {
            return [oid, []];
          }
        }));

        if (!alive) return;
        setShipment(sRes || null);
        setAllocations(nextAlloc);

        const ibo = {};
        loaded.forEach(([oid, rows]) => {
          ibo[oid] = rows;
        });
        setItemsByOrder(ibo);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load shipment weights");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [user?.email, user?.role, shipmentId]);

  const rows = useMemo(() => {
    const itemMap = {};
    Object.keys(itemsByOrder).forEach((oid) => {
      (itemsByOrder[oid] || []).forEach((it) => {
        const k = String(it.order_item_id || "").trim();
        if (k) itemMap[k] = it;
      });
    });

    const grouped = {};
    allocations.forEach((a) => {
      const key = String(a.order_item_id || "").trim();
      if (!key) return;
      if (!grouped[key]) {
        const meta = itemMap[key] || {};
        grouped[key] = {
          order_item_id: key,
          order_id: String(a.order_id || ""),
          name: String(meta.name || meta.product_id || "Product"),
          product_id: String(meta.product_id || a.product_id || ""),
          image_url: String(meta.image_url || ""),
          allocation_ids: [],
          unit_product_weight: kgToGramInput(a.unit_product_weight),
          unit_package_weight: kgToGramInput(a.unit_package_weight),
        };
      }
      grouped[key].allocation_ids.push(String(a.allocation_id || ""));
    });

    return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
  }, [allocations, itemsByOrder]);

  useEffect(() => {
    const next = {};
    rows.forEach((r) => {
      next[r.order_item_id] = {
        unit_product_weight: r.unit_product_weight,
        unit_package_weight: r.unit_package_weight,
      };
    });
    setDraft(next);
  }, [rows]);

  const dirtyCount = useMemo(() => {
    let c = 0;
    rows.forEach((r) => {
      const d = draft[r.order_item_id] || {};
      if (String(d.unit_product_weight ?? "") !== String(r.unit_product_weight ?? "")
        || String(d.unit_package_weight ?? "") !== String(r.unit_package_weight ?? "")) {
        c += 1;
      }
    });
    return c;
  }, [rows, draft]);

  async function onCopyNames() {
    const txt = rows.map((r) => r.name).join("\n");
    await copyToClipboard(txt);
    setMsg(`Copied ${rows.length} product name(s).`);
  }

  function applyPastedColumns() {
    const pw = splitLines(productWeightsText);
    const pk = splitLines(packageWeightsText);
    const next = { ...draft };

    rows.forEach((r, i) => {
      const cur = next[r.order_item_id] || {};
      const p1 = pw[i];
      const p2 = pk[i];
      next[r.order_item_id] = {
        unit_product_weight: p1 === undefined || p1 === "" ? cur.unit_product_weight ?? "" : parseGramOrBlank(p1),
        unit_package_weight: p2 === undefined || p2 === "" ? cur.unit_package_weight ?? "" : parseGramOrBlank(p2),
      };
    });

    setDraft(next);
    setMsg("Pasted columns applied to rows in the same order.");
  }

  async function onSaveAll() {
    if (!user?.email || !shipmentId) return;
    const changes = [];
    rows.forEach((r) => {
      const d = draft[r.order_item_id] || {};
        const changed = String(d.unit_product_weight ?? "") !== String(r.unit_product_weight ?? "")
        || String(d.unit_package_weight ?? "") !== String(r.unit_package_weight ?? "");
      if (!changed) return;
      changes.push({ row: r, draft: d });
    });

    if (!changes.length) {
      setMsg("No weight changes to save.");
      return;
    }

    setSaving(true);
    setErr("");
    setMsg("");
    try {
      for (let i = 0; i < changes.length; i++) {
        const row = changes[i].row;
        const d = changes[i].draft;
        for (let j = 0; j < row.allocation_ids.length; j++) {
          const allocation_id = row.allocation_ids[j];
          // Sequential write avoids Apps Script concurrent-write collisions.
          await updateShipmentAllocation(allocation_id, {
            unit_product_weight: gramInputToKg(d.unit_product_weight),
            unit_package_weight: gramInputToKg(d.unit_package_weight),
          });
        }
      }

      await recalcShipmentAllocations(shipmentId);

      setMsg(`Saved ${changes.length} product weight row(s).`);
    } catch (e) {
      setErr(e?.message || "Failed to save weights");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Button variant="link" className="h-auto p-0 text-sm" onClick={() => navigate(`/admin/shipments/${shipmentId}`)}>
            Back to shipment
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Shipment Weight Sheet</h1>
          <p className="text-sm text-muted-foreground">
            {shipment?.name || shipmentId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCopyNames} disabled={!rows.length}>Copy Product Names</Button>
          <Button
            size="icon"
            onClick={onSaveAll}
            disabled={saving || dirtyCount === 0}
            title={`Save all (${dirtyCount})`}
            aria-label={`Save all (${dirtyCount})`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {err ? <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div> : null}
      {msg ? <div className="mb-3 rounded-lg border px-4 py-3 text-sm">{msg}</div> : null}

      {loading ? (
        <WeightsSkeleton />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Products In Shipment ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Product Wt</th>
                    <th className="px-3 py-2">Package Wt</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, idx) => (
                    <tr key={r.order_item_id}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 overflow-hidden rounded border bg-white">
                            {toDirectGoogleImageUrl(r.image_url) ? (
                              <img src={toDirectGoogleImageUrl(r.image_url)} alt={r.name} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.name}</div>
                            <div className="text-[10px] text-muted-foreground">{r.product_id || r.order_item_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 w-28 text-xs"
                          inputMode="decimal"
                          value={draft[r.order_item_id]?.unit_product_weight ?? ""}
                          onChange={(e) => setDraft((p) => ({
                            ...p,
                            [r.order_item_id]: {
                              ...(p[r.order_item_id] || {}),
                              unit_product_weight: e.target.value,
                            },
                          }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 w-28 text-xs"
                          inputMode="decimal"
                          value={draft[r.order_item_id]?.unit_package_weight ?? ""}
                          onChange={(e) => setDraft((p) => ({
                            ...p,
                            [r.order_item_id]: {
                              ...(p[r.order_item_id] || {}),
                              unit_package_weight: e.target.value,
                            },
                          }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paste From Sheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                1. Copy names with the button. 2. Generate your sheet by name. 3. Paste each weight column in grams and apply. Saved values are converted to kg for shipment cargo costing.
              </p>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Product Weight Column (g)</label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border bg-background p-2 text-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  value={productWeightsText}
                  onChange={(e) => setProductWeightsText(e.target.value)}
                  placeholder={"0.25\n0.40\n0.18"}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Package Weight Column (g)</label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border bg-background p-2 text-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  value={packageWeightsText}
                  onChange={(e) => setPackageWeightsText(e.target.value)}
                  placeholder={"0.05\n0.08\n0.04"}
                />
              </div>
              <Button className="w-full" variant="outline" onClick={applyPastedColumns}>
                Apply Pasted Columns
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
