-- Hand-written constraints that Prisma cannot express in schema.prisma.

-- Ratings are integers 1..5; overall is their mean (1.00..5.00).
ALTER TABLE reviews
  ADD CONSTRAINT reviews_taste_rating_range       CHECK (taste_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_price_rating_range       CHECK (price_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_portion_rating_range     CHECK (portion_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_cleanliness_rating_range CHECK (cleanliness_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_service_rating_range     CHECK (service_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_overall_rating_range     CHECK (overall_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_overall_is_mean          CHECK (
    overall_rating = ROUND((taste_rating + price_rating + portion_rating + cleanliness_rating + service_rating)::numeric / 5, 2)),
  ADD CONSTRAINT reviews_price_paid_nonneg        CHECK (price_paid IS NULL OR price_paid >= 0),
  ADD CONSTRAINT reviews_deleted_consistency      CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL)),
  ADD CONSTRAINT reviews_quality_range            CHECK (quality_score BETWEEN 0 AND 1);

ALTER TABLE review_photos
  ADD CONSTRAINT review_photos_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT review_photos_size CHECK (file_size > 0 AND file_size <= 8388608),
  ADD CONSTRAINT review_photos_dims CHECK (width > 0 AND height > 0);

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_radius CHECK (default_radius_meters IN (1000, 2000, 3000, 5000, 10000));

ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_merge_target CHECK ((status = 'MERGED') = (merged_into_id IS NOT NULL)),
  ADD CONSTRAINT restaurants_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id),
  ADD CONSTRAINT restaurants_location_cache CHECK ((location IS NULL) = (location_cached_at IS NULL));

-- Geographic index for ST_DWithin / ST_Distance radius queries.
CREATE INDEX restaurants_location_gist ON restaurants USING GIST (location);

-- Fast lookups for moderation queues and Google-ref resolution.
CREATE INDEX review_reports_open_idx ON review_reports (created_at) WHERE status = 'OPEN';
CREATE INDEX reviews_pending_idx ON reviews (created_at) WHERE status = 'PENDING';
CREATE INDEX user_profiles_username_trgm_idx ON user_profiles (lower(username::text) text_pattern_ops);
