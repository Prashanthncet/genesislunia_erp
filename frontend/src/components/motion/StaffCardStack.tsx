"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

export type StaffCardItem = {
  id: string;
  name: string;
  role: string;
  email: string;
  department?: string;
  salary?: string;
  status: "Active" | "On Leave" | "Probation";
  periodsPerDay: number;
  avatarBg: string;
  bio?: string;
};

export function StaffCardStack({ staffList }: { staffList: StaffCardItem[] }) {
  const [cards, setCards] = useState<StaffCardItem[]>(
    staffList.length > 0
      ? staffList
      : [
          {
            id: "1",
            name: "Rajesh Kumar Sharma",
            role: "Senior Mathematics Master",
            email: "r.sharma@sainik01.edu",
            department: "Faculty of Mathematics",
            salary: "₹68,500 / mo",
            status: "Active",
            periodsPerDay: 5,
            avatarBg: "from-blue-600 to-indigo-700",
            bio: "12+ years mentoring NDA aspirants with top percentile track record.",
          },
          {
            id: "2",
            name: "Col. Vikram Rathore (Retd)",
            role: "Headmaster & Physical Training Officer",
            email: "v.rathore@sainik01.edu",
            department: "Leadership & Drill Master",
            salary: "₹92,000 / mo",
            status: "Active",
            periodsPerDay: 4,
            avatarBg: "from-emerald-600 to-teal-800",
            bio: "Decorated veteran supervising cadet discipline, parade drills, and athletics.",
          },
          {
            id: "3",
            name: "Dr. Ananya Iyer",
            role: "Physics & Science Laboratory Incharge",
            email: "a.iyer@sainik01.edu",
            department: "Faculty of Sciences",
            salary: "₹74,000 / mo",
            status: "Active",
            periodsPerDay: 6,
            avatarBg: "from-purple-600 to-fuchsia-800",
            bio: "Spearheading national robotics and physics olympiad coaching cell.",
          },
        ]
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const activeCard = cards[currentIndex];

  return (
    <div className="relative flex flex-col items-center justify-center p-4">
      <div className="relative h-[320px] w-full max-w-[460px]">
        <AnimatePresence mode="popLayout">
          {cards.map((card, index) => {
            const isCurrent = index === currentIndex;
            const isNext = index === (currentIndex + 1) % cards.length;
            const isNextNext = index === (currentIndex + 2) % cards.length;

            if (!isCurrent && !isNext && !isNextNext) return null;

            const offset = isCurrent ? 0 : isNext ? 1 : 2;

            return (
              <motion.div
                key={card.id}
                layout
                initial={{ scale: 0.9, y: 30, opacity: 0 }}
                animate={{
                  scale: 1 - offset * 0.05,
                  y: offset * 14,
                  zIndex: 30 - offset * 10,
                  opacity: 1 - offset * 0.25,
                }}
                exit={{ x: 300, opacity: 0, rotate: 12, transition: { duration: 0.25 } }}
                transition={{ type: "spring", stiffness: 280, damping: 24 }}
                className="absolute inset-0 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl backdrop-blur-md flex flex-col justify-between"
                drag={isCurrent ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 80) {
                    handleNext();
                  }
                }}
              >
                {/* Header Profile */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.avatarBg} text-base font-extrabold text-white shadow-md`}>
                        {card.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-900 leading-tight">{card.name}</h4>
                        <p className="text-xs font-medium text-blue-600">{card.role}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      {card.status}
                    </span>
                  </div>

                  {card.bio && (
                    <p className="mt-4 text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                      &ldquo;{card.bio}&rdquo;
                    </p>
                  )}
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
                    <p className="font-semibold text-slate-800 truncate">{card.email}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Salary</span>
                    <p className="font-bold text-slate-900 tnum">{card.salary || "₹55,000 / mo"}</p>
                  </div>
                </div>

                {/* Card footer indicator */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400 font-medium">
                  <span>Swipe or click to cycle</span>
                  <span className="font-bold text-slate-700">
                    {currentIndex + 1} / {cards.length}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Control Buttons */}
      <div className="mt-6 flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handlePrev}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 transition"
        >
          ←
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleNext}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-slate-800 transition"
        >
          <span>Next Staff Member</span>
          <span>→</span>
        </motion.button>
      </div>
    </div>
  );
}
