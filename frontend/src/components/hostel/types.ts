export type StudentLite = { id: string; fullName: string; admissionNo: string; class?: { name: string; section: string | null } | null };

export type Hostel = {
  id: string; name: string; capacity: number; planned_capacity: number; occupied: number; free: number;
  warden: { id: string; name: string } | null;
  rooms: Array<{ id: string; roomNumber: string; capacity: number; _count: { allocations: number } }>;
};

/** One row of the Bed table: `is_active: false` = out of service (e.g. broken). */
export type Bed = { id: string; label: string; is_active: boolean; allocation_id: string | null; student: StudentLite | null };

export type Room = {
  id: string; hostelId: string; roomNumber: string; capacity: number; occupied: number; free: number;
  out_of_service: number; hostel: { id: string; name: string }; beds: Bed[];
  unassigned?: Array<{ allocation_id: string; student: StudentLite }>;
};

export type RosterRow = {
  student_id: string; student: StudentLite; room: string; bed: string | null;
  status: "Present" | "Absent" | "On Leave"; saved: boolean; leave_reason: string | null;
  marked_by_name?: string | null; marked_at?: string | null;
};

export type Visitor = {
  id: string; hostelId: string | null; hostelName: string | null; visitorName: string; visitorPhone: string | null;
  whomToMeet: string; purpose: string | null; visitorPhoto?: string | null; inTime: string; outTime: string | null; passNo: string;
};

export const classLabel = (s?: StudentLite | null) => (s?.class ? `${s.class.name}${s.class.section ? ` ${s.class.section}` : ""}` : "");
