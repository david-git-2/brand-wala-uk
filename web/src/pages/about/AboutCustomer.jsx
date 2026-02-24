import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Tag,
  MessageSquareReply,
  CheckCircle2,
  Truck,
  PackageCheck,
} from "lucide-react";

export default function AboutCustomer() {
  const steps = [
    {
      icon: ShoppingCart,
      title: "1. Place Order",
      status: "submitted",
      text: "Add products and place order. You can then track it from Orders.",
    },
    {
      icon: Tag,
      title: "2. Wait For Price",
      status: "priced",
      text: "Admin sets offer prices. You can review item-level offers.",
    },
    {
      icon: MessageSquareReply,
      title: "3. Send Counter",
      status: "under_review",
      text: "You can submit your item-level counter offer while order is priced.",
    },
    {
      icon: CheckCircle2,
      title: "4. Finalized",
      status: "finalized",
      text: "Admin confirms final quantity and final price.",
    },
    {
      icon: Truck,
      title: "5. Processing",
      status: "processing / partially_delivered",
      text: "Shipment and receiving are in progress; delivery can be partial.",
    },
    {
      icon: PackageCheck,
      title: "6. Delivered",
      status: "delivered",
      text: "Order is completed and becomes read-only.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Customer Guide</h1>
        <p className="text-sm text-muted-foreground">How order status changes from submit to delivery.</p>
      </div>

      <div className="space-y-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Order Flow</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">{s.title}</div>
                  </div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    <code>{s.status}</code>
                  </div>
                  <div className="text-sm text-muted-foreground">{s.text}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What You Can Edit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>At <code>priced</code>: you can set customer counter price (and quantity if enabled).</p>
            <p>At <code>under_review</code> and later: values are locked for customer edit.</p>
            <p>At <code>delivered</code> / <code>cancelled</code>: read-only.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price Visibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>If <code>can_see_price_gbp = 1</code>, GBP price fields are visible.</p>
            <p>If <code>can_see_price_gbp = 0</code>, GBP fields are hidden and BDT-facing values are shown.</p>
            <p>Customer pricing appears from <Badge variant="secondary">priced</Badge> status onward.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
