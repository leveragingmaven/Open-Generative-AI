/**
 * Server-side controlled-mode configuration for the Design Agent conversation path.
 *
 * The flag is read from the server environment. The browser is informed of the
 * current mode through a dedicated config endpoint; it can never disable or
 * override the mode from the client.
 */

const CONTROLLED_EXECUTION_ENV = 'DESIGN_AGENT_CONTROLLED_EXECUTION';

export function isDesignAgentControlledExecution() {
  return process.env[CONTROLLED_EXECUTION_ENV] === 'true';
}
