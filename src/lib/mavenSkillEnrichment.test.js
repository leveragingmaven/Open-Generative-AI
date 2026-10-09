// Does CreativeSkill enrichment reach dashboard creative requests through the
// execution pipeline?
//
// The dashboard conversation is converted into a creative request by
// ConversationProposalBuilder, which resolves the intent extractor's skill hints
// against the canonical skill library. The agent execution planner then resolves
// the proposal's requested skills again and hands the canonical ids to the
// skill-aware plan compiler. This test pins that whole connection with the real
// modules so enrichment cannot silently detach from the execution pipeline, and
// so no second enrichment pass is introduced.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ConversationProposalBuilder } from './conversationProposalBuilder.js';
import { resolveRequestedSkills, planningRequest } from './agentExecutionPlanning.js';
import { SkillResolver } from '../../packages/studio/src/lib/skills/SkillResolver.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };

function reader() {
  return {
    async read() {
      return {
        agentId: 'design-agent',
        conversationId: 'session-1',
        messages: [{ role: 'user', content: 'Create a hero shot of the mug for the launch.' }],
        attachments: [],
        agent: { id: 'design-agent' },
      };
    },
  };
}

function extractor(requestedSkillHints) {
  return {
    async extract() {
      return {
        result: {
          status: 'resolved',
          operation: 'image_generation',
          userIntent: 'Create a hero shot of the mug for the launch.',
          inputs: { deliverable: 'image', subject: 'the mug' },
          referenceRoles: [],
          requestedSkillHints,
          confidence: 0.95,
          clarificationNeeded: null,
        },
      };
    },
  };
}

async function proposalFor(hints) {
  return new ConversationProposalBuilder({
    conversationReader: reader(),
    intentExtractionService: extractor(hints),
    skillResolver: new SkillResolver(),
  }).build({ agentId: 'design-agent', conversationId: 'session-1', identity });
}

test('conversation skill hints become canonical, deduplicated requested skills', async () => {
  const built = await proposalFor(['product-hero-photography', 'product-hero-photography']);

  assert.equal(built.status, 'resolved');
  assert.deepEqual(built.proposal.requestedSkillIds, ['product-hero-photography'], 'a repeated hint must enrich once');
  assert.equal(built.proposal.metadata.source, 'conversation_intent_extraction');
  assert.equal('unresolvedSkillHints' in built.proposal.metadata, false);
});

test('unknown hints stay advisory and are never presented as canonical skills', async () => {
  const built = await proposalFor(['not-a-real-skill']);

  assert.deepEqual(built.proposal.requestedSkillIds, []);
  assert.deepEqual(built.proposal.metadata.unresolvedSkillHints, ['not-a-real-skill']);
});

test('the requested skills are handed to the plan compiler exactly once, with advisories preserved', async () => {
  const built = await proposalFor(['character-composition', 'not-a-real-skill']);
  const request = { ...built.proposal, authenticatedIdentity: identity, userIntent: built.proposal.userIntent };

  // The proposal already canonicalized the conversation's hints: an unknown hint
  // is advisory metadata, never a request the planner has to resolve.
  const resolved = resolveRequestedSkills(request, new SkillResolver());
  assert.deepEqual(resolved.canonicalSkillIds, ['character-composition']);
  assert.deepEqual(resolved.unresolved, []);

  const planning = planningRequest(request, resolved.canonicalSkillIds, resolved.unresolved);
  assert.deepEqual(planning.skillIds, ['character-composition'], 'the compiler receives each canonical skill once');
  assert.deepEqual(planning.metadata.agentExecution.requestedSkillIds, ['character-composition']);
  assert.deepEqual(planning.metadata.unresolvedSkillHints, ['not-a-real-skill'], 'the conversation advisory survives into the plan metadata');
  assert.equal(planning.metadata.agentExecution.conversationId, 'session-1');
  assert.equal(planning.metadata.agentExecution.agentId, 'design-agent');
});

test('a conversation without skill hints injects no enrichment', async () => {
  const built = await proposalFor([]);
  const request = { ...built.proposal, authenticatedIdentity: identity };
  const resolved = resolveRequestedSkills(request, new SkillResolver());

  assert.deepEqual(built.proposal.requestedSkillIds, []);
  assert.deepEqual(resolved.canonicalSkillIds, []);
  assert.deepEqual(planningRequest(request, resolved.canonicalSkillIds, resolved.unresolved).skillIds, []);
});
