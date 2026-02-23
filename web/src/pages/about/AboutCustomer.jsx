import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AboutCustomer() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Customer Guide</h1>
        <p className="text-sm text-muted-foreground">How to place orders, respond to pricing, and track delivery.</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Create Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Add products from <Badge variant="secondary">Products</Badge> to cart and place order.</p>
            <p>Your order appears in <Badge variant="secondary">Orders</Badge> with status and quantity tracking.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Review Prices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>When admin prices your order, status becomes <code>priced</code>.</p>
            <p>In order details, set your customer unit prices and send counter.</p>
            <p>You can also accept the offered prices directly.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Track Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Order details show allocated, shipped, and remaining quantities per item.</p>
            <p>Delivery can be partial across multiple shipments.</p>
            <p>Once delivered, order becomes read-only.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>If your account has <code>can_see_price_gbp = 1</code>, you can view pound price fields.</p>
            <p>If it is <code>0</code>, only non-GBP fields are shown.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
