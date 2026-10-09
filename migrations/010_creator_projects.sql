-- Phase 7.1b — the existing Campaign/Project entity, made durable.
--
-- This is NOT a second project system: `project_id` holds the same campaign id the
-- CampaignStore already uses, so existing ids, the useActiveCampaign() contract and
-- the Campaign Workspace destination are all unchanged. The browser store becomes a
-- cache of these rows.
--
-- The six instruction channels are folded in as bounded columns (no join, one
-- ownership check) because that is exactly the set buildCreativeContext() reads.
-- Every column is bounded here *and* capped in creatorProjectService.
CREATE TABLE IF NOT EXISTS creator_projects (
  project_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description VARCHAR(2000) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  brand VARCHAR(1000) NULL,
  audience VARCHAR(1000) NULL,
  offer VARCHAR(1000) NULL,
  product VARCHAR(1000) NULL,
  visual VARCHAR(1000) NULL,
  voice VARCHAR(1000) NULL,
  briefs_json JSON NULL,
  -- The browser's updatedAt for an imported project. Import only replaces a row when
  -- the incoming value is strictly newer than this one, so an import can never
  -- silently roll back newer server data.
  source_updated_at VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id),
  KEY idx_creator_projects_owner (account_id, creator_identity_key, updated_at),
  KEY idx_creator_projects_owner_status (account_id, creator_identity_key, status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
