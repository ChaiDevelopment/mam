-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "brand" VARCHAR(120),
ADD COLUMN     "brand_wikidata" VARCHAR(20);

-- CreateTable
CREATE TABLE "brands" (
    "wikidata" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" VARCHAR(300),
    "website" VARCHAR(300),
    "category" VARCHAR(40),
    "logo_url" VARCHAR(600),
    "logo_thumb_url" VARCHAR(600),
    "logo_license" VARCHAR(80),
    "logo_license_url" VARCHAR(300),
    "logo_author" VARCHAR(300),
    "logo_source_url" VARCHAR(600),
    "image_url" VARCHAR(600),
    "image_thumb_url" VARCHAR(600),
    "image_license" VARCHAR(80),
    "image_license_url" VARCHAR(300),
    "image_author" VARCHAR(300),
    "image_source_url" VARCHAR(600),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("wikidata")
);

-- CreateIndex
CREATE INDEX "restaurants_brand_wikidata_idx" ON "restaurants"("brand_wikidata");

