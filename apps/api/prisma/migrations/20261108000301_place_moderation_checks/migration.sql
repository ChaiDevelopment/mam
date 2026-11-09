-- Separate migration: new enum values cannot be used in the transaction that adds them.
-- Hand-written: a rejection must carry a reason (it is e-mailed to the submitter).
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_rejection_has_reason CHECK (status <> 'REJECTED' OR (moderation_note IS NOT NULL AND length(moderation_note) >= 5));
