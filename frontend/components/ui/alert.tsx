import * as React from "react";

import { cn } from "@/lib/utils";

function Alert({
  className,
  variant = "info",
  ...props
}: React.ComponentProps<"div"> & { variant?: "info" | "warning" | "error" | "destructive" | "success" }) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    destructive: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div
      role="alert"
      className={cn("rounded-lg border px-4 py-3 text-sm", styles[variant], className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 className={cn("mb-1 font-medium leading-none", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
