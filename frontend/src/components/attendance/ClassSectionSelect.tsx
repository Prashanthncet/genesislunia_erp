"use client";

/**
 * Class + Section pickers used wherever a class is chosen on the attendance screens:
 * pick "Class 10", then its sections (A / B). With `allowAll`, either can be left on
 * "All" (the filter then goes to the API as class_name / section). Without it, a
 * concrete class row (one section) is always selected.
 */

import type { ReactNode } from "react";
import { Select } from "@/components/ui";

export type ClassOpt = { id: string; name: string; section: string | null; is_class_teacher?: boolean; _count?: { students: number } };
export type ClassSel = { className: string; section: string };

export const classNames = (classes: ClassOpt[]) => [...new Set(classes.map((c) => c.name))];
export const sectionsOf = (classes: ClassOpt[], className: string) =>
  classes.filter((c) => !className || c.name === className).map((c) => c.section ?? "").filter((s, i, a) => a.indexOf(s) === i);

/** The single class row for a (name, section) pair, if both identify one. */
export function resolveClass(classes: ClassOpt[], sel: ClassSel): ClassOpt | undefined {
  if (!sel.className) return undefined;
  const rows = classes.filter((c) => c.name === sel.className);
  if (rows.length === 1 && !sel.section) return rows[0];
  return rows.find((c) => (c.section ?? "") === sel.section);
}

export const selFor = (c: ClassOpt | undefined): ClassSel => ({ className: c?.name ?? "", section: c?.section ?? "" });

/** Query params for a filter selection: class_id when it is one class row, else class_name/section. */
export function classQuery(classes: ClassOpt[], sel: ClassSel): Record<string, string> {
  const one = resolveClass(classes, sel);
  if (one) return { class_id: one.id };
  const q: Record<string, string> = {};
  if (sel.className) q.class_name = sel.className;
  if (sel.section) q.section = sel.section;
  return q;
}

export function ClassSectionSelect({
  classes, value, onChange, allowAll = false, label = true,
}: {
  classes: ClassOpt[];
  value: ClassSel;
  onChange: (v: ClassSel) => void;
  allowAll?: boolean;
  label?: boolean;
}) {
  const names = classNames(classes);
  const sections = sectionsOf(classes, value.className);
  const pickName = (name: string) => {
    if (allowAll) return onChange({ className: name, section: "" });
    const first = classes.find((c) => c.name === name);
    onChange({ className: name, section: first?.section ?? "" });
  };
  const wrap = (text: string, control: ReactNode) =>
    label ? (
      <label className="flex min-w-[9rem] flex-1 flex-col gap-1 sm:flex-none">
        <span className="text-[11.5px] font-semibold text-ink-3">{text}</span>
        {control}
      </label>
    ) : control;

  return (
    <>
      {wrap("Class", (
        <Select aria-label="Class" value={value.className} onChange={(e) => pickName(e.target.value)} className="w-full sm:w-auto sm:min-w-[9rem]">
          {allowAll && <option value="">All classes</option>}
          {names.map((n) => {
            const mine = classes.some((c) => c.name === n && c.is_class_teacher);
            return <option key={n} value={n}>{n}{mine ? " (my class)" : ""}</option>;
          })}
        </Select>
      ))}
      {wrap("Section", (
        <Select
          aria-label="Section"
          value={value.section}
          onChange={(e) => onChange({ ...value, section: e.target.value })}
          className="w-full sm:w-auto sm:min-w-[7rem]"
          disabled={!allowAll && sections.length <= 1}
        >
          {allowAll && <option value="">All sections</option>}
          {sections.map((s) => {
            const row = classes.find((c) => c.name === value.className && (c.section ?? "") === s);
            return (
              <option key={s || "none"} value={s}>
                {s || "—"}{row?._count ? ` (${row._count.students})` : ""}
              </option>
            );
          })}
        </Select>
      ))}
    </>
  );
}
