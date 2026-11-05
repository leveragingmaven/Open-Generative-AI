CREATE TABLE IF NOT EXISTS zernio_automation_requests (
  request_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  response_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_zernio_automation_owner (account_id, creator_identity_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
