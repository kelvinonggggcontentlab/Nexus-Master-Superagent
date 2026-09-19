import test from 'node:test';
import assert from 'node:assert/strict';
import { contextEngine } from '../server/context/contextEngine';
import { createExecutionPlan } from '../server/agent/planner';
import { agentRuntime } from '../server/agent/runtime';
import { nexusStore } from '../server/db/store';
import { ExecutionRun, NexusMessage } from '../src/types/nexus';

test('Context Intelligence Engine: Movement 02 Test Suite', async (t) => {
  // Helper to simulate a chat turn in a conversation
  async function simulateChatTurn(
    conversationId: string,
    content: string,
    userId: string = 'operator'
  ) {
    const conv = nexusStore.getOrCreateConversation(conversationId);
    const userMsg: NexusMessage = {
      id: `msg_user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    nexusStore.addMessage(conv.id, userMsg);

    const context = contextEngine.assembleContext(content, conv.id, userId);
    const plan = await createExecutionPlan(content, conv.id, context);

    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`;
    const executionRun: ExecutionRun = {
      id: runId,
      conversationId: conv.id,
      userPrompt: content,
      status: 'planning',
      plan,
      currentStepIndex: 0,
      stepsCompleted: 0,
      totalSteps: plan.steps.length,
      activeStatusText: 'Processing...',
      results: {},
      verificationBadges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    nexusStore.saveExecutionRun(executionRun);

    const completedRun = await agentRuntime.executePlan(executionRun, undefined, context);

    const assistantMsg: NexusMessage = {
      id: `msg_ast_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
      role: 'assistant',
      content: completedRun.finalResponse || 'Action complete',
      timestamp: new Date().toISOString(),
      executionRun: completedRun,
    };
    nexusStore.addMessage(conv.id, assistantMsg);

    return { completedRun, assistantMsg, context };
  }

  // Reset before test suite
  nexusStore.reset();
  contextEngine.reset();

  await t.test('TEST 1: New task initialization and entity registration', async () => {
    const convId = 'conv_test_1';
    const { completedRun, context } = await simulateChatTurn(
      convId,
      'Find invoice in Drive'
    );

    assert.equal(context.intent, 'NEW_TASK');
    assert.equal(completedRun.status, 'completed');
    assert.ok(completedRun.results.search_drive);
    assert.ok(completedRun.results.search_drive.files.length > 0);

    const entities = contextEngine.getEntities(convId);
    const hasFile = entities.some(e => e.type === 'file' && e.label.includes('Invoice'));
    assert.ok(hasFile, 'File entity should be registered from search_drive results');
  });

  await t.test('TEST 2: Follow-up referring to previous result ("Show me the details")', async () => {
    const convId = 'conv_test_2';
    // Turn 1: Find invoice
    await simulateChatTurn(convId, 'Find invoice in Drive');

    // Turn 2: Follow-up query
    const { completedRun, context } = await simulateChatTurn(convId, 'Show me the details');

    assert.equal(context.intent, 'QUERY_RESULT');
    assert.equal(completedRun.plan.steps.length, 0, 'Should not invoke redundant tool executions');
    assert.equal(completedRun.status, 'completed');
    assert.ok(completedRun.finalResponse?.includes('Details for'));
    assert.ok(completedRun.finalResponse?.includes('INV-2026-8812'));
  });

  await t.test('TEST 3: Pronoun and reference resolution ("Summarize it")', async () => {
    const convId = 'conv_test_3';
    await simulateChatTurn(convId, 'Find invoice in Drive');

    // "Summarize it" must resolve "it" to the previously found invoice
    const { completedRun, context } = await simulateChatTurn(convId, 'Summarize it');

    assert.equal(context.intent, 'CONTINUE_TASK');
    assert.ok(context.resolvedReferences.target_file, 'Should resolve target_file reference');
    assert.ok(context.resolvedReferences.target_file.identifier.includes('file_inv'));

    // Step 1 should read the resolved file ID, not execute search_drive again
    assert.equal(completedRun.plan.steps[0].tool, 'read_drive_file');
    assert.equal(completedRun.plan.steps[0].parameters.fileId, context.resolvedReferences.target_file.identifier);
    assert.equal(completedRun.status, 'completed');
    assert.ok(completedRun.results.analyze_document);
  });

  await t.test('TEST 4: Task modification ("Actually send it to operator.backup@example.com instead")', async () => {
    const convId = 'conv_test_4';
    await simulateChatTurn(convId, 'Find invoice in Drive');
    await simulateChatTurn(convId, 'Summarize it');

    // User modifies recipient
    const { context } = await simulateChatTurn(
      convId,
      'Actually send it to operator.backup@example.com instead'
    );

    assert.equal(context.intent, 'MODIFY_TASK');
    const activeTask = contextEngine.getActiveTask(convId);
    assert.ok(activeTask);
    assert.ok(activeTask.userModifications.length > 0);
  });

  await t.test('TEST 5: Task cancellation ("Don\'t send it" / "Stop")', async () => {
    const convId = 'conv_test_5';
    await simulateChatTurn(convId, 'Find invoice in Drive');
    await simulateChatTurn(convId, 'Summarize it');

    // User cancels
    const { completedRun, context } = await simulateChatTurn(convId, "Don't send it yet. Stop.");

    assert.equal(context.intent, 'CANCEL_TASK');
    assert.equal(completedRun.status, 'cancelled');
    assert.ok(completedRun.finalResponse?.includes('Task cancelled'));

    const activeTask = contextEngine.getActiveTask(convId);
    assert.equal(activeTask?.status, 'cancelled');
    assert.equal(activeTask?.pendingSteps.length, 0);
  });

  await t.test('TEST 6: Previous tool result reuse without re-execution', async () => {
    const convId = 'conv_test_6';
    await simulateChatTurn(convId, 'Find invoice in Drive');
    await simulateChatTurn(convId, 'Summarize it');

    // User asks to prepare an email with that summary
    const { completedRun } = await simulateChatTurn(convId, 'Prepare an email with that summary');

    // Must use draft_email, not re-search or re-read
    assert.equal(completedRun.plan.steps.length, 1);
    assert.equal(completedRun.plan.steps[0].tool, 'draft_email');
    assert.ok(completedRun.results.draft_email);
    assert.equal(completedRun.results.draft_email.status, 'draft_prepared');
  });

  await t.test('TEST 7: Ambiguous reference requiring clarification', async () => {
    const convId = 'conv_test_7';
    // Inject two files in the conversation context
    contextEngine.addEntities(convId, [
      {
        id: 'file_1',
        type: 'file',
        identifier: 'f_101',
        label: 'Invoice_January.pdf',
        source: 'google_drive',
        confidence: 1.0,
        conversationId: convId,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'file_2',
        type: 'file',
        identifier: 'f_102',
        label: 'Invoice_February.pdf',
        source: 'google_drive',
        confidence: 1.0,
        conversationId: convId,
        updatedAt: new Date().toISOString(),
      },
    ]);

    // User says "Delete it" without specifying which file
    const { completedRun, context } = await simulateChatTurn(convId, 'Delete it');

    assert.equal(context.intent, 'CLARIFY');
    assert.ok(context.ambiguities && context.ambiguities.length > 0);
    assert.ok(completedRun.finalResponse?.includes('Which one do you want to delete?'));
    assert.equal(completedRun.plan.steps.length, 0, 'Destructive operation must not proceed with ambiguous reference');
  });

  await t.test('TEST 8: Context isolation between distinct conversations/users', async () => {
    const convUserA = 'conv_user_A';
    const convUserB = 'conv_user_B';

    // User A searches for invoices
    await simulateChatTurn(convUserA, 'Find invoice in Drive', 'user_a');
    const entitiesA = contextEngine.getEntities(convUserA);
    assert.ok(entitiesA.length > 0);

    // User B in a separate conversation has zero entities initially
    const entitiesB = contextEngine.getEntities(convUserB);
    assert.equal(entitiesB.length, 0, 'User B must have empty isolated context');

    // Querying details in User B without previous search must not return User A files
    const resB = await simulateChatTurn(convUserB, 'Show me the details', 'user_b');
    assert.ok(!resB.completedRun.finalResponse?.includes('INV-2026-8812'));
  });

  await t.test('TEST 9: Multiple entities with correct reference selection', async () => {
    const convId = 'conv_test_9';
    await simulateChatTurn(convId, 'Find invoice in Drive');
    await simulateChatTurn(convId, 'Summarize it');

    // The context now has a file, an amount, and a summary.
    // Query specifically about the amount
    const { completedRun } = await simulateChatTurn(convId, 'What was the amount?');
    assert.ok(completedRun.finalResponse?.includes('MYR 45,900.00') || completedRun.finalResponse?.includes('45,900'));
  });

  await t.test('TEST 10: Old instruction overridden by newer explicit instruction', async () => {
    const convId = 'conv_test_10';
    await simulateChatTurn(convId, 'Find invoice in Drive');
    await simulateChatTurn(convId, 'Summarize it');

    // User first says email to Alice
    const turn1 = await simulateChatTurn(convId, 'Prepare an email with that summary to alice@example.com');
    assert.equal(turn1.completedRun.results.draft_email?.recipient, 'alice@example.com');

    // User then updates: Actually send it to bob@example.com instead
    const activeTask = contextEngine.getActiveTask(convId);
    assert.ok(activeTask);

    const mod = contextEngine.modifyActiveTask(
      convId,
      { recipient: 'bob@example.com' },
      'Actually send it to bob@example.com instead'
    );
    assert.ok(mod);
    assert.ok(mod.steps.some(s => s.parameters.to === 'bob@example.com'));
    assert.ok(mod.userModifications.includes('Actually send it to bob@example.com instead'));
  });

  await t.test('TEST 11: Follow-up question answered without unnecessary tool execution', async () => {
    const convId = 'conv_test_11';
    await simulateChatTurn(convId, 'Find invoice in Drive');

    const { completedRun } = await simulateChatTurn(convId, 'When was it received?');
    assert.equal(completedRun.plan.steps.length, 0, 'No tools should be invoked for pure context query');
    assert.ok(
      completedRun.finalResponse?.includes('30 September 2026') ||
      completedRun.finalResponse?.includes('date') ||
      completedRun.finalResponse?.includes('September')
    );
  });

  await t.test('TEST 12: Context preserved across multi-step workflow', async () => {
    const convId = 'conv_test_12';
    // Step A
    await simulateChatTurn(convId, 'Find invoice in Drive');
    const taskA = contextEngine.getActiveTask(convId);
    assert.ok(taskA);

    // Step B
    await simulateChatTurn(convId, 'Summarize it');
    const taskB = contextEngine.getActiveTask(convId);
    assert.ok(taskB);
    assert.ok(taskB.toolResults.analyze_document);

    // Step C
    await simulateChatTurn(convId, 'Email that to operator@example.com');
    const taskC = contextEngine.getActiveTask(convId);
    assert.ok(taskC);
    assert.ok(taskC.toolResults.send_email);
    assert.equal(taskC.toolResults.send_email.recipient, 'operator@example.com');
  });

  await t.test('REQUIRED END-TO-END SCENARIO (Section 21)', async () => {
    const convId = 'conv_e2e_scenario';
    contextEngine.reset(convId);

    // Turn 1: USER: “Find my latest invoice.”
    // NEXUS: searches Drive.
    const turn1 = await simulateChatTurn(convId, 'Find my latest invoice.');
    assert.equal(turn1.completedRun.status, 'completed');
    assert.ok(turn1.completedRun.results.search_drive, 'Invoice must be found in Drive');
    assert.ok(turn1.completedRun.results.search_drive.files.length > 0);
    const invoiceFile = turn1.completedRun.results.search_drive.files[0];
    assert.ok(invoiceFile.name.toLowerCase().includes('invoice'));

    // Turn 2: USER: “Show me the details.”
    // NEXUS: uses the previously identified invoice without redundant search.
    const turn2 = await simulateChatTurn(convId, 'Show me the details.');
    assert.equal(turn2.context.intent, 'QUERY_RESULT');
    assert.equal(turn2.completedRun.plan.steps.length, 0, 'No redundant search tool call');
    assert.ok(turn2.completedRun.finalResponse?.includes(invoiceFile.name));
    assert.ok(turn2.completedRun.finalResponse?.includes('INV-2026-8812'));

    // Turn 3: USER: “Summarize it.”
    // NEXUS: uses the same invoice.
    const turn3 = await simulateChatTurn(convId, 'Summarize it.');
    assert.equal(turn3.context.intent, 'CONTINUE_TASK');
    assert.equal(turn3.completedRun.plan.steps[0].tool, 'read_drive_file');
    assert.equal(turn3.completedRun.plan.steps[0].parameters.fileId, invoiceFile.id);
    assert.ok(turn3.completedRun.results.analyze_document, 'Summary must be generated');

    // Turn 4: USER: “Prepare an email with that summary.”
    // NEXUS: creates the next task using the existing summary.
    const turn4 = await simulateChatTurn(convId, 'Prepare an email with that summary.');
    assert.equal(turn4.completedRun.plan.steps.length, 1);
    assert.equal(turn4.completedRun.plan.steps[0].tool, 'draft_email');
    assert.ok(turn4.completedRun.results.draft_email, 'Email must be prepared as draft');
    assert.equal(turn4.completedRun.results.draft_email.status, 'draft_prepared');

    // Turn 5: USER: “Don't send it yet.”
    // NEXUS: stops before the send action.
    const turn5 = await simulateChatTurn(convId, "Don't send it yet.");
    assert.equal(turn5.context.intent, 'CANCEL_TASK');
    assert.equal(turn5.completedRun.status, 'cancelled');

    // Verify final state requirements from Section 21:
    // - invoice found
    // - invoice verified
    // - summary generated
    // - email prepared
    // - email NOT sent
    const activeTask = contextEngine.getActiveTask(convId);
    assert.ok(activeTask, 'Active task context must survive');

    const searchResult = activeTask.toolResults.search_drive;
    assert.ok(searchResult && searchResult.files.length > 0, 'Invoice found');

    const analysisResult = activeTask.toolResults.analyze_document;
    assert.ok(analysisResult && analysisResult.summaryLines.length > 0, 'Summary generated');

    const draftResult = activeTask.toolResults.draft_email;
    assert.ok(draftResult && draftResult.status === 'draft_prepared', 'Email prepared');

    const sendResult = activeTask.toolResults.send_email;
    assert.equal(sendResult, undefined, 'Email NOT sent');

    assert.equal(activeTask.status, 'cancelled', 'Final state reflects halt before send action');
  });
});
