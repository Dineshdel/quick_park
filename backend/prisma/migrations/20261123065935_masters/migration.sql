-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_policies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_commission_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "hold_minutes" INTEGER NOT NULL DEFAULT 10,
    "entry_grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "few_left_threshold" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_code_key" ON "vehicle_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_policies_name_key" ON "cancellation_policies"("name");

-- Guarantees Prisma can't express
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_singleton" CHECK ("id" = 1);
CREATE UNIQUE INDEX "cancellation_policies_one_default" ON "cancellation_policies"("is_default") WHERE "is_default";

-- Seed data (idempotent). Admins can edit or add to all of it.
INSERT INTO "vehicle_types" ("id", "code", "name", "icon", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'CAR',   'Car',         'car',            10, now()),
  (gen_random_uuid(), 'BIKE',  'Bike',        'bike',           20, now()),
  (gen_random_uuid(), 'AUTO',  'Auto',        'caravan',        30, now()),
  (gen_random_uuid(), 'VAN',   'Van',         'bus-front',      40, now()),
  (gen_random_uuid(), 'BUS',   'Bus',         'bus',            50, now()),
  (gen_random_uuid(), 'LORRY', 'Lorry',       'truck',          60, now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "categories" ("id", "name", "icon", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'Mall',             'shopping-bag', 10, now()),
  (gen_random_uuid(), 'Office',           'building-2',   20, now()),
  (gen_random_uuid(), 'Residential',      'home',         30, now()),
  (gen_random_uuid(), 'Hospital',         'hospital',     40, now()),
  (gen_random_uuid(), 'Railway Station',  'train-front',  50, now()),
  (gen_random_uuid(), 'Airport',          'plane',        60, now()),
  (gen_random_uuid(), 'Event Venue',      'ticket',       70, now()),
  (gen_random_uuid(), 'Open Ground',      'trees',        80, now())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "cancellation_policies" ("id", "name", "description", "rules", "is_default", "updated_at") VALUES
  (gen_random_uuid(), 'Standard', 'Full refund up to 2 hours before start, no refund after that.',
   '[{"hoursBefore":2,"refundPct":100},{"hoursBefore":0,"refundPct":0}]', true, now())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "platform_settings" ("id", "updated_at") VALUES (1, now()) ON CONFLICT ("id") DO NOTHING;
