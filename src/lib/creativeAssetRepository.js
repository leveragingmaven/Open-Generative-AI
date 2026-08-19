import crypto from 'node:crypto';
import { getCreatorDatabasePool } from './creatorAccountStore.js';

function json(value) { return value == null ? null : JSON.stringify(value); }

function parse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function rowToAsset(row) {
  if (!row) return null;
  const asset = parse(row.asset_json, {});
  return {
    ...asset,
    id: row.asset_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    jobId: row.job_id,
    attemptId: row.attempt_id,
    requestId: row.request_id,
    authorizationId: row.authorization_id,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    campaignId: row.campaign_id,
    provider: row.provider_id || asset.provider || null,
    model: row.deployment_id || asset.model || null,
    recipe: row.recipe_id || asset.recipe || null,
    planId: row.plan_id || null,
    providerOutputReference: row.provider_output_ref,
    storageReference: row.storage_reference,
    metadata: { ...parse(row.metadata_json, {}), ...(asset.metadata || {}) },
  };
}

export class CreativeAssetRepository {
  async getByExecution() { throw new Error('CreativeAssetRepository.getByExecution() must be implemented'); }
  async saveOnConnection() { throw new Error('CreativeAssetRepository.saveOnConnection() must be implemented'); }
  async get() { throw new Error('CreativeAssetRepository.get() must be implemented'); }
  async list() { throw new Error('CreativeAssetRepository.list() must be implemented'); }
}

export class MySqlCreativeAssetRepository extends CreativeAssetRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) { super(); this.db = db; }

  async getByExecution({ jobId, attemptId, accountId } = {}) {
    const [rows] = await this.db.query(
      'SELECT * FROM creative_assets WHERE job_id = ? AND attempt_id = ? AND account_id = ? LIMIT 1',
      [jobId, attemptId, accountId],
    );
    return rowToAsset(rows[0]);
  }

  async saveOnConnection(connection, asset) {
    const existing = await this.getByExecutionOnConnection(connection, asset.jobId, asset.attemptId, asset.accountId);
    if (existing) return existing;
    const assetId = asset.id || `asset-${crypto.randomUUID()}`;
    const record = { ...asset, id: assetId };
    try {
      await connection.query(
        `INSERT INTO creative_assets
         (asset_id, account_id, creator_identity_key, job_id, attempt_id, request_id, authorization_id,
          agent_id, conversation_id, campaign_id, asset_type, modality, provider_id, deployment_id,
          provider_output_ref, storage_reference, recipe_id, plan_id, asset_json, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.id, record.accountId, record.creatorIdentityKey, record.jobId, record.attemptId,
          record.requestId, record.authorizationId, record.agentId, record.conversationId, record.campaignId || null,
          record.metadata?.assetType || 'generated', record.metadata?.modality || null, record.provider || null,
          record.model || null, record.providerOutputReference || record.generatedFiles?.[0] || null,
          record.storageReference || record.generatedFiles?.[0] || null, record.recipe || null, record.planId || null,
          json(record), json(record.metadata || {})],
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      return this.getByExecutionOnConnection(connection, record.jobId, record.attemptId, record.accountId);
    }
    return record;
  }

  async getByExecutionOnConnection(connection, jobId, attemptId, accountId) {
    const [rows] = await connection.query(
      'SELECT * FROM creative_assets WHERE job_id = ? AND attempt_id = ? AND account_id = ? LIMIT 1',
      [jobId, attemptId, accountId],
    );
    return rowToAsset(rows[0]);
  }

  async get(assetId, { accountId } = {}) {
    const [rows] = await this.db.query('SELECT * FROM creative_assets WHERE asset_id = ? AND account_id = ? LIMIT 1', [assetId, accountId]);
    return rowToAsset(rows[0]);
  }

  async list({ accountId, campaignId } = {}) {
    const clauses = ['account_id = ?'];
    const params = [accountId];
    if (campaignId) { clauses.push('campaign_id = ?'); params.push(campaignId); }
    const [rows] = await this.db.query(`SELECT * FROM creative_assets WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, params);
    return rows.map(rowToAsset);
  }
}

export { rowToAsset };
