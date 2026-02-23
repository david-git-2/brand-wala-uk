// ============================
// src/components/PlaceOrderDialog.jsx
// SHADCN + THEME COLORS + UNIQUE PREFILL (DATE + TIME)
// ============================

import { useEffect, useMemo, useState } from "react";

// shadcn/ui
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

// icons
import { Loader2 } from "lucide-react";

function nowStampLocal() {
  // Local timestamp: YYYY-MM-DD HH:mm (24h)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export default function PlaceOrderDialog({
  open,
  onClose,
  onCreate,
  loading = false,
  error = "",
  userEmail = "",
}) {
  const defaultName = useMemo(() => {
    const email = String(userEmail || "").trim();
    const stamp = nowStampLocal();
    return email ? `${email} - ${stamp}` : `Order - ${stamp}`;
  }, [userEmail, open]); // include open so it re-stamps when opening

  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) onClose?.();
      }}
    >
      <DialogContent className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-background p-6 shadow-lg">
        {" "}
        <DialogHeader>
          <DialogTitle className="text-foreground">Place order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Order name
            </label>

            {/* auto-filled + disabled; uses theme colors */}
            <Input
              value={name}
              readOnly
              disabled
              autoComplete="off"
              spellCheck={false}
              className="rounded-xl"
            />
          </div>

          {error ? (
            <Alert variant="destructive" className="rounded-xl">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <p className="text-xs text-muted-foreground">
            This will create an order from your current cart. Status will be{" "}
            <span className="font-semibold text-foreground">submitted</span>.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            type="button"
            className="rounded-xl"
            onClick={() => onCreate?.(name)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Create order
              </>
            ) : (
              "Create order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
