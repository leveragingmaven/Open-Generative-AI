CREATE TABLE IF NOT EXISTS provider_credentials (
  credential_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  provider_id VARCHAR(191) NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  encryption_version VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  last_validated_at TIMESTAMP NULL,
  last_used_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (credential_id),
  UNIQUE KEY uq_provider_credentials_scope (account_id, creator_identity_key, provider_id),
  KEY idx_provider_credentials_lookup (account_id, creator_identity_key, provider_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
