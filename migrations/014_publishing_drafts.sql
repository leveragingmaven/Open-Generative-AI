CREATE TABLE IF NOT EXISTS publishing_drafts (
  account_id BIGINT UNSIGNED NOT NULL,
  draft_id VARCHAR(191) NOT NULL,
  draft_json JSON NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, draft_id),
  CONSTRAINT fk_publishing_drafts_account FOREIGN KEY (account_id) REFERENCES creator_accounts (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
