-- Add power_source column to user_reports
-- Tracks how electricity was restored: "grid" or "generator"
-- Only set when resolving electricity reports

ALTER TABLE user_reports ADD COLUMN power_source TEXT;
