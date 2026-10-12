"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

type SearchItem = {
  id: string;
  title: string;
  category: "Navigation" | "Quick Action" | "Module" | "Student" | "Staff";
  href?: string;
  icon?: string;
  shortcut?: string;
};

const COMMAND_ITEMS: SearchItem[] = [
  { id: "dash", title: "Dashboard Overview", category: "Navigation", href: "/", shortcut: "G D" },
  { id: "students", title: "Students Directory & Cadets", category: "Navigation", href: "/students", shortcut: "G S" },
  { id: "staff", title: "Staff Master & Payroll", category: "Navigation", href: "/staff", shortcut: "G T" },
  { id: "attendance", title: "Daily Cadet Attendance & Roll Call", category: "Navigation", href: "/attendance", shortcut: "G A" },
  { id: "fees", title: "Fee Collection & Invoicing", category: "Navigation", href: "/fees", shortcut: "G F" },
  { id: "reports", title: "Institutional Reports & Dashboards", category: "Navigation", href: "/reports", shortcut: "G R" },
  { id: "notifs", title: "Notification Logs & Alerts", category: "Navigation", href: "/notifications", shortcut: "G N" },
  { id: "add_student", title: "Register New Student", category: "Quick Action", href: "/students" },
  { id: "add_staff", title: "Add Staff Member", category: "Quick Action", href: "/staff" },
  { id: "take_att", title: "Take Morning Roll Call", category: "Quick Action", href: "/attendance" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const filtered = COMMAND_ITEMS.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (item: SearchItem) => {
    if (item.href) {
      router.push(item.href);
    }
    setOpen(false);
  };

  return (
    <>
      {/* Search Bar Trigger Button in Navbar */}
      <div
        onClick={() => setOpen(true)}
        className="relative w-full max-w-md hidden sm:flex items-center cursor-pointer group"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 group-hover:text-blue-500 transition">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] py-2 pl-9 pr-14 text-[13px] text-slate-400 group-hover:border-blue-300 group-hover:bg-white transition flex items-center">
          Search students, teachers, classes, fees...
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 shadow-2xs">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Modal Dialog */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              {/* Search Input */}
              <div className="flex items-center border-b border-slate-100 px-4 py-3">
                <svg className="h-5 w-5 text-slate-400 mr-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
                    } else if (e.key === "Enter" && filtered[selectedIndex]) {
                      handleSelect(filtered[selectedIndex]);
                    }
                  }}
                  placeholder="Type a command or search institutional records..."
                  className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                />
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xs font-semibold"
                >
                  ESC
                </button>
              </div>

              {/* Results List */}
              <div className="max-h-80 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No commands matching &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filtered.map((item, index) => {
                      const isSelected = index === selectedIndex;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium cursor-pointer transition ${
                            isSelected
                              ? "bg-blue-50 text-blue-900"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {item.category}
                            </span>
                            <span className="font-semibold text-slate-800">{item.title}</span>
                          </div>
                          {item.shortcut && (
                            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 shadow-2xs">
                              {item.shortcut}
                            </kbd>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Navigate with <kbd className="font-bold">↑</kbd> <kbd className="font-bold">↓</kbd></span>
                  <span>•</span>
                  <span>Select with <kbd className="font-bold">↵</kbd></span>
                </div>
                <span>Genesis Lumia Search</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
