"use client";

import React from "react";
import { motion } from "motion/react";

type MotionProgressBarProps = {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  showPercent?: boolean;
  colorClassName?: string;
  className?: string;
};

export function MotionProgressBar({
  value,
  max = 100,
  label,
  showPercent = true,
  colorClassName = "from-blue-600 to-indigo-600",
  className = "",
}: MotionProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full space-y-1.5 ${className}`}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          {label && <span>{label}</span>}
          {showPercent && <span className="tabular-nums font-bold text-slate-900">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full bg-gradient-to-r ${colorClassName} shadow-xs`}
        />
      </div>
    </div>
  );
}
