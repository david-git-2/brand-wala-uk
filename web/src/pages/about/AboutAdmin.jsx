import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AboutAdmin() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Guide</h1>
        <p className="text-sm text-muted-foreground">How to operate the full order, shipment, pricing, and user workflow.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Use <Badge variant="secondary">Users</Badge> to create accounts and set role, active, and can see pound price flags.</p>
            <p>Use <Badge variant="secondary">Pricing Models</Badge> to create active pricing modes before pricing orders.</p>
            <p>Use <Badge variant="secondary">Shipments</Badge> to create shipment rates and cargo cost per kg.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Order Lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Customer creates order from cart. Status starts at <code>submitted</code>.</p>
            <p>Admin sets pricing mode + profit and runs <code>Price</code> to move to <code>priced</code>.</p>
            <p>Customer can counter. Admin can finalize and then start processing.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Shipments & Allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Open shipment details and add allocation rows per <code>order_item_id</code>.</p>
            <p>Set allocated qty, shipped qty, and weights in allocation only.</p>
            <p>One shipment can contain multiple orders, and one order item can be split across shipments.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Recompute & Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>After allocation updates, run shipment recompute, then order recompute.</p>
            <p>System rolls up BDT totals and updates item tracking fields.</p>
            <p>When shipped reaches ordered qty, order status moves to <code>delivered</code> and locks edits.</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Rules To Remember</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>GBP fields are rounded to 2 decimals. BDT fields are rounded to 0 decimals.</p>
            <p>Over-shipping is blocked: total shipped qty for an item cannot exceed ordered qty.</p>
            <p>Do not edit weights in order items. Weight source of truth is shipment allocation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
