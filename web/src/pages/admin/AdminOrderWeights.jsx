import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { UK_API } from "../../api/ukApi";

function Spinner({ className = "" }) {
  return (
    <span
      className={[
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

function normalizeLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function toNumOrBlank(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

export default function AdminOrderWeights() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { orderId } = useParams(); // route: /admin/orders/:orderId/weights

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [items, setItems] = useState([]);     // server items
  const [draft, setDraft] = useState([]);     // local editable

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.email || !orderId) return;
      setLoading(true);
      setErr("");
      setMsg("");

      try {
        const res = await UK_API.getOrderItems(user.email, orderId);
        const arr = Array.isArray(res.items) ? res.items : [];

        if (!alive) return;

        // keep only columns we need in UI, but retain product_id for saving
        const cleaned = arr.map((x) => ({
          product_id: String(x.product_id || "").trim(),
          name: String(x.name || "").trim(),
          product_weight: x.product_weight ?? "",
          package_weight: x.package_weight ?? "",
        }));

        setItems(cleaned);
        setDraft(cleaned.map((x) => ({ ...x })));
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load items");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [user?.email, orderId]);

  const dirtyCount = useMemo(() => {
    const beforeById = new Map(items.map((x) => [x.product_id, x]));
    let c = 0;
    for (const d of draft) {
      const b = beforeById.get(d.product_id);
      if (!b) continue;
      if (String(b.product_weight ?? "") !== String(d.product_weight ?? "")) c++;
      else if (String(b.package_weight ?? "") !== String(d.package_weight ?? "")) c++;
    }
    return c;
  }, [items, draft]);

  function copyColumn(key) {
    const text = draft.map((r) => String(r[key] ?? "")).join("\n");
    copyToClipboard(text).then(() => setMsg(`Copied ${key} (${draft.length} rows)`));
  }

  function pasteColumn(key, text) {
    const lines = normalizeLines(text);

    setDraft((prev) =>
      prev.map((row, i) => {
        const v = lines[i];
        if (v == null) return row;
        return {
          ...row,
          [key]: key.includes("weight") ? toNumOrBlank(v) : String(v),
        };
      })
    );
    setMsg(`Pasted into ${key}`);
  }

  async function onSave() {
    if (!user?.email || !orderId) return;

    setSaving(true);
    setErr("");
    setMsg("");

    try {
      const beforeById = new Map(items.map((x) => [x.product_id, x]));
      const rows = [];

      for (const d of draft) {
        const b = beforeById.get(d.product_id);
        if (!b) continue;

        const pwChanged = String(b.product_weight ?? "") !== String(d.product_weight ?? "");
        const pkChanged = String(b.package_weight ?? "") !== String(d.package_weight ?? "");
        if (!pwChanged && !pkChanged) continue;

        rows.push({
          product_id: d.product_id,
          ...(pwChanged ? { product_weight: d.product_weight } : {}),
          ...(pkChanged ? { package_weight: d.package_weight } : {}),
        });
      }

      if (!rows.length) {
        setMsg("No changes to save.");
        return;
      }

      const res = await UK_API.orderItemsBulkUpdateWeights(user.email, orderId, rows);

      // reload after save (simple and correct)
      const again = await UK_API.getOrderItems(user.email, orderId);
      const arr = Array.isArray(again.items) ? again.items : [];
      const cleaned = arr.map((x) => ({
        product_id: String(x.product_id || "").trim(),
        name: String(x.name || "").trim(),
        product_weight: x.product_weight ?? "",
        package_weight: x.package_weight ?? "",
      }));

      setItems(cleaned);
      setDraft(cleaned.map((x) => ({ ...x })));

      setMsg(`Saved. Updated: ${res.updated}, Skipped: ${res.skipped}`);
    } catch (e) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Weights</h1>
          <p className="text-sm text-slate-500 break-all">Order: {orderId}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back
          </button>

          <button
            onClick={onSave}
            disabled={saving || dirtyCount === 0}
            className={[
              "rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-2",
              saving || dirtyCount === 0
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-slate-900 text-white hover:bg-slate-800",
            ].join(" ")}
          >
            {saving ? <Spinner className="h-4 w-4" /> : null}
            Save ({dirtyCount})
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">{err}</div>
      ) : null}

      {msg ? (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{msg}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Grid */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900">Items</div>
              <div className="text-xs text-slate-500">{draft.length} rows</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white">
                  <tr className="text-left text-xs text-slate-600">
                    <th className="px-4 py-3 font-semibold">product_id</th>
                    <th className="px-4 py-3 font-semibold">name</th>
                    <th className="px-4 py-3 font-semibold">product_weight</th>
                    <th className="px-4 py-3 font-semibold">package_weight</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {draft.map((r, i) => (
                    <tr key={r.product_id || i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-600 break-all">{r.product_id}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">{r.name || "—"}</div>
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={String(r.product_weight ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, product_weight: v } : x))
                            );
                          }}
                          inputMode="decimal"
                          className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400"
                          placeholder="e.g. 0.35"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={String(r.package_weight ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, package_weight: v } : x))
                            );
                          }}
                          inputMode="decimal"
                          className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400"
                          placeholder="e.g. 0.40"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Tip: Use the right panel to copy/paste whole columns like Excel.
            </div>
          </div>

          {/* Column Copy/Paste Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold text-slate-900">Copy columns</div>

              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  onClick={() => copyColumn("name")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Copy name (full column)
                </button>

                <button
                  onClick={() => copyColumn("product_id")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Copy product_id (full column)
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold text-slate-900">Paste columns</div>
              <p className="mt-1 text-xs text-slate-500">
                Paste newline-separated values. Row order matches the table.
              </p>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-700">Paste product_weight</div>
                    <button
                      onClick={() => pasteColumn("product_weight", "")}
                      className="text-xs text-slate-400 hover:text-slate-600"
                      title="No-op"
                      type="button"
                    >
                      {/* spacer */}
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400"
                    placeholder={`0.35\n0.20\n0.50`}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      e.preventDefault();
                      pasteColumn("product_weight", text);
                    }}
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Tip: copy a column from Excel and paste here.
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700">Paste package_weight</div>
                  <textarea
                    rows={6}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400"
                    placeholder={`0.40\n0.25\n0.55`}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      e.preventDefault();
                      pasteColumn("package_weight", text);
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                This page updates weights only. After updating weights, go back to Orders and press{" "}
                <span className="font-semibold">Recalculate</span> (if needed) to update Curia totals.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}