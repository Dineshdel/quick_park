-- Overstay is charged after 5 free minutes (was 15). Admins can still change it in Settings.
ALTER TABLE "platform_settings" ALTER COLUMN "exit_grace_minutes" SET DEFAULT 5;
UPDATE "platform_settings" SET "exit_grace_minutes" = 5 WHERE "exit_grace_minutes" = 15;
