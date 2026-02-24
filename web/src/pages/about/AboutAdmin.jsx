import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FilePlus2,
  Calculator,
  MessagesSquare,
  CheckCheck,
  Truck,
  PackageCheck,
  Ban,
  ShieldCheck,
} from "lucide-react";

export default function AboutAdmin() {
  const flow = [
    {
      icon: FilePlus2,
      title: "1. Submitted",
      status: "submitted",
      text: "Customer places an order. Admin starts review.",
    },
    {
      icon: Calculator,
      title: "2. Price",
      status: "priced",
      text: "Admin calculates and saves offer prices.",
    },
    {
      icon: MessagesSquare,
      title: "3. Negotiate",
      status: "under_review",
      text: "Customer sends counters. Admin reviews and updates.",
    },
    {
      icon: CheckCheck,
      title: "4. Finalize",
      status: "finalized",
      text: "Admin locks final quantity and final price.",
    },
    {
      icon: Truck,
      title: "5. Process Shipment",
      status: "processing",
      text: "Assign shipment, update weights, and track arrived qty.",
    },
    {
      icon: PackageCheck,
      title: "6. Deliver",
      status: "partially_delivered / delivered",
      text: "Order auto-moves based on received quantities.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Guide</h1>
        <p className="text-sm text-muted-foreground">Status-first workflow for pricing, negotiation, and shipment processing.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Before Processing Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. User access is correct (`role`, `active`, `can_use_cart`, price visibility).</p>
            <p>2. Shipment has valid rates and cargo per kg.</p>
            <p>3. Order pricing is done and saved (`priced`/`under_review` to `finalized`).</p>
            <p>4. Shipment allocation rows exist for all order items.</p>
            <p>5. Weights are updated in allocation before receiving starts.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Badge variant="secondary">delivered</Badge><span>is read-only for everyone.</span></div>
            <div className="flex items-center gap-2"><Badge variant="secondary">cancelled</Badge><span>can be permanently deleted by admin only.</span></div>
            <p>Customer pricing actions happen at <code>priced</code>.</p>
            <p>Shipment/receiving actions happen after <code>finalized</code>.</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Order Status Flow</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {flow.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">{step.title}</div>
                  </div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    <code>{step.status}</code>
                  </div>
                  <div className="text-sm text-muted-foreground">{step.text}</div>
                </div>
              );
            })}
            <div className="rounded-lg border p-3 md:col-span-2">
              <div className="mb-1 flex items-center gap-2">
                <Ban className="h-4 w-4 text-destructive" />
                <div className="text-sm font-semibold">Cancel Path</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Admin can set <code>cancelled</code> from non-delivered states. Cancelled orders can be permanently deleted with typed confirmation.
              </div>
            </div>
            <div className="rounded-lg border p-3 md:col-span-2">
              <div className="mb-1 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">Permission Principle</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Status controls what each role can edit. Keep status transitions strict to prevent accidental changes.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
