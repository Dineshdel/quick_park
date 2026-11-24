-- No-show release: hourly/daily bookings not checked in 30 min after the start free their slot.
ALTER TABLE "platform_settings" ADD COLUMN     "no_show_release_minutes" INTEGER NOT NULL DEFAULT 30;
