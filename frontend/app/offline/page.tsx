import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardContent className="space-y-3 pt-6 text-center">
          <h1 className="text-2xl font-bold">You are offline</h1>
          <p className="text-sm text-muted-foreground">
            The app shell is available, but live prices, coupons and alerts require a connection to the DISCOUNT AI backend.
          </p>
          <p className="text-xs text-muted-foreground">Reconnect and retry. No cached price is presented as live data.</p>
          <Button asChild><Link href="/">Try again</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
