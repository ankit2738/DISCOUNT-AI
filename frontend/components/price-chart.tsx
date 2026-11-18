"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatINR } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

export function PriceChart({ points }: { points: PricePoint[] }) {
  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No price history available.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            minTickGap={30}
            tickFormatter={(value: string) => value.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            width={58}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
          />
          <Tooltip
            formatter={(value) => [formatINR(Number(value)), "Price"]}
            labelFormatter={(label) => `Date: ${String(label)}`}
          />
          <Line type="monotone" dataKey="price" stroke="#0f766e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
