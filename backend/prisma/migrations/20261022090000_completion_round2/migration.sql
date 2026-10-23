-- CreateTable
CREATE TABLE "beds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "room_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "report_card_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT,
    "academic_year" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "file_key" TEXT,
    "published_by" TEXT,
    "published_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_card_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "report_card_snapshots_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "report_card_snapshots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payroll_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "owner" TEXT,
    "detail" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
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
    "data_url" TEXT,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admission_documents_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "admission_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_admission_documents" ("admission_id", "branch_id", "created_at", "data_url", "doc_type", "file_name", "id", "size_bytes", "student_id") SELECT "admission_id", "branch_id", "created_at", "data_url", "doc_type", "file_name", "id", "size_bytes", "student_id" FROM "admission_documents";
DROP TABLE "admission_documents";
ALTER TABLE "new_admission_documents" RENAME TO "admission_documents";
CREATE INDEX "admission_documents_admission_id_idx" ON "admission_documents"("admission_id");
CREATE INDEX "admission_documents_student_id_idx" ON "admission_documents"("student_id");
CREATE TABLE "new_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "class_teacher_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "classes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "classes_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_classes" ("branch_id", "created_at", "id", "name", "section") SELECT "branch_id", "created_at", "id", "name", "section" FROM "classes";
DROP TABLE "classes";
ALTER TABLE "new_classes" RENAME TO "classes";
CREATE TABLE "new_hostel_allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "bed_label" TEXT,
    "bed_id" TEXT,
    "allocated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hostel_allocations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hostel_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hostel_allocations_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_hostel_allocations" ("allocated_at", "bed_label", "id", "room_id", "student_id") SELECT "allocated_at", "bed_label", "id", "room_id", "student_id" FROM "hostel_allocations";
DROP TABLE "hostel_allocations";
ALTER TABLE "new_hostel_allocations" RENAME TO "hostel_allocations";
CREATE UNIQUE INDEX "hostel_allocations_student_id_key" ON "hostel_allocations"("student_id");
CREATE UNIQUE INDEX "hostel_allocations_bed_id_key" ON "hostel_allocations"("bed_id");
CREATE INDEX "hostel_allocations_room_id_idx" ON "hostel_allocations"("room_id");
CREATE UNIQUE INDEX "hostel_allocations_room_id_bed_label_key" ON "hostel_allocations"("room_id", "bed_label");
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
    "professional_tax" REAL NOT NULL DEFAULT 0,
    "net_salary" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "unpaid_days" REAL NOT NULL DEFAULT 0,
    "paid_at" DATETIME,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payslips_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_payslips" ("basic_salary", "branch_id", "da", "epf_deduction", "generated_at", "gross_salary", "hra", "id", "month_year", "net_salary", "other_deductions", "paid_at", "staff_id", "status", "tds_deduction", "unpaid_days") SELECT "basic_salary", "branch_id", "da", "epf_deduction", "generated_at", "gross_salary", "hra", "id", "month_year", "net_salary", "other_deductions", "paid_at", "staff_id", "status", "tds_deduction", "unpaid_days" FROM "payslips";
DROP TABLE "payslips";
ALTER TABLE "new_payslips" RENAME TO "payslips";
CREATE INDEX "payslips_branch_id_month_year_status_idx" ON "payslips"("branch_id", "month_year", "status");
CREATE INDEX "payslips_status_idx" ON "payslips"("status");
CREATE UNIQUE INDEX "payslips_staff_id_month_year_key" ON "payslips"("staff_id", "month_year");
CREATE TABLE "new_salary_structures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staff_id" TEXT NOT NULL,
    "basic_salary" REAL NOT NULL,
    "hra" REAL NOT NULL DEFAULT 0,
    "da" REAL NOT NULL DEFAULT 0,
    "tds_percent" REAL NOT NULL DEFAULT 0,
    "epf_percent" REAL NOT NULL DEFAULT 12,
    "tax_mode" TEXT NOT NULL DEFAULT 'slab',
    "tax_regime" TEXT NOT NULL DEFAULT 'new',
    "annual_deductions" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "salary_structures_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_salary_structures" ("basic_salary", "da", "epf_percent", "hra", "id", "staff_id", "tds_percent") SELECT "basic_salary", "da", "epf_percent", "hra", "id", "staff_id", "tds_percent" FROM "salary_structures";
DROP TABLE "salary_structures";
ALTER TABLE "new_salary_structures" RENAME TO "salary_structures";
CREATE UNIQUE INDEX "salary_structures_staff_id_key" ON "salary_structures"("staff_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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


-- Backfill: one bed per capacity slot for every existing room (B1..Bn).
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500)
INSERT INTO "beds" ("id", "room_id", "label", "is_active")
SELECT lower(hex(randomblob(16))), r."id", 'B' || n.i, 1 FROM "rooms" r JOIN n ON n.i <= r."capacity";

-- Link existing allocations to the bed with the same label.
UPDATE "hostel_allocations"
SET "bed_id" = (SELECT b."id" FROM "beds" b WHERE b."room_id" = "hostel_allocations"."room_id" AND b."label" = "hostel_allocations"."bed_label")
WHERE "bed_label" IS NOT NULL;

-- Allocations made before beds existed: give each the next free bed in its room, oldest first.
WITH ranked_alloc AS (
  SELECT "id", "room_id", ROW_NUMBER() OVER (PARTITION BY "room_id" ORDER BY "allocated_at", "id") AS rn
  FROM "hostel_allocations" WHERE "bed_id" IS NULL
), free_beds AS (
  SELECT b."id", b."room_id", b."label", ROW_NUMBER() OVER (PARTITION BY b."room_id" ORDER BY CAST(substr(b."label", 2) AS INTEGER)) AS rn
  FROM "beds" b WHERE NOT EXISTS (SELECT 1 FROM "hostel_allocations" a WHERE a."bed_id" = b."id")
)
UPDATE "hostel_allocations"
SET "bed_id" = fb."id", "bed_label" = fb."label"
FROM ranked_alloc ra JOIN free_beds fb ON fb."room_id" = ra."room_id" AND fb.rn = ra.rn
WHERE "hostel_allocations"."id" = ra."id";
