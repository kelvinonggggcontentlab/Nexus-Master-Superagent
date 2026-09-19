import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SimulationDriveAdapter,
  SimulationEmailAdapter,
  SimulationCalendarAdapter,
  SimulationDocumentAnalysisAdapter,
  SimulationCalculationAdapter,
  createProductionAdapters,
} from '../server/adapters';

test('Simulation Drive Adapter: Truth in Labeling & Sandbox Execution', async () => {
  const drive = new SimulationDriveAdapter();
  assert.equal(drive.mode, 'simulation');

  // Search
  const searchRes = await drive.searchFiles('Maybank');
  assert.ok(searchRes.files.length > 0);
  assert.equal(searchRes.verification.isSimulated, true);
  assert.ok(searchRes.verification.message.includes('[Simulation Sandbox]'));

  // Read
  const readRes = await drive.readFile(searchRes.files[0].id);
  assert.ok(readRes.file.content.length > 0);
  assert.equal(readRes.verification.isSimulated, true);

  // Create
  const createRes = await drive.createFile('Test_Audit.txt', 'Audit content for testing', '/Audit');
  assert.equal(createRes.file.name, 'Test_Audit.txt');
  assert.equal(createRes.verification.isSimulated, true);

  // Move
  const moveRes = await drive.moveFile(createRes.file.id, '/Archived');
  assert.equal(moveRes.moved.newFolder, '/Archived');

  // Delete
  const delRes = await drive.deleteFile(createRes.file.id);
  assert.equal(delRes.deleted.id, createRes.file.id);
});

test('Simulation Email Adapter: Dispatch & Idempotency in Sandbox', async () => {
  const email = new SimulationEmailAdapter();
  assert.equal(email.mode, 'simulation');

  const sendRes = await email.sendEmail('client@test.org', 'Billing Notice', 'Please review statement.');
  assert.equal(sendRes.sent.status, 'simulated_dispatched');
  assert.equal(sendRes.verification.isSimulated, true);
  assert.ok(sendRes.verification.message.includes('[Simulation Sandbox]'));
});

test('Simulation Calendar Adapter: Availability Detection', async () => {
  const calendar = new SimulationCalendarAdapter();
  assert.equal(calendar.mode, 'simulation');

  const checkRes = await calendar.checkCalendar('2026-09-18');
  assert.ok(checkRes.availableFreeSlots.length > 0);
  assert.equal(checkRes.verification.isSimulated, true);

  const createRes = await calendar.createEvent('Strategy Alignment', '10:30', '11:30', ['colleague@test.org']);
  assert.equal(createRes.event.title, 'Strategy Alignment');
  assert.equal(createRes.verification.isSimulated, true);
});

test('Document Analysis Adapter: Real Entity Extraction & Text Diffing', async () => {
  const doc = new SimulationDocumentAnalysisAdapter();

  const sampleInvoice = `ACME CORP INVOICE
Invoice No: INV-9921
Date: 12 October 2026
Vendor: services@acme.corp
Amount Due: USD 12,450.00
Tax: USD 996.00`;

  const analysis = await doc.analyze(sampleInvoice, 'summarize');
  assert.equal(analysis.analysis.lineCount, 6);
  assert.ok(analysis.analysis.extractedEntities.invoiceNumbers.includes('INV-9921'));
  assert.ok(analysis.analysis.extractedEntities.emails.includes('services@acme.corp'));
  assert.ok(analysis.analysis.extractedEntities.monetaryValues.some(m => m.includes('12,450.00')));

  // Text diffing
  const version1 = 'Line 1\nLine 2\nLine 3';
  const version2 = 'Line 1\nLine 2 (updated)\nLine 3\nLine 4 (new)';
  const diffResult = await doc.analyze(version2, 'diff', version1);
  assert.ok(diffResult.analysis.comparison);
  assert.ok(diffResult.analysis.comparison.addedLinesCount > 0);
});

test('Calculation Adapter: Deterministic Financial Arithmetic', async () => {
  const calc = new SimulationCalculationAdapter();

  const r1 = await calc.evaluate('45900 * 0.08', '8% SST');
  assert.equal(r1.result, 3672);
  assert.equal(r1.formattedResult, '3,672');

  const r2 = await calc.evaluate('1482900 - 45900', 'Balance deduction');
  assert.equal(r2.result, 1437000);
  assert.equal(r2.formattedResult, '1,437,000');

  // Handles percentage shorthand
  const r3 = await calc.evaluate('5000 * 15%', '15% bonus');
  assert.equal(r3.result, 750);
});

test('Production Adapters: Guard Live Credentials & Prevent False Success', async () => {
  delete process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN;
  delete process.env.GOOGLE_DRIVE_API_KEY;
  delete process.env.GMAIL_ACCESS_TOKEN;

  const prod = createProductionAdapters();
  assert.equal(prod.drive.mode, 'production');
  assert.equal(prod.email.mode, 'production');

  // Should fail with clear credential error, NOT pretend to execute
  await assert.rejects(
    async () => {
      await prod.drive.searchFiles('invoice');
    },
    /GOOGLE_WORKSPACE_ACCESS_TOKEN/
  );

  await assert.rejects(
    async () => {
      await prod.email.sendEmail('test@example.com', 'Sub', 'Body');
    },
    /GMAIL_ACCESS_TOKEN/
  );
});
