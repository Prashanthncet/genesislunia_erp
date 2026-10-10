"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartData = [
  { subject: "Maths", score: 78, passRate: 92 },
  { subject: "Science", score: 84, passRate: 95 },
  { subject: "English", score: 72, passRate: 88 },
  { subject: "Social", score: 76, passRate: 89 },
  { subject: "Computers", score: 91, passRate: 98 },
  { subject: "Hindi", score: 68, passRate: 82 },
];

const chartConfig = {
  score: {
    label: "Average Score %",
    color: "var(--chart-1)",
  },
  passRate: {
    label: "Pass Rate %",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function PerformanceBarChart() {
  return (
    <Card className="flex h-full flex-col justify-between border-slate-200/90 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">Student Performance</CardTitle>
          <CardDescription className="text-xs text-slate-500 font-medium">Cadet Batch A • Class 8 - 10</CardDescription>
        </div>
        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">Term 1</span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end pb-3">
        <ChartContainer config={chartConfig} className="h-[210px] w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="subject"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="score" fill="var(--color-score)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="passRate" fill="var(--color-passRate)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
