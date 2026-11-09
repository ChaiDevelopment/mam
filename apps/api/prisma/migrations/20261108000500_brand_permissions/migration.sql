-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "media_source" VARCHAR(20),
ADD COLUMN     "permission_note" VARCHAR(300);


-- Owner-permission media must say whose permission it is; existing Commons media are marked as such.
UPDATE brands SET media_source = 'COMMONS' WHERE media_source IS NULL AND (logo_url IS NOT NULL OR image_url IS NOT NULL);
ALTER TABLE brands ADD CONSTRAINT brands_owner_media_has_permission CHECK (media_source IS DISTINCT FROM 'OWNER' OR (permission_note IS NOT NULL AND length(permission_note) >= 5));
ALTER TABLE brands ADD CONSTRAINT brands_key_format CHECK (wikidata ~ '^(Q[0-9]+|MAM-[a-z0-9-]+)$');
