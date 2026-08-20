CREATE TABLE IF NOT EXISTS design_agent_session_ownership (
  design_session_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (design_session_id),
  KEY idx_design_agent_session_owner (account_id, creator_identity_key, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
