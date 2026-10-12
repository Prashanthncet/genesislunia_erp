"use client";

import * as React from "react";

type SelectContextType = {
  value: string;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SelectContext = React.createContext<SelectContextType | null>(null);

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative inline-block text-left">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(SelectContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.setOpen(!ctx.open)}
      className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 focus:outline-none transition ${className || ""}`}
      {...props}
    >
      {children}
      <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectContext);
  const labels: Record<string, string> = {
    "90d": "Last 3 months",
    "30d": "Last 30 days",
    "7d": "Last 7 days",
  };
  return <span>{ctx?.value ? (labels[ctx.value] || ctx.value) : placeholder}</span>;
}

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);
  if (!ctx?.open) return null;

  return (
    <div
      className={`absolute right-0 z-50 mt-1 min-w-[8rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg animate-in fade-in-80 ${className || ""}`}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx?.value === value;

  return (
    <div
      onClick={() => {
        ctx?.onValueChange(value);
        ctx?.setOpen(false);
      }}
      className={`relative flex cursor-pointer select-none items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none transition ${
        isSelected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100"
      } ${className || ""}`}
    >
      {children}
    </div>
  );
}
