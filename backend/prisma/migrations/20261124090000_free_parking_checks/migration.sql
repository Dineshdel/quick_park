-- Free parking: plans and bookings may be ₹0 (paid places are still checked to be at least ₹1 by the API).
ALTER TABLE "pricing_plans" DROP CONSTRAINT "pricing_plans_price_check";
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_price_check" CHECK ("price_paise" >= 0);
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_amount_check";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amount_check" CHECK ("amount_paise" >= 0 AND "commission_paise" >= 0);
