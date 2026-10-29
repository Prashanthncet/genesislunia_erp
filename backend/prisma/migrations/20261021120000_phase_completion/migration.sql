-- AlterTable
ALTER TABLE "branches" ADD COLUMN "code" TEXT;

-- AlterTable
ALTER TABLE "cbt_tests" ADD COLUMN "published_at" DATETIME;

-- AlterTable
ALTER TABLE "gate_passes" ADD COLUMN "actual_out_time" TEXT;
ALTER TABLE "gate_passes" ADD COLUMN "checked_in_by" TEXT;
ALTER TABLE "gate_passes" ADD COLUMN "checked_out_by" TEXT;
ALTER TABLE "gate_passes" ADD COLUMN "pass_code" TEXT;
ALTER TABLE "gate_passes" ADD COLUMN "rejected_reason" TEXT;

-- AlterTable
ALTER TABLE "hostel_allocations" ADD COLUMN "bed_label" TEXT;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN "department" TEXT;
ALTER TABLE "staff" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "staff_leaves" ADD COLUMN "remarks" TEXT;

-- AlterTable
ALTER TABLE "student_leaves" ADD COLUMN "remarks" TEXT;
ALTER TABLE "student_leaves" ADD COLUMN "requested_by" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN "admission_id" TEXT;
ALTER TABLE "students" ADD COLUMN "dob" TEXT;

-- CreateTable
CREATE TABLE "parent_students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'Parent',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parent_students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "parent_students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "parent_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admission_steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "admission_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "remarks" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_steps_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admission_steps_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gateway" TEXT NOT NULL,
    "gateway_order_id" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" DATETIME,
    CONSTRAINT "payment_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "min_percent" REAL NOT NULL,
    "grade_point" REAL,
    "remark" TEXT,
    CONSTRAINT "grade_bands_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hostel_roll_calls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "hostel_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hostel_roll_calls_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hostel_roll_calls_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_admission_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "admission_id" TEXT,
    "student_id" TEXT,
    "doc_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admission_documents_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "admission_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_admission_documents" ("admission_id", "branch_id", "created_at", "data_url", "doc_type", "file_name", "id", "size_bytes") SELECT "admission_id", "branch_id", "created_at", "data_url", "doc_type", "file_name", "id", "size_bytes" FROM "admission_documents";
DROP TABLE "admission_documents";
ALTER TABLE "new_admission_documents" RENAME TO "admission_documents";
CREATE INDEX "admission_documents_admission_id_idx" ON "admission_documents"("admission_id");
CREATE INDEX "admission_documents_student_id_idx" ON "admission_documents"("student_id");
CREATE TABLE "new_admission_fields" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "reviewed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_fields_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_admission_fields" ("branch_id", "created_at", "field_type", "id", "is_required", "label", "status", "validation_rule") SELECT "branch_id", "created_at", "field_type", "id", "is_required", "label", "status", "validation_rule" FROM "admission_fields";
DROP TABLE "admission_fields";
ALTER TABLE "new_admission_fields" RENAME TO "admission_fields";
CREATE INDEX "admission_fields_branch_id_academic_year_status_idx" ON "admission_fields"("branch_id", "academic_year", "status");
CREATE TABLE "new_admissions" (
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
    "dynamic_data" TEXT,
    "class_id" TEXT,
    "token" TEXT,
    "academic_year" TEXT,
    "parent_user_id" TEXT,
    "link_expires_at" DATETIME,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "last_reminder_at" DATETIME,
    "submitted_at" DATETIME,
    "fee_amount" REAL,
    "payment_ref" TEXT,
    "paid_at" DATETIME,
    "receipt_no" TEXT,
    "receipt_doc_id" TEXT,
    "signed_by" TEXT,
    "signature_name" TEXT,
    "signed_at" DATETIME,
    "student_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_admissions" ("branch_id", "class_id", "created_at", "dob", "documents_url", "dynamic_data", "house", "id", "login_id", "parent_contact", "parent_email", "parent_name", "payment_status", "remarks", "roll_no", "status", "student_name", "token", "updated_at") SELECT "branch_id", "class_id", "created_at", "dob", "documents_url", "dynamic_data", "house", "id", "login_id", "parent_contact", "parent_email", "parent_name", "payment_status", "remarks", "roll_no", "status", "student_name", "token", "updated_at" FROM "admissions";
DROP TABLE "admissions";
ALTER TABLE "new_admissions" RENAME TO "admissions";
CREATE UNIQUE INDEX "admissions_token_key" ON "admissions"("token");
CREATE INDEX "admissions_branch_id_status_idx" ON "admissions"("branch_id", "status");
CREATE TABLE "new_cbt_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "score" REAL,
    "maxScore" REAL,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "grades" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    CONSTRAINT "cbt_attempts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cbt_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cbt_attempts_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "cbt_tests" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_cbt_attempts" ("answers", "branch_id", "id", "maxScore", "score", "student_id", "submitted_at", "test_id") SELECT "answers", "branch_id", "id", "maxScore", "score", "student_id", "submitted_at", "test_id" FROM "cbt_attempts";
DROP TABLE "cbt_attempts";
ALTER TABLE "new_cbt_attempts" RENAME TO "cbt_attempts";
CREATE INDEX "cbt_attempts_test_id_submitted_at_idx" ON "cbt_attempts"("test_id", "submitted_at");
CREATE UNIQUE INDEX "cbt_attempts_test_id_student_id_key" ON "cbt_attempts"("test_id", "student_id");
CREATE TABLE "new_exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "class_id" TEXT,
    "term" TEXT,
    "academic_year" TEXT,
    "weight" REAL NOT NULL DEFAULT 1,
    "max_marks" REAL NOT NULL DEFAULT 100,
    CONSTRAINT "exams_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exams_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_exams" ("branch_id", "class_id", "date", "id", "name") SELECT "branch_id", "class_id", "date", "id", "name" FROM "exams";
DROP TABLE "exams";
ALTER TABLE "new_exams" RENAME TO "exams";
CREATE TABLE "new_incidents" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "escalated_at" DATETIME,
    "escalated_by" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incidents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_incidents" ("action_taken", "branch_id", "confidential_notes", "created_at", "demerits", "description", "id", "incident_date", "reported_by", "status", "student_id") SELECT "action_taken", "branch_id", "confidential_notes", "created_at", "demerits", "description", "id", "incident_date", "reported_by", "status", "student_id" FROM "incidents";
DROP TABLE "incidents";
ALTER TABLE "new_incidents" RENAME TO "incidents";
CREATE INDEX "incidents_branch_id_status_idx" ON "incidents"("branch_id", "status");
CREATE INDEX "incidents_branch_id_incident_date_idx" ON "incidents"("branch_id", "incident_date");
CREATE INDEX "incidents_student_id_idx" ON "incidents"("student_id");
CREATE TABLE "new_payslips" (
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
    "unpaid_days" REAL NOT NULL DEFAULT 0,
    "paid_at" DATETIME,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payslips_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_payslips" ("basic_salary", "branch_id", "da", "epf_deduction", "generated_at", "gross_salary", "hra", "id", "month_year", "net_salary", "other_deductions", "staff_id", "status", "tds_deduction") SELECT "basic_salary", "branch_id", "da", "epf_deduction", "generated_at", "gross_salary", "hra", "id", "month_year", "net_salary", "other_deductions", "staff_id", "status", "tds_deduction" FROM "payslips";
DROP TABLE "payslips";
ALTER TABLE "new_payslips" RENAME TO "payslips";
CREATE INDEX "payslips_branch_id_month_year_status_idx" ON "payslips"("branch_id", "month_year", "status");
CREATE INDEX "payslips_status_idx" ON "payslips"("status");
CREATE UNIQUE INDEX "payslips_staff_id_month_year_key" ON "payslips"("staff_id", "month_year");
CREATE TABLE "new_substitutions" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "substitutions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "substitutions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "substitutions_original_teacher_id_fkey" FOREIGN KEY ("original_teacher_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "substitutions_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "substitutions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "academic_rooms" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_substitutions" ("branch_id", "class_id", "created_at", "created_by", "date", "id", "original_teacher_id", "period_number", "reason", "room_id", "substitute_teacher_id") SELECT "branch_id", "class_id", "created_at", "created_by", "date", "id", "original_teacher_id", "period_number", "reason", "room_id", "substitute_teacher_id" FROM "substitutions";
DROP TABLE "substitutions";
ALTER TABLE "new_substitutions" RENAME TO "substitutions";
CREATE INDEX "substitutions_date_idx" ON "substitutions"("date");
CREATE UNIQUE INDEX "substitutions_date_class_id_period_number_key" ON "substitutions"("date", "class_id", "period_number");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "staff_id" TEXT,
    "student_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "users_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("branch_id", "created_at", "email", "id", "password", "role", "staff_id") SELECT "branch_id", "created_at", "email", "id", "password", "role", "staff_id" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_staff_id_key" ON "users"("staff_id");
CREATE UNIQUE INDEX "users_student_id_key" ON "users"("student_id");
CREATE INDEX "users_branch_id_role_idx" ON "users"("branch_id", "role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_pass_code_key" ON "gate_passes"("pass_code");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allocations_room_id_bed_label_key" ON "hostel_allocations"("room_id", "bed_label");

-- CreateIndex
CREATE UNIQUE INDEX "students_admission_id_key" ON "students"("admission_id");

