CREATE TABLE IF NOT EXISTS creator_accounts (
  account_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity_key VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  UNIQUE KEY uq_creator_accounts_identity_key (identity_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
