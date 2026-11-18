import * as React from "react";

import { cn } from "@/lib/utils";

const selectClassName =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(selectClassName, className)} {...props} />;
}

export { Select, selectClassName };
