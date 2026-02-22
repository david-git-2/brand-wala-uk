import React from "react";

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

export default function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title = "Delete",
  description = "Are you sure? This action cannot be undone.",
  confirmText = "Delete",
  loading = false,
  error = "",
}) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onClose?.();
      }}
      title={title}
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" />
                Deleting…
              </>
            ) : (
              confirmText
            )}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-700">{description}</div>

      {error ? (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </Modal>
  );
}