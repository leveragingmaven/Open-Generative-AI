-- Phase 7.1b — durable association between a Design Agent session and a project.
--
-- Deliberately a SEPARATE table from design_agent_session_ownership (007): ownership
-- is an authorization artifact, and product metadata must not enter that trust
-- boundary. Keyed the same way so both scopes are always (account_id,
-- creator_identity_key).
--
-- `project_id` NULL means "explicitly no project". Association rows carry no
-- instructions and no asset URLs, so nothing here can become model input by itself.
--
-- `archived_at` is reserved for the planned Archive work: no code path reads or
-- writes it yet, and adding it now avoids a later schema change on a live table.
CREATE TABLE IF NOT EXISTS design_agent_session_projects (
  design_session_id VARCHAR(191) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  creator_identity_key VARCHAR(191) NOT NULL,
  project_id VARCHAR(191) NULL,
  archived_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (design_session_id),
  KEY idx_design_agent_session_project_owner (account_id, creator_identity_key, updated_at),
  KEY idx_design_agent_session_project_project (account_id, project_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
