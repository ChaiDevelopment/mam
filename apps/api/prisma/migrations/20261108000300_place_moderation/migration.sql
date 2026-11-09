-- AlterEnum

ALTER TYPE "NotificationType" ADD VALUE 'PLACE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PLACE_REJECTED';

-- AlterEnum

ALTER TYPE "RestaurantStatus" ADD VALUE 'PENDING';
ALTER TYPE "RestaurantStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "moderation_note" VARCHAR(500),
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by" UUID;

-- CreateIndex
CREATE INDEX "restaurants_status_created_at_idx" ON "restaurants"("status", "created_at");
