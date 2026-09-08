const test = require('node:test');
const assert = require('node:assert/strict');

function response(body, options = {}) {
    return {
        ok: options.ok ?? true,
        status: options.status ?? 200,
        text: async () => JSON.stringify(body),
    };
}

test('Design Agent session normalization preserves MavenSync attribution', async () => {
    const { normalizeDesignAgentSession } = await import('../packages/studio/src/lib/providers/design/index.js');
    const session = normalizeDesignAgentSession(
        { id: 'design-session-1', name: 'Launch Concepts' },
        {
            session: { userId: 'user-1', tenantId: 'tenant-1', email: 'user@example.test' },
            launchContext: {
                launchId: 'launch-1',
                projectId: 'project-1',
                campaignId: 'campaign-1',
                contentPlanId: 'plan-1',
            },
        },
    );

    assert.equal(session.id, 'design-session-1');
    assert.equal(session.ownerId, 'user-1');
    assert.equal(session.tenantId, 'tenant-1');
    assert.equal(session.projectId, 'project-1');
    assert.equal(session.campaignId, 'campaign-1');
    assert.equal(session.contentPlanId, 'plan-1');
    assert.equal(session.launchId, 'launch-1');
});

test('Design Agent provider sends public context without browser credentials', async () => {
    const { MuApiDesignAgentProvider } = await import('../packages/studio/src/lib/providers/design/index.js');
    let captured;
    const provider = new MuApiDesignAgentProvider({
        fetchFn: async (url, init) => {
            captured = { url, init };
            return response({ id: 'design-session-1' });
        },
    });

    await provider.createSession({}, {
        session: { userId: 'user-1', tenantId: 'tenant-1', email: 'user@example.test' },
        launchContext: { launchId: 'launch-1', projectId: 'project-1' },
    });

    assert.equal(captured.url, '/api/v1/creative-agent/sessions');
    assert.equal(captured.init.headers.Authorization, undefined);
    assert.equal(captured.init.headers['x-api-key'], undefined);
    const body = JSON.parse(captured.init.body);
    assert.equal(body.context.session.userId, 'user-1');
    assert.equal(body.context.launchContext.projectId, 'project-1');
});

test('Design Agent unsupported operations return explicit capability errors', async () => {
    const { MuApiDesignAgentProvider } = await import('../packages/studio/src/lib/providers/design/index.js');
    const provider = new MuApiDesignAgentProvider({ fetchFn: async () => response({}) });

    assert.throws(
        () => provider.cancelDesignJob('job-1'),
        (error) => error.code === 'unsupported_capability' && error.methodName === 'cancelDesignJob',
    );
});

test('Workflow preset normalization preserves original graph', async () => {
    const { normalizeWorkflowPreset } = await import('../packages/studio/src/lib/providers/workflow/index.js');
    const preset = normalizeWorkflowPreset({
        workflow_id: 'wf-1',
        name: 'Two Step Flow',
        category: 'Video',
        data: { nodes: [{ id: 'a' }, { id: 'b' }] },
        edges: [{ id: 'edge-1', source: 'a', target: 'b' }],
        thumbnail_url: 'https://cdn.example.test/thumb.jpg',
        source: 'upstream-vibe-workflow',
    });

    assert.equal(preset.id, 'wf-1');
    assert.equal(preset.nodes.length, 2);
    assert.equal(preset.edges[0].target, 'b');
    assert.equal(preset.thumbnail, 'https://cdn.example.test/thumb.jpg');
    assert.equal(preset.source, 'upstream-vibe-workflow');
});

test('Workflow graph validation rejects missing node references', async () => {
    const { validateWorkflowGraph } = await import('../packages/studio/src/lib/providers/workflow/index.js');

    assert.throws(
        () => validateWorkflowGraph({
            nodes: [{ id: 'a' }],
            edges: [{ id: 'edge-1', source: 'a', target: 'missing' }],
        }),
        (error) => error.code === 'workflow_validation_failed',
    );
});

test('Workflow output assets keep temporary URL separate from asset identity', async () => {
    const { normalizeWorkflowOutputAsset } = await import('../packages/studio/src/lib/providers/workflow/index.js');
    const asset = normalizeWorkflowOutputAsset(
        {
            id: 'output-1',
            type: 'image_url',
            value: 'https://signed.example.test/output.png?expires=soon',
            temporaryUrl: true,
        },
        {
            runId: 'run-1',
            workflowId: 'wf-1',
            session: { userId: 'user-1', tenantId: 'tenant-1' },
            launchContext: { projectId: 'project-1' },
        },
    );

    assert.equal(asset.assetId, 'output-1');
    assert.equal(asset.url, 'https://signed.example.test/output.png?expires=soon');
    assert.equal(asset.sourceJobId, 'run-1');
    assert.equal(asset.projectId, 'project-1');
    assert.equal(asset.metadata.temporaryUrl, true);
});

test('Job status mapping supports provider processing and timeout states', async () => {
    const { normalizeJobResponse, JOB_STATUS } = await import('../packages/studio/src/lib/jobs/jobTypes.js');

    assert.equal(normalizeJobResponse({ status: 'processing' }).status, JOB_STATUS.PROCESSING);
    assert.equal(normalizeJobResponse({ status: 'partial_success' }).status, JOB_STATUS.PARTIALLY_COMPLETED);
    assert.equal(normalizeJobResponse({ status: 'timeout' }).status, JOB_STATUS.TIMED_OUT);
    assert.equal(normalizeJobResponse({ status: 'completed' }).status, JOB_STATUS.SUCCEEDED);
});

test('Workflow polling registry prevents duplicate in-flight polling', async () => {
    const { PollingRegistry } = await import('../packages/studio/src/lib/providers/workflow/index.js');
    const registry = new PollingRegistry();
    let calls = 0;

    const first = registry.run('run-1', async () => {
        calls += 1;
        return 'done';
    });
    const second = registry.run('run-1', async () => {
        calls += 1;
        return 'duplicate';
    });

    assert.equal(await first, 'done');
    assert.equal(await second, 'done');
    assert.equal(calls, 1);
    assert.equal(registry.has('run-1'), false);
});

test('Workflow provider keeps raw outputs while exposing normalized assets', async () => {
    const { MuApiWorkflowProvider } = await import('../packages/studio/src/lib/providers/workflow/index.js');
    const provider = new MuApiWorkflowProvider({
        registryProvider: () => ({
            executeWorkflow: async () => ({
                run_id: 'run-1',
                status: 'completed',
                outputs: [{ id: 'out-1', type: 'image_url', value: 'https://cdn.example.test/out.png' }],
            }),
        }),
    });

    const result = await provider.executeWorkflow('key', 'wf-1', {}, {
        session: { userId: 'user-1' },
        launchContext: { projectId: 'project-1' },
    });

    assert.equal(result.outputs[0].type, 'image_url');
    assert.equal(result.assets[0].assetId, 'out-1');
    assert.equal(result.assets[0].projectId, 'project-1');
});

test('Hub reporting failure does not remove local workflow asset normalization result', async () => {
    const { normalizeWorkflowOutputAsset } = await import('../packages/studio/src/lib/providers/workflow/index.js');
    const asset = normalizeWorkflowOutputAsset({ id: 'asset-1', value: 'https://cdn.example.test/a.png' });
    const failingHubRegistration = async () => {
        throw new Error('Hub unavailable');
    };

    await assert.rejects(failingHubRegistration);
    assert.equal(asset.assetId, 'asset-1');
    assert.equal(asset.url, 'https://cdn.example.test/a.png');
});
