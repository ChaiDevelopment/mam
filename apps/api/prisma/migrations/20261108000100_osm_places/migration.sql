-- CreateEnum
CREATE TYPE "PlaceSource" AS ENUM ('GOOGLE', 'OSM', 'COMMUNITY');

-- AlterEnum
ALTER TYPE "CategorySource" ADD VALUE 'OSM_TAG';

-- AlterEnum
ALTER TYPE "NameSource" ADD VALUE 'OSM';

-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'OSM';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "address" VARCHAR(300),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "cuisine" VARCHAR(200),
ADD COLUMN     "opening_hours" VARCHAR(500),
ADD COLUMN     "phone" VARCHAR(60),
ADD COLUMN     "place_kind" VARCHAR(40),
ADD COLUMN     "province" VARCHAR(120),
ADD COLUMN     "source" "PlaceSource" NOT NULL DEFAULT 'GOOGLE',
ADD COLUMN     "source_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "website" VARCHAR(300);

-- CreateTable
CREATE TABLE "localities" (
    "id" UUID NOT NULL,
    "osm_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "context" VARCHAR(200),
    "population" INTEGER,
    "location" geography(Point, 4326) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_imports" (
    "id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(500),

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "localities_osm_id_key" ON "localities"("osm_id");

-- CreateIndex
CREATE INDEX "localities_kind_idx" ON "localities"("kind");

-- CreateIndex
CREATE INDEX "data_imports_provider_started_at_idx" ON "data_imports"("provider", "started_at");

-- CreateIndex
CREATE INDEX "restaurants_source_idx" ON "restaurants"("source");


-- ── Hand-written: OpenStreetMap / community places ──────────────────────────────
-- Only Google-derived coordinates expire (location_cached_at set, purged after 30 days).
-- OSM (ODbL) and community coordinates are stored permanently with location_cached_at = NULL.
ALTER TABLE restaurants DROP CONSTRAINT restaurants_location_cache;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_location_cache CHECK (location_cached_at IS NULL OR location IS NOT NULL),
  ADD CONSTRAINT restaurants_google_facts_not_stored CHECK (
    source <> 'GOOGLE' OR (address IS NULL AND phone IS NULL AND website IS NULL AND opening_hours IS NULL)),
  ADD CONSTRAINT restaurants_local_has_location CHECK (source = 'GOOGLE' OR location IS NOT NULL),
  ADD CONSTRAINT restaurants_local_has_name CHECK (source = 'GOOGLE' OR name IS NOT NULL);

-- Fuzzy, case-insensitive name search ("warung", "bakso", "kopi ...").
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX restaurants_name_trgm ON restaurants USING gin (lower(name) gin_trgm_ops) WHERE name IS NOT NULL;
CREATE INDEX localities_name_trgm ON localities USING gin (lower(name) gin_trgm_ops);
CREATE INDEX localities_location_gist ON localities USING gist (location);
