-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_notification_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "retry_after" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_notification_logs" ("body", "branch_id", "channel", "created_at", "id", "recipient", "ref_id", "ref_type", "status", "subject") SELECT "body", "branch_id", "channel", "created_at", "id", "recipient", "ref_id", "ref_type", "status", "subject" FROM "notification_logs";
DROP TABLE "notification_logs";
ALTER TABLE "new_notification_logs" RENAME TO "notification_logs";
CREATE INDEX "notification_logs_branch_id_created_at_idx" ON "notification_logs"("branch_id", "created_at");
CREATE INDEX "notification_logs_channel_idx" ON "notification_logs"("channel");
CREATE INDEX "notification_logs_status_retry_after_idx" ON "notification_logs"("status", "retry_after");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

