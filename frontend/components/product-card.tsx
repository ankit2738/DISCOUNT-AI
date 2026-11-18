import Link from "next/link";
import { Headphones, Laptop, Shirt, Smartphone, Tv, Watch, WashingMachine, CookingPot, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import type { Product } from "@/lib/types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Smartphones: Smartphone,
  Laptops: Laptop,
  Audio: Headphones,
  Televisions: Tv,
  Footwear: Shirt,
  Wearables: Watch,
  "Home Appliances": WashingMachine,
  "Kitchen Appliances": CookingPot,
};

export function ProductCard({ product }: { product: Product }) {
  const Icon = ICONS[product.category] ?? Package;
  const price = product.lowest_effective_price ?? product.lowest_price ?? null;
  const retailerCount = product.retailer_count ?? 0;

  return (
    <Link href={`/products/${product.slug}`} className="group">
      <Card className="card-hover h-full overflow-hidden">
        <div className="product-placeholder flex h-36 items-center justify-center">
          <Icon className="h-12 w-12 text-teal-800/70" />
        </div>
        <CardContent className="space-y-2 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{product.category}</Badge>
            {product.is_demo && <Badge variant="warning">Demo</Badge>}
            {retailerCount > 1 && <Badge variant="outline">{retailerCount} stores</Badge>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{product.brand}</p>
            <h3 className="line-clamp-2 font-semibold group-hover:text-primary">{product.name}</h3>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-primary">{formatINR(price)}</p>
              <p className="text-xs text-muted-foreground">lowest tracked effective price</p>
            </div>
            <span className="text-xs font-medium text-primary">View →</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
