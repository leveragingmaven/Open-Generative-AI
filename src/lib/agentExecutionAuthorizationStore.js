import {
  AGENT_EXECUTION_AUTHORIZATION_STATUSES,
  InMemoryAgentExecutionAuthorizationRepository,
  MySqlAgentExecutionAuthorizationRepository,
} from './agentExecutionAuthorizationRepository.js';

export const AGENT_EXECUTION_AUTHORIZATION_STATUS = AGENT_EXECUTION_AUTHORIZATION_STATUSES;

function scopeFor(context) {
  return {
    accountId: String(context?.identity?.accountId || '').trim(),
    creatorIdentityKey: String(context?.identity?.identityKey || '').trim(),
    requestFingerprint: String(context?.intentFingerprint || '').trim(),
  };
}

class AgentExecutionAuthorizationStore {
  constructor({ repository = defaultRepository() } = {}) {
    this.repository = repository;
  }

  issue(record) {
    return this.repository.issue(record);
  }

  get(authorizationId, context) {
    return this.repository.get(authorizationId, scopeFor(context));
  }

  isActive(authorizationId, context) {
    const result = this.get(authorizationId, context);
    if (result && typeof result.then === 'function') {
      return result.then((record) => Boolean(record && record.status === AGENT_EXECUTION_AUTHORIZATION_STATUS.ISSUED));
    }
    return Boolean(result && result.status === AGENT_EXECUTION_AUTHORIZATION_STATUS.ISSUED);
  }

  consume(authorizationId, context) {
    return this.repository.consume(authorizationId, scopeFor(context));
  }

  revoke(authorizationId, context) {
    return this.repository.revoke(authorizationId, scopeFor(context));
  }
}

function defaultRepository() {
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
    return new MySqlAgentExecutionAuthorizationRepository();
  }
  return new InMemoryAgentExecutionAuthorizationRepository();
}

export const agentExecutionAuthorizationStore = new AgentExecutionAuthorizationStore();
export { AgentExecutionAuthorizationStore };
