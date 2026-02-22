import { useEffect, useMemo, useState } from "react";

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

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-base font-semibold text-slate-900">{title}</div>
          </div>

          <div className="px-5 py-4">{children}</div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}

function todayYMD() {
  // YYYY-MM-DD in local timezone
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PlaceOrderDialog({
  open,
  onClose,
  onCreate,
  loading = false,
  error = "",
  userEmail = "", // ✅ new prop
}) {
  const defaultName = useMemo(() => {
    const email = String(userEmail || "").trim();
    const date = todayYMD();
    return email ? `${email} - ${date}` : `Order - ${date}`;
  }, [userEmail]);

  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onClose?.();
      }}
      title="Place order"
      footer={
        <>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => onCreate?.(name)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" />
                Create order
              </>
            ) : (
              "Create order"
            )}
          </button>
        </>
      }
    >
      <label className="block text-sm font-medium text-slate-700">Order name</label>

      {/* ✅ auto-filled + disabled + no autofill */}
      <input
        value={name}
        readOnly
        disabled
        autoComplete="off"
        spellCheck={false}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none"
      />

      {error ? (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-3 text-xs text-slate-500">
        This will create an order from your current cart. Status will be{" "}
        <span className="font-semibold text-slate-700">submitted</span>.
      </div>
    </Modal>
  );
}