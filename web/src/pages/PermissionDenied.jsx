import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PermissionDenied() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center p-4 md:p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Permission Denied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You do not have permission to access this page.
          </p>
          <Button onClick={() => navigate("/products")}>Go To Products</Button>
        </CardContent>
      </Card>
    </div>
  );
}

