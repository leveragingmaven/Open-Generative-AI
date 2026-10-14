-- Maven Motion Carousel background render jobs.
--
-- A durable queue for local carousel renders. Reuses the existing Creator OS
-- MySQL database (no Redis or new infrastructure). Ownership is the server-derived
-- account id; an idempotency key makes enqueue safe to retry; a lease + heartbeat
-- lets a restarted worker reclaim a job that was interrupted mid-render.
CREATE TABLE IF NOT EXISTS motion_carousel_jobs (
  job_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  idempotency_key VARCHAR(191) NULL,
  status VARCHAR(32) NOT NULL,
  phase VARCHAR(48) NOT NULL,
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  preset_id VARCHAR(64) NOT NULL,
  brief TEXT NULL,
  deck_json JSON NOT NULL,
  previous_fingerprints_json JSON NULL,
  fingerprints_json JSON NULL,
  result_json JSON NULL,
  error_json JSON NULL,
  cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 2,
  lease_expires_at TIMESTAMP NULL,
  heartbeat_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id),
  UNIQUE KEY uq_motion_carousel_account_idempotency (account_id, idempotency_key),
  KEY idx_motion_carousel_claim (status, created_at),
  KEY idx_motion_carousel_account_created (account_id, created_at),
  CONSTRAINT chk_motion_carousel_attempt_count CHECK (attempt_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
