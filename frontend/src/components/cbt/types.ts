export type Question = {
  id: string; question: string; type: "mcq" | "subjective" | string; marks: number;
  optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  correctOption?: string | null; subjectId?: string | null; classId?: string | null;
};

export type CbtTest = {
  id: string; title: string; classId: string; subjectId: string | null; durationMin: number; status: string;
  startsAt: string | null; publishedAt: string | null; question_count: number;
  attempts: { in_progress: number; submitted: number; graded: number };
};

export type Subject = { id: string; name: string };
export type ClassItem = { id: string; name: string; section: string | null };

export type AttemptView = {
  attempt_id: string; test_id: string; title: string; duration_min: number; status: string;
  started_at: string; submitted_at: string | null; deadline: string; server_now: string; remaining_seconds: number;
  auto_submitted: boolean; questions: Question[]; answers: Record<string, string>;
};

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Request failed");
export const classLabel = (c?: ClassItem) => (c ? `${c.name}${c.section ? ` ${c.section}` : ""}` : "");
export const OPTION_KEYS = [["A", "optionA"], ["B", "optionB"], ["C", "optionC"], ["D", "optionD"]] as const;
