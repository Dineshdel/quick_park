-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "zone_id" UUID;

-- CreateTable
CREATE TABLE "parking_areas" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_zones" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_capacity" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "total_slots" INTEGER NOT NULL,
    "online_slots" INTEGER NOT NULL,

    CONSTRAINT "zone_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parking_areas_location_id_idx" ON "parking_areas"("location_id");

-- CreateIndex
CREATE INDEX "parking_zones_location_id_idx" ON "parking_zones"("location_id");

-- CreateIndex
CREATE INDEX "parking_zones_area_id_idx" ON "parking_zones"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "zone_capacity_zone_id_vehicle_type_id_key" ON "zone_capacity"("zone_id", "vehicle_type_id");

-- CreateIndex
CREATE INDEX "bookings_zone_id_start_at_end_at_idx" ON "bookings"("zone_id", "start_at", "end_at");

-- AddForeignKey
ALTER TABLE "parking_areas" ADD CONSTRAINT "parking_areas_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "parking_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_capacity" ADD CONSTRAINT "zone_capacity_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "parking_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_capacity" ADD CONSTRAINT "zone_capacity_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "parking_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Campus parking: one place (the institute) with sub-places (Tech Park, APJ block, stadium…).
INSERT INTO "categories" ("id", "name", "icon", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'College / Institute', 'graduation-cap', 25, now())
ON CONFLICT ("name") DO NOTHING;
