-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "slot_id" UUID;

-- CreateTable
CREATE TABLE "parking_slots" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parking_slots_location_id_idx" ON "parking_slots"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "parking_slots_zone_id_label_key" ON "parking_slots"("zone_id", "label");

-- CreateIndex
CREATE INDEX "bookings_slot_id_start_at_end_at_idx" ON "bookings"("slot_id", "start_at", "end_at");

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "parking_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "parking_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
