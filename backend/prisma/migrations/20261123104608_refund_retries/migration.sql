-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "last_attempt_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_error" TEXT;

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");
