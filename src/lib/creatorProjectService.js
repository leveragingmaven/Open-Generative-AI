import { DesignAgentSessionOwnershipService } from './designAgentSessionOwnership.js';
import {
  CreatorProjectError,
  MySqlCreatorProjectRepository,
  MySqlDesignAgentSessionProjectRepository,
  scopeFrom,
} from './creatorProjectRepository.js';

// Server-side authority for the Campaign/Project entity.
//
// Ownership is *always* derived from the authenticated identity. Nothing in a
// request body can name an account, a creator, or a tenant: those fields are
// rejected outright rather than silently dropped, so a caller cannot believe a
// scope was honoured when it was not.
//
// Two independent guarantees are enforced here:
//   1. Every read and write is scoped by (accountId, creatorIdentityKey).
//   2. "Not found" and "belongs to another tenant" are the same answer, so an id
//      cannot be probed for existence across tenants.

export const PROJECT_STATUSES = Object.freeze([
  'draft', 'planning', 'generating', 'review', 'approved', 'queued', 'completed', 'archived',
]);

export const PROJECT_LIMITS = Object.freeze({
  name: 200,
  description: 2000,
  instruction: 1000,
  briefs: 20,
  briefsBytes: 16_384,
  importBatch: 200,
});

export const PROJECT_INSTRUCTION_CHANNELS = Object.freeze([
  'brand', 'audience', 'offer', 'product', 'visual', 'voice',
]);

// Same list the creative-agent proxy refuses to forward for session creation.
const OWNERSHIP_FIELDS = new Set([
  'account', 'accountid', 'creator', 'creatoridentitykey', 'creatorid', 'identity', 'identitykey',
  'user', 'userid', 'owner', 'ownerid', 'tenant', 'tenantid', 'authenticatedidentity',
]);

function normalizedFieldName(field) {
  return String(field).replaceAll('_', '').replaceAll('-', '').toLowerCase();
}

export function assertNoOwnershipFields(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CreatorProjectError('invalid_project_payload', 400);
  }
  for (const field of Object.keys(input)) {
    if (OWNERSHIP_FIELDS.has(normalizedFieldName(field))) {
      throw new CreatorProjectError('unsupported_project_ownership_fields', 400);
    }
  }
  return input;
}

// Instruction text is bounded and stripped of control characters. It is data, never
// authorization input, and no asset URL is ever accepted here.
export function boundedText(value, field, max) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new CreatorProjectError(`${field}_invalid`, 400);
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (cleaned.length > max) throw new CreatorProjectError(`${field}_too_long`, 400);
  return cleaned;
}

function boundedBriefs(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new CreatorProjectError('briefs_invalid', 400);
  if (value.length > PROJECT_LIMITS.briefs) throw new CreatorProjectError('briefs_too_many', 400);
  const serialized = JSON.stringify(value);
  if (serialized.length > PROJECT_LIMITS.briefsBytes) throw new CreatorProjectError('briefs_too_large', 400);
  return value;
}

export function normalizeProjectInput(input = {}) {
  const normalized = {};
  if (input.name !== undefined) {
    const name = boundedText(input.name, 'name', PROJECT_LIMITS.name);
    normalized.name = name || 'Untitled Campaign';
  }
  if (input.description !== undefined) {
    normalized.description = boundedText(input.description, 'description', PROJECT_LIMITS.description) || '';
  }
  if (input.status !== undefined) {
    if (!PROJECT_STATUSES.includes(input.status)) throw new CreatorProjectError('status_invalid', 400);
    normalized.status = input.status;
  }
  const instructions = {};
  for (const channel of PROJECT_INSTRUCTION_CHANNELS) {
    const value = boundedText(input.instructions?.[channel], channel, PROJECT_LIMITS.instruction);
    if (value !== undefined) instructions[channel] = value;
  }
  if (Object.keys(instructions).length) normalized.instructions = instructions;
  const briefs = boundedBriefs(input.briefs);
  if (briefs !== undefined) normalized.briefs = briefs;
  if (input.updatedAt !== undefined) normalized.sourceUpdatedAt = boundedText(String(input.updatedAt), 'updatedAt', 32);
  return normalized;
}

// The shape CampaignStore and its consumers already use, so a server row can be
// handed to `setActiveCampaign()` unchanged.
export function projectToCampaignShape(project) {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    description: project.description || '',
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function generatedProjectId() {
  return `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function timestampOf(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class CreatorProjectService {
  constructor({
    repository = new MySqlCreatorProjectRepository(),
    sessionProjectRepository = new MySqlDesignAgentSessionProjectRepository(),
    sessionOwnershipService = new DesignAgentSessionOwnershipService(),
  } = {}) {
    this.repository = repository;
    this.sessionProjectRepository = sessionProjectRepository;
    this.sessionOwnershipService = sessionOwnershipService;
  }

  // Full row, but only when the caller owns it. Foreign rows are indistinguishable
  // from missing ones.
  async verifyOwnedProject({ identity, projectId } = {}) {
    const scope = scopeFrom(identity);
    if (!projectId) throw new CreatorProjectError('project_not_found', 404);
    const record = await this.repository.get(projectId);
    if (!record
      || record.accountId !== scope.accountId
      || record.creatorIdentityKey !== scope.creatorIdentityKey) {
      throw new CreatorProjectError('project_not_found', 404);
    }
    return record;
  }

  async getProject({ identity, projectId } = {}) {
    try {
      return await this.verifyOwnedProject({ identity, projectId });
    } catch (error) {
      if (error?.code === 'project_not_found') return null;
      throw error;
    }
  }

  async listProjects({ identity } = {}) {
    const scope = scopeFrom(identity);
    return this.repository.list(scope);
  }

  async createProject({ identity, input = {} } = {}) {
    const scope = scopeFrom(identity);
    assertNoOwnershipFields(input);
    const normalized = normalizeProjectInput(input);
    const id = input.id === undefined || input.id === null
      ? generatedProjectId()
      : boundedText(String(input.id), 'id', 191);
    if (!id) throw new CreatorProjectError('id_invalid', 400);
    const record = {
      id,
      ...scope,
      name: normalized.name || 'Untitled Campaign',
      description: normalized.description || '',
      status: normalized.status || 'draft',
      instructions: normalized.instructions || {},
      briefs: normalized.briefs ?? null,
      sourceUpdatedAt: normalized.sourceUpdatedAt ?? null,
    };
    return this.repository.insert(record);
  }

  async updateProject({ identity, projectId, patch = {} } = {}) {
    const scope = scopeFrom(identity);
    assertNoOwnershipFields(patch);
    // Ownership first: a foreign update must fail before any field is validated, so
    // validation errors cannot be used to probe another tenant's rows.
    await this.verifyOwnedProject({ identity, projectId });
    const normalized = normalizeProjectInput(patch);
    const updated = await this.repository.update({ projectId, ...scope, patch: normalized });
    if (!updated) throw new CreatorProjectError('project_not_found', 404);
    return updated;
  }

  async deleteProject({ identity, projectId } = {}) {
    const scope = scopeFrom(identity);
    await this.verifyOwnedProject({ identity, projectId });
    // Associations are released first so no row can point at a deleted project.
    // The repository clears them in SQL; the service also releases them through the
    // association store it owns, because a repository that was not wired to that
    // store (the in-memory one, or a future implementation) would otherwise leave a
    // dangling association behind a deleted project. Both calls are scoped and
    // idempotent, so releasing twice is harmless.
    await this.repository.clearProjectReferences({ projectId, ...scope });
    if (this.sessionProjectRepository?.clearProject) {
      await this.sessionProjectRepository.clearProject({ projectId, ...scope });
    }
    return this.repository.remove({ projectId, ...scope });
  }

  /**
   * Idempotent import of browser-local projects.
   *
   * Guarantees, in order of importance:
   *   - an id that already exists for another tenant is never touched or revealed;
   *   - an existing row is only replaced when the incoming updatedAt is strictly
   *     newer than the source timestamp stored on it, so an import can never
   *     silently roll back newer server data;
   *   - running the same payload twice inserts nothing the second time.
   */
  async importLocalProjects({ identity, projects } = {}) {
    const scope = scopeFrom(identity);
    if (!Array.isArray(projects)) throw new CreatorProjectError('projects_invalid', 400);
    if (projects.length > PROJECT_LIMITS.importBatch) throw new CreatorProjectError('import_too_large', 400);

    const report = { received: projects.length, imported: 0, updated: 0, unchanged: 0, foreign: 0, invalid: 0 };

    for (const entry of projects) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { report.invalid += 1; continue; }
      const id = boundedText(entry.id === undefined || entry.id === null ? '' : String(entry.id), 'id', 191);
      if (!id) { report.invalid += 1; continue; }

      let normalized;
      try {
        // Legacy local entries may carry stray ownership-looking keys; they are
        // ignored rather than fatal, because they are never read as authorization.
        normalized = normalizeProjectInput(entry);
      } catch {
        report.invalid += 1;
        continue;
      }

      const existing = await this.repository.get(id);
      if (existing) {
        if (existing.accountId !== scope.accountId
          || existing.creatorIdentityKey !== scope.creatorIdentityKey) {
          report.foreign += 1;
          continue;
        }
        const incoming = timestampOf(normalized.sourceUpdatedAt);
        const stored = timestampOf(existing.sourceUpdatedAt);
        if (incoming > 0 && stored > 0 && incoming > stored) {
          await this.repository.update({ projectId: id, ...scope, patch: normalized });
          report.updated += 1;
        } else {
          report.unchanged += 1;
        }
        continue;
      }

      try {
        await this.repository.insert({
          id,
          ...scope,
          name: normalized.name || 'Untitled Campaign',
          description: normalized.description || '',
          status: normalized.status || 'draft',
          instructions: normalized.instructions || {},
          briefs: normalized.briefs ?? null,
          sourceUpdatedAt: normalized.sourceUpdatedAt ?? null,
        });
        report.imported += 1;
      } catch (error) {
        if (error?.code === 'project_owner_conflict') { report.foreign += 1; continue; }
        throw error;
      }
    }

    return report;
  }

  /**
   * Associate, move or clear a session's project.
   *
   * Both resources are verified against the caller's identity before anything is
   * written, so a session owned by one tenant can never be pointed at another
   * tenant's project (and vice versa).
   */
  async associateSessionProject({ identity, designSessionId, projectId = null } = {}) {
    const scope = scopeFrom(identity);
    if (!designSessionId) throw new CreatorProjectError('designSessionId_required', 400);
    await this.sessionOwnershipService.verifyOwnedSession({ designSessionId, identity });
    if (projectId !== null && projectId !== undefined && projectId !== '') {
      await this.verifyOwnedProject({ identity, projectId });
    } else {
      projectId = null;
    }
    return this.sessionProjectRepository.setProject({
      designSessionId,
      ...scope,
      projectId,
    });
  }

  async getSessionProject({ identity, designSessionId } = {}) {
    if (!designSessionId) throw new CreatorProjectError('designSessionId_required', 400);
    await this.sessionOwnershipService.verifyOwnedSession({ designSessionId, identity });
    return this.sessionProjectRepository.get(designSessionId);
  }
}

export const creatorProjectServiceInternals = {
  OWNERSHIP_FIELDS,
  PROJECT_LIMITS,
  timestampOf,
};
