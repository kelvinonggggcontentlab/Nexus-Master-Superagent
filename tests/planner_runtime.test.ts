import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicPlan } from '../server/agent/planner';
import { agentRuntime } from '../server/agent/runtime';
import { nexusStore } from '../server/db/store';
import { ExecutionRun } from '../src/types/nexus';

test('Planner: Generalized Decomposition without Hardcoded Business Data', () => {
  // Test 1: Math calculation decomposition
  const mathPlan = buildDeterministicPlan('Calculate 8% tax on 45,900 for the billing statement');
  assert.equal(mathPlan.steps.length, 1);
  assert.equal(mathPlan.steps[0].tool, 'calculate');
  assert.ok(mathPlan.steps[0].parameters.expression.includes('45900'));

  // Test 2: Multi-step pipeline with dynamic recipient
  const pipelinePlan = buildDeterministicPlan(
    'Find the latest statement from Drive, summarize it, then email the summary to director@acme.org'
  );
  assert.equal(pipelinePlan.steps.length, 4);
  assert.equal(pipelinePlan.steps[0].tool, 'search_drive');
  assert.equal(pipelinePlan.steps[1].tool, 'read_drive_file');
  assert.equal(pipelinePlan.steps[2].tool, 'analyze_document');
  assert.equal(pipelinePlan.steps[3].tool, 'send_email');
  assert.equal(pipelinePlan.steps[3].parameters.to, 'director@acme.org');

  // Test 3: Destructive action safety flag
  const deletePlan = buildDeterministicPlan('Delete the old invoice file permanently');
  const deleteStep = deletePlan.steps.find(s => s.tool === 'delete_drive_file');
  assert.ok(deleteStep);
  assert.equal(deleteStep.actionType, 'destructive');
  assert.equal(deleteStep.requiresConfirmation, true);
});

test('Runtime: Full Multi-Step Execution & Dynamic Context Propagation', async () => {
  nexusStore.reset();

  const plan = buildDeterministicPlan(
    'Find Maybank invoice, summarize it, then email the summary to auditor@compliance.org'
  );

  const runId = `test_run_${Date.now().toString(36)}`;
  const run: ExecutionRun = {
    id: runId,
    conversationId: 'test_conv',
    userPrompt: 'Find Maybank invoice, summarize it, then email the summary to auditor@compliance.org',
    status: 'planning',
    plan,
    currentStepIndex: 0,
    stepsCompleted: 0,
    totalSteps: plan.steps.length,
    activeStatusText: 'Starting...',
    results: {},
    verificationBadges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const executedRun = await agentRuntime.executePlan(run);

  assert.equal(executedRun.status, 'completed');
  assert.equal(executedRun.stepsCompleted, 4);

  // Verify step 2 read the file dynamically found by step 1
  assert.ok(executedRun.results.read_drive_file.content.length > 0);

  // Verify step 3 performed real entity extraction on the text
  assert.ok(executedRun.results.analyze_document.extractedEntities);
  assert.ok(executedRun.results.analyze_document.extractedEntities.invoiceNumbers.length > 0);

  // Verify step 4 sent to the dynamic recipient
  assert.equal(executedRun.results.send_email.recipient, 'auditor@compliance.org');

  // Verify badges truthfully report simulation
  assert.ok(executedRun.verificationBadges.some(b => b.isSimulated === true));
  assert.ok(executedRun.finalResponse && executedRun.finalResponse.includes('auditor@compliance.org'));
});

test('Runtime: Confirmation Safeguard on Destructive Actions', async () => {
  nexusStore.reset();

  const plan = buildDeterministicPlan('Delete the obsolete document from Drive');
  const runId = `test_del_${Date.now().toString(36)}`;
  const run: ExecutionRun = {
    id: runId,
    conversationId: 'test_conv',
    userPrompt: 'Delete the obsolete document from Drive',
    status: 'planning',
    plan,
    currentStepIndex: 0,
    stepsCompleted: 0,
    totalSteps: plan.steps.length,
    activeStatusText: 'Starting...',
    results: {},
    verificationBadges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // First execution: should pause and wait for confirmation
  const waitingRun = await agentRuntime.executePlan(run);
  assert.equal(waitingRun.status, 'waiting_confirmation');

  const pendingStep = waitingRun.plan.steps.find(s => s.actionType === 'destructive');
  assert.ok(pendingStep);
  assert.equal(pendingStep.status, 'pending');

  // Grant confirmation
  pendingStep.confirmationGranted = true;
  const completedRun = await agentRuntime.executePlan(waitingRun);
  assert.equal(completedRun.status, 'completed');
  assert.equal(pendingStep.status, 'verified');
});

test('Autopilot Engine: "Find my latest invoice, summarize it and save the summary next to the original"', async () => {
  nexusStore.reset();

  const prompt = 'Find my latest invoice, summarize it and save the summary next to the original.';
  const plan = buildDeterministicPlan(prompt);

  assert.equal(plan.steps.length, 4);
  assert.equal(plan.steps[0].tool, 'search_drive');
  assert.equal(plan.steps[1].tool, 'read_drive_file');
  assert.equal(plan.steps[2].tool, 'analyze_document');
  assert.equal(plan.steps[3].tool, 'create_drive_file');
  assert.ok(plan.steps[3].parameters.name.includes('Summary'));

  const runId = `autopilot_test_${Date.now().toString(36)}`;
  const run: ExecutionRun = {
    id: runId,
    conversationId: 'conv_autopilot',
    userPrompt: prompt,
    status: 'planning',
    plan,
    currentStepIndex: 0,
    stepsCompleted: 0,
    totalSteps: plan.steps.length,
    activeStatusText: 'Starting Autopilot Engine...',
    results: {},
    verificationBadges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const executedRun = await agentRuntime.executePlan(run);

  assert.equal(executedRun.status, 'completed');
  assert.equal(executedRun.stepsCompleted, 4);

  // Verify created file in Drive
  assert.ok(executedRun.results.create_drive_file);
  assert.ok(executedRun.results.create_drive_file.id);
  assert.equal(executedRun.results.create_drive_file.folder, '/Finance/Invoices/2026');
  assert.ok(executedRun.results.create_drive_file.sizeBytes > 0);

  // Verify summary highlights were extracted and placed in response
  assert.ok(executedRun.finalResponse);
  assert.ok(
    executedRun.finalResponse.includes('Summary saved as') ||
    executedRun.finalResponse.includes('Invoice located')
  );
});
