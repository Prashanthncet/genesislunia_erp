"use client";

import React from "react";
import { motion } from "motion/react";

export type SmoothTabItem = {
  id: string;
  label: string;
  badge?: number | string;
  icon?: React.ReactNode;
};

export function SmoothTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: {
  tabs: SmoothTabItem[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 rounded-2xl bg-slate-100/90 p-1.5 backdrop-blur-md ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id as T)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 rounded-xl bg-white shadow-xs"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                  isActive ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                }`}>
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
