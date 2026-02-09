-- Add posting_hour column for per-user posting time control
ALTER TABLE social_accounts ADD COLUMN posting_hour INTEGER DEFAULT 15;
