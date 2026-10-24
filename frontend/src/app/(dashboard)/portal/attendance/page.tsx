"use client";

import { Card, CardHead, PageHeader } from "@/components/ui";
import { PortalPage, classLabel, type PortalChild } from "@/components/portal/PortalContext";
import { StudentCalendar } from "@/components/attendance/StudentCalendar";

/**
 * Parent / student attendance: the same calendar, counts, OD reasons and legend the
 * school sees, from the same endpoint — so the % here always matches the school's.
 */
function ChildAttendance({ child }: { child: PortalChild }) {
  return (
    <Card>
      <CardHead icon="calendar" title={child.full_name} subtitle={classLabel(child.class) || undefined} />
      <div className="p-3 sm:p-5">
        <StudentCalendar studentId={child.id} showName={false} />
      </div>
    </Card>
  );
}

export default function PortalAttendancePage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="attendance" title="Attendance" subtitle="Day-by-day attendance, month by month. OD (on duty) counts as present; approved leave is not counted." />
      <PortalPage>{(child) => <ChildAttendance key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
