-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "classes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "admission_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "father_name" TEXT,
    "mother_name" TEXT,
    "mobile_number" TEXT,
    "email" TEXT,
    "gender" TEXT,
    "blood_group" TEXT,
    "height_cm" REAL,
    "weight_kg" REAL,
    "vision" TEXT,
    "class_id" TEXT,
    "roll_no" TEXT,
    "house" TEXT,
    "enrollment_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Teacher',
    "subjects" TEXT,
    "max_periods_per_day" INTEGER NOT NULL DEFAULT 6,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "staff_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admission_fields" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "validation_rule" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_fields_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "password" TEXT,
    "dynamic_data" TEXT,
    "class_id" TEXT,
    "token" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" TEXT,
    "notified" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "attendance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "subjects_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "class_id" TEXT,
    CONSTRAINT "exams_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exams_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exam_marks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "max_score" REAL NOT NULL DEFAULT 100,
    CONSTRAINT "exam_marks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exam_marks_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exam_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exam_marks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timetable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "room_id" TEXT,
    CONSTRAINT "timetable_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "timetable_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "timetable_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "timetable_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "substitutions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "original_teacher_id" TEXT,
    "substitute_teacher_id" TEXT NOT NULL,
    "room_id" TEXT,
    "reason" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "substitutions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "substitutions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "substitutions_original_teacher_id_fkey" FOREIGN KEY ("original_teacher_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "substitutions_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "substitutions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staff_leaves" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approved_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_leaves_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staff_leaves_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staff_leaves_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "syllabus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "syllabus_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "syllabus_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "syllabus_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "syllabus_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lesson_plans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_plans_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_plans_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hostels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "warden_id" TEXT,
    CONSTRAINT "hostels_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hostels_warden_id_fkey" FOREIGN KEY ("warden_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostel_id" TEXT NOT NULL,
    "room_number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    CONSTRAINT "rooms_hostel_id_fkey" FOREIGN KEY ("hostel_id") REFERENCES "hostels" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hostel_allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "allocated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hostel_allocations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hostel_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "out_time" TEXT NOT NULL,
    "expected_in_time" TEXT,
    "actual_in_time" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approved_by_warden" TEXT,
    "approved_by_principal" TEXT,
    "parent_otp" TEXT,
    "otp_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate_passes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_passes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "reported_by" TEXT,
    "incident_date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "demerits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "confidential_notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incidents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "fee_type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "fee_structures_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fee_structures_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "total_amount" REAL NOT NULL,
    "due_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Unpaid',
    "invoice_no" TEXT,
    CONSTRAINT "fee_invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fee_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "offline_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_paid" REAL NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "reference_no" TEXT,
    "payment_date" TEXT NOT NULL,
    "collected_by" TEXT,
    "receipt_no" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offline_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "offline_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "offline_payments_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staff_id" TEXT NOT NULL,
    "basic_salary" REAL NOT NULL,
    "hra" REAL NOT NULL DEFAULT 0,
    "da" REAL NOT NULL DEFAULT 0,
    "tds_percent" REAL NOT NULL DEFAULT 0,
    "epf_percent" REAL NOT NULL DEFAULT 12,
    CONSTRAINT "salary_structures_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "month_year" TEXT NOT NULL,
    "basic_salary" REAL NOT NULL,
    "hra" REAL NOT NULL,
    "da" REAL NOT NULL,
    "gross_salary" REAL NOT NULL,
    "tds_deduction" REAL NOT NULL,
    "epf_deduction" REAL NOT NULL,
    "other_deductions" REAL NOT NULL DEFAULT 0,
    "net_salary" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payslips_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "academic_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    CONSTRAINT "academic_rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "period_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "break_name" TEXT,
    CONSTRAINT "period_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "room_id" TEXT,
    "invigilator_id" TEXT,
    "subject" TEXT NOT NULL,
    CONSTRAINT "exam_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exam_schedules_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exam_schedules_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exam_schedules_invigilator_id_fkey" FOREIGN KEY ("invigilator_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admission_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "admission_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admission_documents_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visitor_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "hostel_id" TEXT,
    "visitor_name" TEXT NOT NULL,
    "visitor_phone" TEXT,
    "whom_to_meet" TEXT NOT NULL,
    "purpose" TEXT,
    "in_time" TEXT NOT NULL,
    "out_time" TEXT,
    "pass_no" TEXT,
    CONSTRAINT "visitor_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "student_leaves" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approved_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_leaves_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "student_leaves_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cbt_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "marks" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "cbt_questions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cbt_tests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "starts_at" TEXT,
    "question_ids" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cbt_tests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cbt_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "score" REAL,
    "maxScore" REAL,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cbt_attempts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cbt_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cbt_attempts_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "cbt_tests" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
CREATE INDEX "hostel_allocations_room_id_idx" ON "hostel_allocations"("room_id");

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
