import test from 'node:test';
import assert from 'node:assert/strict';
import { nexusStore } from '../server/db/store';

test('State Isolation: Conversations and Messages', () => {
  nexusStore.reset();

  const convA = nexusStore.getOrCreateConversation('conv_A');
  const convB = nexusStore.getOrCreateConversation('conv_B');

  assert.equal(convA.id, 'conv_A');
  assert.equal(convB.id, 'conv_B');

  nexusStore.addMessage('conv_A', {
    id: 'msg_a_1',
    role: 'user',
    content: 'User message in conversation A',
    timestamp: new Date().toISOString(),
  });

  nexusStore.addMessage('conv_B', {
    id: 'msg_b_1',
    role: 'user',
    content: 'User message in conversation B',
    timestamp: new Date().toISOString(),
  });

  const messagesA = nexusStore.getMessages('conv_A');
  const messagesB = nexusStore.getMessages('conv_B');

  assert.equal(messagesA.length, 1);
  assert.equal(messagesA[0].id, 'msg_a_1');
  assert.equal(messagesB.length, 1);
  assert.equal(messagesB[0].id, 'msg_b_1');

  // Verify deletion of conv_A leaves conv_B intact
  nexusStore.deleteConversation('conv_A');
  assert.equal(nexusStore.getMessages('conv_A').length, 0);
  assert.equal(nexusStore.getMessages('conv_B').length, 1);
});

test('State Isolation: Idempotency Key Scoping', () => {
  nexusStore.reset();

  const key1 = 'send_email_test_1';
  assert.equal(nexusStore.checkAndSetIdempotencyKey(key1), true, 'First check should succeed');
  assert.equal(nexusStore.checkAndSetIdempotencyKey(key1), false, 'Duplicate key should be rejected');

  const key2 = 'send_email_test_2';
  assert.equal(nexusStore.checkAndSetIdempotencyKey(key2), true, 'Distinct key should succeed');
});

test('State Isolation: Store Reset Cleans All Volatile Data', () => {
  nexusStore.setMemory('test_key', 'test_value', 'custom');
  assert.equal(nexusStore.getMemory('test_key'), 'test_value');

  nexusStore.reset();
  assert.equal(nexusStore.getMemory('test_key'), undefined);
  // Default rules exist
  assert.equal(nexusStore.getMemory('organization'), 'BLACKTOWER™');
});
