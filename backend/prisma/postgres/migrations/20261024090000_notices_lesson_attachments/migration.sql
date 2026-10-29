-- AlterTable
ALTER TABLE "lesson_plans" ADD COLUMN     "attachment_key" TEXT,
ADD COLUMN     "attachment_name" TEXT,
ADD COLUMN     "attachment_size" INTEGER;

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "class_id" TEXT,
    "student_id" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "id" TEXT NOT NULL,
    "notice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notices_branch_id_audience_created_at_idx" ON "notices"("branch_id", "audience", "created_at");

-- CreateIndex
CREATE INDEX "notices_class_id_idx" ON "notices"("class_id");

-- CreateIndex
CREATE INDEX "notices_student_id_idx" ON "notices"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "notice_reads_notice_id_user_id_key" ON "notice_reads"("notice_id", "user_id");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

