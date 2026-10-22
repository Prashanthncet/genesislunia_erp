/** GET /api/portal/children/:id/leaves — note: no OTP or pass code is ever returned. */
export type PortalLeaves = {
  leaves: {
    id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: string;
    remarks: string | null;
    requested_by_me: boolean;
    created_at: string;
  }[];
  gate_passes: {
    id: string;
    type: string;
    reason: string;
    out_time: string;
    expected_in_time: string | null;
    actual_out_time: string | null;
    actual_in_time: string | null;
    status: string;
    rejected_reason: string | null;
    created_at: string;
  }[];
};
