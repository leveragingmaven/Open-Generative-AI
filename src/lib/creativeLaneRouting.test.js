import test from 'node:test';
import assert from 'node:assert/strict';
import { StatelessCreativePreparationService } from './statelessCreativePreparation.js';
import { MuApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { CapabilityRouter } from '../../packages/studio/src/lib/intelligence/CapabilityRouter.js';
import { ProviderCapabilityRegistry } from '../../packages/studio/src/lib/intelligence/ProviderCapabilityRegistry.js';
import { productionRequirements } from '../../packages/studio/src/lib/intelligence/CreativeProductionRequirements.js';
import { studioModelDeployments } from '../../packages/studio/src/lib/intelligence/StudioModelDeployments.js';

const prepare = (operation, inputs = {}, references = []) => new StatelessCreativePreparationService().prepare({request:{operation, inputs, references, userIntent:operation,agentId:'test',conversationId:'test',authenticatedIdentity:{accountId:'test',identityKey:'test'}}});
test('text-only video selects a model requiring no image', () => {
  const result=prepare('video_generation');
  assert.equal(result.planState,'executable');
  assert.equal(result.proposedRouting.operation,'video_generation');
  assert.ok(result.proposedRouting.model);
});
test('video source is required before editing can execute', () => {
  assert.equal(prepare('video_editing').planState,'requires_input');
  const edit=prepare('video_editing',{videoUrl:'https://example.test/source.mp4'});
  assert.equal(edit.planState,'executable');
  assert.equal(edit.proposedRouting.operation,'video_transform');
});
test('unsupported mandatory capability fails closed rather than choosing a cheaper incompatible model', () => {
  const result=prepare('audio_generation',{text:'Hello',productionRequirements:[{id:'typography',kind:'required'}]});
  assert.equal(result.planState,'non_executable');
});
test('malformed production requirements cannot weaken the required recipe capability', () => {
  assert.equal(prepare('audio_generation',{text:'Hello',productionRequirements:[{id:'voice_generation',kind:'ignore'}]}).planState,'non_executable');
});
test('reference video routes through image-to-video', () => {
  const result=prepare('video_generation',{},[{url:'https://example.test/reference.png',role:'source_image'}]);
  assert.equal(result.planState,'executable');
  assert.equal(result.proposedRouting.operation,'image_to_video');
});
test('TTS requires exact script and resolves an existing voice model', () => {
  assert.equal(prepare('audio_generation').planState,'requires_input');
  const result=prepare('audio_generation',{text:'Speak exactly this.'});
  assert.equal(result.planState,'executable');
  assert.equal(result.proposedRouting.operation,'audio_generation');
  assert.ok(result.proposedRouting.model);
});
test('selected provider operation controls dispatch and binds source video', async () => {
  const provider=new MuApiProvider();let actual;
  provider.runClipping=async (_,params)=>{actual=params;return {url:'https://example.test/result.mp4'};};
  provider.runMotionGraphicsEdit=()=>{throw Error('wrong operation');};
  await provider.execute({operation:'video_editing',routing:{operation:'ai_clipping'},inputs:{},references:[{role:'source_video',url:'https://example.test/source.mp4'}]});
  assert.equal(actual.video_url,'https://example.test/source.mp4');
});
test('image-to-video dispatch preserves a typed reference', async () => {
  const provider=new MuApiProvider();let actual;
  provider.generateI2V=async (_,params)=>{actual=params;return {url:'https://example.test/result.mp4'};};
  provider.generateVideo=()=>{throw Error('wrong operation');};
  await provider.execute({operation:'video_generation',routing:{operation:'image_to_video'},references:[{role:'source_image',url:'https://example.test/reference.png'}]});
  assert.equal(actual.image_url,'https://example.test/reference.png');
});
test('TTS never speaks planning or business context and applies registry defaults', async () => {
  const provider=new MuApiProvider();let actual;
  provider.generateAudio=async (_,params)=>{actual=params;return {url:'https://example.test/result.mp3'};};
  await provider.execute({operation:'audio_generation',routing:{operation:'audio_generation',model:'catalog-voice',inputSchema:{voice_id:{default:'catalog-default'}}},inputs:{text:'Hello.',prompt:'Create audio. Internal business context.'}});
  assert.equal(actual.prompt,'Hello.');assert.equal(actual._modelId,'catalog-voice');assert.equal(actual.voice_id,'catalog-default');
});
test('catalog projection discovers added voice models without changing Maven', () => {
  const deployments=studioModelDeployments({video:[],editing:[],audio:[{id:'future-voice',transport:'fal',inputs:{voice_id:{default:'v'},prompt:{type:'string'}},required:['prompt','voice_id']}]});
  assert.equal(deployments[0].providerId,'fal');assert.equal(deployments[0].metadata.modelId,'future-voice');
});
test('capability suitability outranks provider priority and price', () => {
  const deployments=new ProviderCapabilityRegistry();
  deployments.register({id:'cheap',providerId:'one',priority:100,capabilities:['image_generation'],cost:{unitCost:0.01,unit:'image',currency:'USD'}});
  deployments.register({id:'text',providerId:'two',priority:0,capabilities:['image_generation','typography'],cost:{unitCost:0.2,unit:'image',currency:'USD'}});
  const router=new CapabilityRouter({deployments});
  assert.equal(router.resolve({required:['image_generation'],preferred:['typography']}).providerId,'two');
  assert.equal(router.resolve({required:['image_generation','typography']}).providerId,'two');
});
test('unavailable and policy-excluded providers do not participate', () => {
  const deployments=new ProviderCapabilityRegistry();
  deployments.register({id:'off',providerId:'one',availability:'unavailable',capabilities:['voice_generation']});
  deployments.register({id:'on',providerId:'two',capabilities:['voice_generation']});
  const router=new CapabilityRouter({deployments});
  assert.equal(router.resolve({required:['voice_generation']}).providerId,'two');
  assert.throws(()=>router.resolve({required:['voice_generation']},{policy:{allowedProviders:['one']}}));
});
test('skill constraints augment rather than replace required recipe capabilities', () => {
  const requirements=productionRequirements({capabilityRequirements:['image_generation']},{inputs:{productionRequirements:[{id:'character_consistency',kind:'required'}]}},[{capabilities:['photorealism'],capabilityRequirements:['typography']}]);
  assert.ok(requirements.includes('image_generation'));assert.ok(requirements.includes('typography'));
  assert.ok(requirements.some(r=>r.id==='character_consistency'&&r.kind==='required'));
  assert.ok(requirements.some(r=>r.id==='photorealism'&&r.kind==='preferred'));
});
