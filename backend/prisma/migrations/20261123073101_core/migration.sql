-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocType" AS ENUM ('PAN', 'AADHAAR', 'GST_CERTIFICATE', 'LAND_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('BOOKING', 'EXTENSION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "exit_grace_minutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "pan_number" TEXT,
    "gstin" TEXT,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "upi_id" TEXT,
    "bank_account_ref" TEXT,
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "kyc_rejection_reason" TEXT,
    "kyc_submitted_at" TIMESTAMPTZ(3),
    "kyc_reviewed_at" TIMESTAMPTZ(3),
    "commission_pct" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_kyc_documents" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "doc_type" "KycDocType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_locations" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "cancellation_policy_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "pincode" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is_24x7" BOOLEAN NOT NULL DEFAULT false,
    "opening_hours" JSONB,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_advance_days" INTEGER NOT NULL DEFAULT 30,
    "status" "LocationStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "is_event" BOOLEAN NOT NULL DEFAULT false,
    "event_name" TEXT,
    "event_start_at" TIMESTAMPTZ(3),
    "event_end_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parking_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_photos" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_capacity" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "total_slots" INTEGER NOT NULL,
    "online_slots" INTEGER NOT NULL,
    "overstay_per_hour_paise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "location_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "plan_type" "PlanType" NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_blocks" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "slots" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capacity_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "plan_type" "PlanType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amount_paise" INTEGER NOT NULL,
    "commission_paise" INTEGER NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(3),
    "idempotency_key" TEXT NOT NULL,
    "extended_from_id" UUID,
    "cancellation_rules" JSONB NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "reminder_sent_at" TIMESTAMPTZ(3),
    "expiry_notice_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_sessions" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "booking_id" UUID,
    "vehicle_id" UUID,
    "vehicle_type_id" UUID NOT NULL,
    "plate_number" TEXT NOT NULL,
    "is_walk_in" BOOLEAN NOT NULL DEFAULT false,
    "entry_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exit_at" TIMESTAMPTZ(3),
    "overstay_minutes" INTEGER NOT NULL DEFAULT 0,
    "overstay_amount_paise" INTEGER NOT NULL DEFAULT 0,
    "walk_in_amount_paise" INTEGER NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod",
    "entered_by_id" UUID NOT NULL,
    "exited_by_id" UUID,

    CONSTRAINT "parking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'BOOKING',
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "provider_refund_id" TEXT,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "period_from" TIMESTAMPTZ(3) NOT NULL,
    "period_to" TIMESTAMPTZ(3) NOT NULL,
    "gross_paise" INTEGER NOT NULL,
    "commission_paise" INTEGER NOT NULL,
    "refund_paise" INTEGER NOT NULL DEFAULT 0,
    "net_paise" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "raised_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "refund_paise" INTEGER NOT NULL DEFAULT 0,
    "admin_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_user_id_key" ON "owners"("user_id");

-- CreateIndex
CREATE INDEX "owners_kyc_status_idx" ON "owners"("kyc_status");

-- CreateIndex
CREATE INDEX "owner_kyc_documents_owner_id_idx" ON "owner_kyc_documents"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "parking_locations_slug_key" ON "parking_locations"("slug");

-- CreateIndex
CREATE INDEX "parking_locations_owner_id_idx" ON "parking_locations"("owner_id");

-- CreateIndex
CREATE INDEX "parking_locations_status_city_idx" ON "parking_locations"("status", "city");

-- CreateIndex
CREATE INDEX "location_photos_location_id_idx" ON "location_photos"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_capacity_location_id_vehicle_type_id_key" ON "location_capacity"("location_id", "vehicle_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_plans_location_id_vehicle_type_id_plan_type_key" ON "pricing_plans"("location_id", "vehicle_type_id", "plan_type");

-- CreateIndex
CREATE INDEX "capacity_blocks_location_id_vehicle_type_id_start_at_end_at_idx" ON "capacity_blocks"("location_id", "vehicle_type_id", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE INDEX "bookings_location_id_vehicle_type_id_start_at_end_at_idx" ON "bookings"("location_id", "vehicle_type_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "bookings_user_id_status_idx" ON "bookings"("user_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_user_id_idempotency_key_key" ON "bookings"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "parking_sessions_location_id_exit_at_idx" ON "parking_sessions"("location_id", "exit_at");

-- CreateIndex
CREATE INDEX "parking_sessions_booking_id_idx" ON "parking_sessions"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

-- CreateIndex
CREATE INDEX "payouts_owner_id_idx" ON "payouts"("owner_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_kyc_documents" ADD CONSTRAINT "owner_kyc_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_locations" ADD CONSTRAINT "parking_locations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_locations" ADD CONSTRAINT "parking_locations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_locations" ADD CONSTRAINT "parking_locations_cancellation_policy_id_fkey" FOREIGN KEY ("cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_photos" ADD CONSTRAINT "location_photos_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_capacity" ADD CONSTRAINT "location_capacity_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_capacity" ADD CONSTRAINT "location_capacity_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_blocks" ADD CONSTRAINT "capacity_blocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_blocks" ADD CONSTRAINT "capacity_blocks_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_extended_from_id_fkey" FOREIGN KEY ("extended_from_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "parking_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Raw SQL Prisma can't express ----------
-- Geo search: ST_DWithin on this expression uses the GIST index.
CREATE INDEX "parking_locations_geo_idx" ON "parking_locations"
  USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography));
-- Fuzzy text search (pg_trgm)
CREATE INDEX "parking_locations_name_trgm_idx" ON "parking_locations" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "parking_locations_address_trgm_idx" ON "parking_locations" USING GIN ("address" gin_trgm_ops);

ALTER TABLE "location_capacity" ADD CONSTRAINT "location_capacity_slots_check"
  CHECK ("online_slots" >= 0 AND "online_slots" <= "total_slots");
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_price_check" CHECK ("price_paise" > 0);
ALTER TABLE "capacity_blocks" ADD CONSTRAINT "capacity_blocks_range_check" CHECK ("end_at" > "start_at" AND "slots" > 0);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_range_check" CHECK ("end_at" > "start_at");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amount_check" CHECK ("amount_paise" > 0 AND "commission_paise" >= 0);

-- One vehicle can be inside a place only once at a time.
CREATE UNIQUE INDEX "parking_sessions_open_plate_key" ON "parking_sessions"("location_id", "plate_number") WHERE "exit_at" IS NULL;
-- Bookings that hold capacity (PDF partial index)
CREATE INDEX "bookings_holding_idx" ON "bookings"("location_id", "vehicle_type_id", "start_at", "end_at")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE');
