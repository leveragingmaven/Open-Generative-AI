CREATE TABLE IF NOT EXISTS zernio_profiles (
  zernio_profile_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  profile_name VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (zernio_profile_id),
  UNIQUE KEY uq_zernio_profiles_account (account_id, creator_identity_key),
  KEY idx_zernio_profiles_identity (account_id, creator_identity_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS zernio_connected_accounts (
  zernio_account_id VARCHAR(191) NOT NULL,
  zernio_profile_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  username VARCHAR(191) NULL,
  display_name VARCHAR(191) NULL,
  profile_image_url VARCHAR(1024) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  needs_reconnect BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (zernio_account_id),
  KEY idx_zernio_accounts_owner (account_id, creator_identity_key, zernio_profile_id),
  KEY idx_zernio_accounts_profile (zernio_profile_id),
  CONSTRAINT fk_zernio_accounts_profile
    FOREIGN KEY (zernio_profile_id) REFERENCES zernio_profiles (zernio_profile_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
