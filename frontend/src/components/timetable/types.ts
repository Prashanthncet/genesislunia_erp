/** Shapes returned by /api/timetable endpoints used by the timetable screens. */

export type TtClass = { id: string; name: string; section: string | null };
export type TtTeacher = { id: string; name: string; email: string | null; subjects: string | null; isActive: boolean; maxPeriodsPerDay: number };
export type TtPeriod = { id: string; periodNumber: number; startTime: string; endTime: string; isBreak: boolean; breakName: string | null };

export type MyDayEntry = {
  period_number: number;
  start_time: string | null;
  end_time: string | null;
  kind: "lesson" | "cover" | "relieved" | "break" | "free";
  subject: string | null;
  class_id: string | null;
  class_name: string | null;
  room_name: string | null;
  note: string | null;
  substitution_id: string | null;
};
export type MyDay = {
  date: string;
  day: string;
  staff: { id: string; name: string; max_periods: number } | null;
  schedule: MyDayEntry[];
  counts: { lessons: number; covers: number; relieved: number };
};

export type TeacherWeekResponse = {
  teacher: { id: string; name: string; max_periods: number; subjects: string | null };
  week: { from: string; to: string; dates: string[] };
  slots: { day_of_week: string; period_number: number; subject: string; class_id: string; class_name: string; room_name: string | null }[];
  covers: { id: string; date: string; day_of_week: string; period_number: number; class_id: string; class_name: string; subject: string | null; original_teacher_name: string | null; reason: string | null }[];
  handed_over: { id: string; date: string; day_of_week: string; period_number: number; class_id: string; class_name: string; status: string; substitute_name: string | null }[];
};

export type SubstitutionRow = {
  id: string;
  date: string;
  class_id: string;
  class_name: string;
  period_number: number;
  original_teacher_id: string | null;
  original_teacher_name: string | null;
  substitute_teacher_id: string | null;
  substitute_name: string | null;
  reason: string | null;
  status: "Requested" | "Assigned" | "Cancelled" | string;
};

export type CoverCandidate = {
  id: string;
  name: string;
  max_periods: number;
  load: number;
  over_limit: boolean;
  available: boolean;
  conflicts: string[];
};
export type SuggestResponse = {
  date: string;
  class_id: string;
  period_number: number;
  lesson: { subject: string; teacher_id: string; teacher_name: string } | null;
  candidates: CoverCandidate[];
};

export const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
