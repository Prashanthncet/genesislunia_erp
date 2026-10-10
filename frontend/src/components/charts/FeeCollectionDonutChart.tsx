"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Label, Pie, PieChart, Cell } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export const description = "A donut chart with text";

type FeeDonutProps = {
  invoiced?: number;
  collected?: number;
  outstanding?: number;
  collectionPct?: number | null;
};

const chartConfig = {
  collected: {
    label: "Collected",
    color: "#10B981",
  },
  outstanding: {
    label: "Outstanding",
    color: "#EF4444",
  },
  discount: {
    label: "Concessions",
    color: "#60A5FA",
  },
} satisfies ChartConfig;

const COLORS = ["#10B981", "#EF4444", "#60A5FA"];

export function FeeCollectionDonutChart({
  invoiced = 1750000,
  collected = 1250000,
  outstanding = 450000,
  collectionPct = 72,
}: FeeDonutProps) {
  const chartData = [
    { name: "Collected", value: collected || 1250000, color: "#10B981" },
    { name: "Outstanding", value: outstanding || 450000, color: "#EF4444" },
    { name: "Concessions", value: Math.max(50000, (invoiced || 1750000) - ((collected || 1250000) + (outstanding || 450000))), color: "#60A5FA" },
  ];

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <Card className="flex h-full flex-col justify-between border-slate-200/90 shadow-xs">
      <CardHeader className="items-center pb-1 text-center">
        <CardTitle className="text-base font-bold text-slate-900">Fee Collection</CardTitle>
        <CardDescription className="text-xs text-slate-500 font-medium">Academic Year 2026 - 2027</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center p-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square h-[190px] w-[190px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              strokeWidth={3}
              stroke="#FFFFFF"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 2}
                          className="fill-slate-900 text-2xl font-black"
                        >
                          {collectionPct || 72}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 18}
                          className="fill-slate-400 text-[10px] font-bold uppercase tracking-wider"
                        >
                          Collected
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 pt-1 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
          <span>Trending up by 5.2% this month</span>
          <TrendingUp className="h-3.5 w-3.5" />
        </div>
        <div className="flex items-center justify-between w-full border-t border-slate-100 pt-2 text-slate-500 font-medium text-[11px]">
          <span>Collected: <strong className="text-slate-900">{inr(collected || 1250000)}</strong></span>
          <span>Pending: <strong className="text-rose-600">{inr(outstanding || 450000)}</strong></span>
        </div>
      </CardFooter>
    </Card>
  );
}
