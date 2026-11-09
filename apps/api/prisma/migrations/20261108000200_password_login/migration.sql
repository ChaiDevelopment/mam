-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" VARCHAR(200),
ADD COLUMN     "password_updated_at" TIMESTAMPTZ(3);

