-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "class_teacher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "admission_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "dob" TEXT,
    "father_name" TEXT,
    "mother_name" TEXT,
    "mobile_number" TEXT,
    "email" TEXT,
    "gender" TEXT,
    "blood_group" TEXT,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "vision" TEXT,
    "class_id" TEXT,
    "roll_no" TEXT,
    "house" TEXT,
    "enrollment_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "admission_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Teacher',
    "department" TEXT,
    "phone" TEXT,
    "subjects" TEXT,
    "max_periods_per_day" INTEGER NOT NULL DEFAULT 6,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "staff_id" TEXT,
    "student_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_fields" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "validation_rule" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "academic_year" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "review_remarks" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_name" TEXT,
    "dob" TEXT,
    "parent_name" TEXT,
    "parent_contact" TEXT,
    "parent_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending Approval',
    "roll_no" TEXT,
    "house" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'Pending',
    "documents_url" TEXT,
    "remarks" TEXT,
    "login_id" TEXT,
    "dynamic_data" TEXT,
    "class_id" TEXT,
    "token" TEXT,
    "academic_year" TEXT,
    "parent_user_id" TEXT,
    "link_expires_at" TIMESTAMP(3),
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "last_reminder_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "fee_amount" DOUBLE PRECISION,
    "payment_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "receipt_no" TEXT,
    "receipt_doc_id" TEXT,
    "signed_by" TEXT,
    "signature_name" TEXT,
    "signed_at" TIMESTAMP(3),
    "student_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" TEXT,
    "notified" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "class_id" TEXT,
    "term" TEXT,
    "academic_year" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "max_marks" DOUBLE PRECISION NOT NULL DEFAULT 100,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_marks" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "max_score" DOUBLE PRECISION NOT NULL DEFAULT 100,

    CONSTRAINT "exam_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "room_id" TEXT,

    CONSTRAINT "timetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitutions" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "original_teacher_id" TEXT,
    "substitute_teacher_id" TEXT NOT NULL,
    "room_id" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Assigned',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_leaves" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approved_by" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syllabus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "syllabus_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostels" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "warden_id" TEXT,

    CONSTRAINT "hostels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "hostel_id" TEXT NOT NULL,
    "room_number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_allocations" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "bed_label" TEXT,
    "bed_id" TEXT,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "out_time" TEXT NOT NULL,
    "expected_in_time" TEXT,
    "actual_in_time" TEXT,
    "actual_out_time" TEXT,
    "checked_out_by" TEXT,
    "checked_in_by" TEXT,
    "rejected_reason" TEXT,
    "pass_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approved_by_warden" TEXT,
    "approved_by_principal" TEXT,
    "parent_otp" TEXT,
    "otp_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "reported_by" TEXT,
    "incident_date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "demerits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "severity" TEXT NOT NULL DEFAULT 'Low',
    "confidential_notes" TEXT,
    "assigned_to" TEXT,
    "escalated_at" TIMESTAMP(3),
    "escalated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "fee_type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "due_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Unpaid',
    "invoice_no" TEXT,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_payments" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_paid" DOUBLE PRECISION NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "reference_no" TEXT,
    "payment_date" TEXT NOT NULL,
    "collected_by" TEXT,
    "receipt_no" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "basic_salary" DOUBLE PRECISION NOT NULL,
    "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "da" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epf_percent" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "tax_mode" TEXT NOT NULL DEFAULT 'slab',
    "tax_regime" TEXT NOT NULL DEFAULT 'new',
    "annual_deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "month_year" TEXT NOT NULL,
    "basic_salary" DOUBLE PRECISION NOT NULL,
    "hra" DOUBLE PRECISION NOT NULL,
    "da" DOUBLE PRECISION NOT NULL,
    "gross_salary" DOUBLE PRECISION NOT NULL,
    "tds_deduction" DOUBLE PRECISION NOT NULL,
    "epf_deduction" DOUBLE PRECISION NOT NULL,
    "other_deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "professional_tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net_salary" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "unpaid_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_rooms" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,

    CONSTRAINT "academic_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_configs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "break_name" TEXT,

    CONSTRAINT "period_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "room_id" TEXT,
    "invigilator_id" TEXT,
    "subject" TEXT NOT NULL,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "retry_after" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_documents" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "admission_id" TEXT,
    "student_id" TEXT,
    "doc_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "data_url" TEXT,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_logs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "hostel_id" TEXT,
    "visitor_name" TEXT NOT NULL,
    "visitor_phone" TEXT,
    "whom_to_meet" TEXT NOT NULL,
    "purpose" TEXT,
    "in_time" TEXT NOT NULL,
    "out_time" TEXT,
    "pass_no" TEXT,

    CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_leaves" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approved_by" TEXT,
    "requested_by" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cbt_questions" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "class_id" TEXT,
    "question" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'mcq',
    "optionA" TEXT,
    "optionB" TEXT,
    "optionC" TEXT,
    "optionD" TEXT,
    "correct_option" TEXT,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "cbt_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cbt_tests" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "starts_at" TEXT,
    "published_at" TIMESTAMP(3),
    "question_ids" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cbt_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cbt_attempts" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "grades" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),

    CONSTRAINT "cbt_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_students" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'Parent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_steps" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "admission_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gateway" TEXT NOT NULL,
    "gateway_order_id" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "min_percent" DOUBLE PRECISION NOT NULL,
    "grade_point" DOUBLE PRECISION,
    "remark" TEXT,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_roll_calls" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "hostel_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_roll_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beds" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_card_snapshots" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT,
    "academic_year" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "file_key" TEXT,
    "published_by" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_configs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "owner" TEXT,
    "detail" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "students_admission_id_key" ON "students"("admission_id");

-- CreateIndex
CREATE INDEX "students_branch_id_status_idx" ON "students"("branch_id", "status");

-- CreateIndex
CREATE INDEX "students_class_id_idx" ON "students"("class_id");

-- CreateIndex
CREATE INDEX "students_branch_id_full_name_idx" ON "students"("branch_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_branch_id_admission_no_key" ON "students"("branch_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "staff_branch_id_email_key" ON "staff"("branch_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_staff_id_key" ON "users"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_id_key" ON "users"("student_id");

-- CreateIndex
CREATE INDEX "users_branch_id_role_idx" ON "users"("branch_id", "role");

-- CreateIndex
CREATE INDEX "admission_fields_branch_id_academic_year_status_idx" ON "admission_fields"("branch_id", "academic_year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_token_key" ON "admissions"("token");

-- CreateIndex
CREATE INDEX "admissions_branch_id_status_idx" ON "admissions"("branch_id", "status");

-- CreateIndex
CREATE INDEX "attendance_branch_id_class_id_date_idx" ON "attendance"("branch_id", "class_id", "date");

-- CreateIndex
CREATE INDEX "attendance_branch_id_date_status_idx" ON "attendance"("branch_id", "date", "status");

-- CreateIndex
CREATE INDEX "attendance_class_id_date_idx" ON "attendance"("class_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_student_id_date_key" ON "attendance"("student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_branch_id_code_key" ON "subjects"("branch_id", "code");

-- CreateIndex
CREATE INDEX "exam_marks_exam_id_student_id_idx" ON "exam_marks"("exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_marks_exam_id_student_id_subject_id_key" ON "exam_marks"("exam_id", "student_id", "subject_id");

-- CreateIndex
CREATE INDEX "timetable_class_id_day_of_week_idx" ON "timetable"("class_id", "day_of_week");

-- CreateIndex
CREATE INDEX "timetable_teacher_id_day_of_week_period_number_idx" ON "timetable"("teacher_id", "day_of_week", "period_number");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_class_id_day_of_week_period_number_key" ON "timetable"("class_id", "day_of_week", "period_number");

-- CreateIndex
CREATE INDEX "substitutions_date_idx" ON "substitutions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "substitutions_date_class_id_period_number_key" ON "substitutions"("date", "class_id", "period_number");

-- CreateIndex
CREATE INDEX "staff_leaves_branch_id_status_idx" ON "staff_leaves"("branch_id", "status");

-- CreateIndex
CREATE INDEX "staff_leaves_staff_id_status_idx" ON "staff_leaves"("staff_id", "status");

-- CreateIndex
CREATE INDEX "syllabus_class_id_subject_id_idx" ON "syllabus"("class_id", "subject_id");

-- CreateIndex
CREATE INDEX "lesson_plans_teacher_id_date_idx" ON "lesson_plans"("teacher_id", "date");

-- CreateIndex
CREATE INDEX "assignments_class_id_due_date_idx" ON "assignments"("class_id", "due_date");

-- CreateIndex
CREATE INDEX "rooms_hostel_id_idx" ON "rooms"("hostel_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allocations_student_id_key" ON "hostel_allocations"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allocations_bed_id_key" ON "hostel_allocations"("bed_id");

-- CreateIndex
CREATE INDEX "hostel_allocations_room_id_idx" ON "hostel_allocations"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allocations_room_id_bed_label_key" ON "hostel_allocations"("room_id", "bed_label");

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_pass_code_key" ON "gate_passes"("pass_code");

-- CreateIndex
CREATE INDEX "gate_passes_branch_id_status_idx" ON "gate_passes"("branch_id", "status");

-- CreateIndex
CREATE INDEX "gate_passes_student_id_idx" ON "gate_passes"("student_id");

-- CreateIndex
CREATE INDEX "incidents_branch_id_status_idx" ON "incidents"("branch_id", "status");

-- CreateIndex
CREATE INDEX "incidents_branch_id_incident_date_idx" ON "incidents"("branch_id", "incident_date");

-- CreateIndex
CREATE INDEX "incidents_student_id_idx" ON "incidents"("student_id");

-- CreateIndex
CREATE INDEX "fee_structures_branch_id_class_id_idx" ON "fee_structures"("branch_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_invoice_no_key" ON "fee_invoices"("invoice_no");

-- CreateIndex
CREATE INDEX "fee_invoices_branch_id_status_idx" ON "fee_invoices"("branch_id", "status");

-- CreateIndex
CREATE INDEX "fee_invoices_student_id_idx" ON "fee_invoices"("student_id");

-- CreateIndex
CREATE INDEX "fee_invoices_branch_id_due_date_idx" ON "fee_invoices"("branch_id", "due_date");

-- CreateIndex
CREATE INDEX "fee_invoices_branch_id_student_id_term_idx" ON "fee_invoices"("branch_id", "student_id", "term");

-- CreateIndex
CREATE UNIQUE INDEX "offline_payments_receipt_no_key" ON "offline_payments"("receipt_no");

-- CreateIndex
CREATE INDEX "offline_payments_invoice_id_idx" ON "offline_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "offline_payments_branch_id_payment_date_idx" ON "offline_payments"("branch_id", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_staff_id_key" ON "salary_structures"("staff_id");

-- CreateIndex
CREATE INDEX "payslips_branch_id_month_year_status_idx" ON "payslips"("branch_id", "month_year", "status");

-- CreateIndex
CREATE INDEX "payslips_status_idx" ON "payslips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_staff_id_month_year_key" ON "payslips"("staff_id", "month_year");

-- CreateIndex
CREATE UNIQUE INDEX "period_configs_branch_id_period_number_key" ON "period_configs"("branch_id", "period_number");

-- CreateIndex
CREATE INDEX "notification_logs_branch_id_created_at_idx" ON "notification_logs"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_channel_idx" ON "notification_logs"("channel");

-- CreateIndex
CREATE INDEX "notification_logs_status_retry_after_idx" ON "notification_logs"("status", "retry_after");

-- CreateIndex
CREATE INDEX "admission_documents_admission_id_idx" ON "admission_documents"("admission_id");

-- CreateIndex
CREATE INDEX "admission_documents_student_id_idx" ON "admission_documents"("student_id");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_created_at_idx" ON "audit_logs"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "visitor_logs_branch_id_in_time_idx" ON "visitor_logs"("branch_id", "in_time");

-- CreateIndex
CREATE INDEX "visitor_logs_out_time_idx" ON "visitor_logs"("out_time");

-- CreateIndex
CREATE INDEX "student_leaves_branch_id_status_idx" ON "student_leaves"("branch_id", "status");

-- CreateIndex
CREATE INDEX "student_leaves_student_id_status_idx" ON "student_leaves"("student_id", "status");

-- CreateIndex
CREATE INDEX "cbt_questions_class_id_subject_id_idx" ON "cbt_questions"("class_id", "subject_id");

-- CreateIndex
CREATE INDEX "cbt_attempts_test_id_submitted_at_idx" ON "cbt_attempts"("test_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "cbt_attempts_test_id_student_id_key" ON "cbt_attempts"("test_id", "student_id");

-- CreateIndex
CREATE INDEX "parent_students_student_id_idx" ON "parent_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_students_user_id_student_id_key" ON "parent_students"("user_id", "student_id");

-- CreateIndex
CREATE INDEX "admission_steps_admission_id_created_at_idx" ON "admission_steps"("admission_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_gateway_order_id_key" ON "payment_orders"("gateway_order_id");

-- CreateIndex
CREATE INDEX "payment_orders_purpose_ref_id_idx" ON "payment_orders"("purpose", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_branch_id_grade_key" ON "grade_bands"("branch_id", "grade");

-- CreateIndex
CREATE INDEX "hostel_roll_calls_hostel_id_date_session_idx" ON "hostel_roll_calls"("hostel_id", "date", "session");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_roll_calls_student_id_date_session_key" ON "hostel_roll_calls"("student_id", "date", "session");

-- CreateIndex
CREATE UNIQUE INDEX "beds_room_id_label_key" ON "beds"("room_id", "label");

-- CreateIndex
CREATE INDEX "report_card_snapshots_branch_id_academic_year_term_idx" ON "report_card_snapshots"("branch_id", "academic_year", "term");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_snapshots_student_id_academic_year_term_key" ON "report_card_snapshots"("student_id", "academic_year", "term");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_configs_branch_id_key" ON "payroll_configs"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_name_run_key_key" ON "job_runs"("name", "run_key");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_fields" ADD CONSTRAINT "admission_fields_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_teacher_id_fkey" FOREIGN KEY ("original_teacher_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus" ADD CONSTRAINT "syllabus_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus" ADD CONSTRAINT "syllabus_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus" ADD CONSTRAINT "syllabus_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_warden_id_fkey" FOREIGN KEY ("warden_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostel_id_fkey" FOREIGN KEY ("hostel_id") REFERENCES "hostels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_payments" ADD CONSTRAINT "offline_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_payments" ADD CONSTRAINT "offline_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_payments" ADD CONSTRAINT "offline_payments_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_rooms" ADD CONSTRAINT "academic_rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_configs" ADD CONSTRAINT "period_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_invigilator_id_fkey" FOREIGN KEY ("invigilator_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_leaves" ADD CONSTRAINT "student_leaves_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_leaves" ADD CONSTRAINT "student_leaves_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_questions" ADD CONSTRAINT "cbt_questions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_tests" ADD CONSTRAINT "cbt_tests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_attempts" ADD CONSTRAINT "cbt_attempts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_attempts" ADD CONSTRAINT "cbt_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cbt_attempts" ADD CONSTRAINT "cbt_attempts_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "cbt_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_steps" ADD CONSTRAINT "admission_steps_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_steps" ADD CONSTRAINT "admission_steps_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_roll_calls" ADD CONSTRAINT "hostel_roll_calls_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_roll_calls" ADD CONSTRAINT "hostel_roll_calls_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_snapshots" ADD CONSTRAINT "report_card_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_snapshots" ADD CONSTRAINT "report_card_snapshots_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_snapshots" ADD CONSTRAINT "report_card_snapshots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_configs" ADD CONSTRAINT "payroll_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

