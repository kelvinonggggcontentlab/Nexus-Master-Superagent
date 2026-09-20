import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { nexusStore } from './server/db/store';
import { createExecutionPlan } from './server/agent/planner';
import { agentRuntime } from './server/agent/runtime';
import { contextEngine } from './server/context/contextEngine';
import { ExecutionRun, NexusMessage } from './src/types/nexus';
import {
  listPersonalities,
  getSessionPersonality,
  setSessionPersonality,
  resolvePersonality,
} from './server/agent/personality';
import {
  getExecutionMode,
  setExecutionMode,
  setActiveBearerToken,
} from './server/adapters';
import { authRouter } from './server/security/routes';
import { securityHeaders, rateLimit, extractSessionId } from './server/security/middleware';
import { securityManager } from './server/security';
import { runWithRequestContext } from './server/security/context';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(securityHeaders);

// Mount Security Gateway & WebAuthn Authentication Routes
app.use('/api/auth', authRouter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NEXUS MASTER SUPERAGENT™',
    owner: 'BLACKTOWER™',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// Conversations list
app.get('/api/conversations', (req, res) => {
  const sessions = nexusStore.getConversations();
  res.json({ sessions });
});

// Create conversation
app.post('/api/conversations', (req, res) => {
  const session = nexusStore.getOrCreateConversation();
  res.json({ session });
});

// Delete conversation
app.delete('/api/conversations/:id', (req, res) => {
  nexusStore.deleteConversation(req.params.id);
  res.json({ success: true });
});

// Messages for a conversation
app.get('/api/conversations/:id/messages', (req, res) => {
  const messages = nexusStore.getMessages(req.params.id);
  res.json({ messages });
});

// Context & Active Task for a conversation
app.get('/api/conversations/:id/context', (req, res) => {
  const activeTask = contextEngine.getActiveTask(req.params.id);
  const entities = contextEngine.getEntities(req.params.id);
  res.json({ activeTask, entities });
});

// Cancel active task in a conversation
app.post('/api/conversations/:id/cancel', (req, res) => {
  const cancelResult = contextEngine.cancelActiveTask(
    req.params.id,
    req.body.reason || 'User cancelled task'
  );
  res.json({ success: !!cancelResult, cancelResult });
});

// Personalities registry endpoints
app.get('/api/personalities', (req, res) => {
  res.json({
    personalities: listPersonalities(),
    default: 'malaysian_conversational',
  });
});

app.get('/api/conversations/:id/personality', (req, res) => {
  const personality = getSessionPersonality(req.params.id);
  res.json({
    conversationId: req.params.id,
    personalityId: personality.id,
    name: personality.name,
    locale: personality.locale,
    description: personality.description,
  });
});

app.post('/api/conversations/:id/personality', (req, res) => {
  const { personalityId } = req.body;
  const personality = setSessionPersonality(req.params.id, personalityId);
  res.json({
    conversationId: req.params.id,
    personalityId: personality.id,
    name: personality.name,
  });
});

// Primary Chat / Execution endpoint
app.post('/api/chat', rateLimit(60, 60000), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let bearerToken: string | undefined = undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        setActiveBearerToken(token);
        bearerToken = token;
      }
    }

    // Resolve session & user context
    const sessionId = extractSessionId(req) || 'sess_default';
    const validation = securityManager.validateSession(sessionId);
    const userId = validation.session?.userId || 'usr_blacktower_root';

    if (validation.valid && validation.session?.isEmergencyLocked) {
      return res.status(403).json({
        error: 'NEXUS EMERGENCY LOCK IS ACTIVE. All operations are halted.',
        code: 'EMERGENCY_LOCKED',
      });
    }

    const { conversationId, content, attachments, personality: requestedPersonality } = req.body;
    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message content or attachment required.' });
    }

    await runWithRequestContext(
      {
        userId,
        sessionId,
        deviceId: validation.session?.deviceId,
        bearerToken,
        ipAddress: req.ip,
      },
      async () => {
        const conv = nexusStore.getOrCreateConversation(conversationId, userId);

        // Resolve personality (either explicit request or session preset, defaulting to Malaysian)
        if (requestedPersonality) {
          setSessionPersonality(conv.id, requestedPersonality);
        }
        const activePersonality = getSessionPersonality(conv.id);

        // 1. Record User Message
        const userMsg: NexusMessage = {
          id: `msg_user_${Date.now().toString(36)}`,
          userId,
          role: 'user',
          content: content || 'Analyze attached document',
          timestamp: new Date().toISOString(),
          attachments: attachments || [],
        };
        nexusStore.addMessage(conv.id, userMsg, userId);

        // 2. Assemble Context (conversation, active task, references, intent, entities, personality)
        const context = contextEngine.assembleContext(userMsg.content, conv.id, 'operator', activePersonality);

        // 3. Create Execution Plan (Gemini or deterministic with context and dynamic personality)
        const plan = await createExecutionPlan(userMsg.content, conv.id, context, activePersonality);

        // 4. Initialize Execution Run
        const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        const executionRun: ExecutionRun = {
          id: runId,
          userId,
          conversationId: conv.id,
          userPrompt: userMsg.content,
          status: 'planning',
          plan,
          currentStepIndex: 0,
          stepsCompleted: 0,
          totalSteps: plan.steps.length,
          activeStatusText: plan.steps.length > 0 ? 'Synthesizing task graph...' : 'Processing contextual request...',
          results: {},
          verificationBadges: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        nexusStore.saveExecutionRun(executionRun, userId);

        // 5. Execute Autonomous Workflow (passing context and dynamic personality)
        const completedRun = await agentRuntime.executePlan(executionRun, undefined, context, activePersonality);

        // 6. Formulate Assistant Response
        const assistantMsg: NexusMessage = {
          id: `msg_ast_${Date.now().toString(36)}`,
          userId,
          role: 'assistant',
          content: completedRun.finalResponse || 'Action completed and verified.',
          timestamp: new Date().toISOString(),
          executionRun: completedRun,
        };
        nexusStore.addMessage(conv.id, assistantMsg, userId);

        res.json({
          message: assistantMsg,
          executionRun: completedRun,
        });
      }
    );
  } catch (error: any) {
    console.error('Chat execution error:', error);
    res.status(500).json({ error: error.message || 'Workflow execution error' });
  }
});

// Confirm step for actions requiring confirmation
app.post('/api/confirm-step', async (req, res) => {
  try {
    const { runId, stepId, confirmed } = req.body;
    const run = nexusStore.getExecutionRun(runId);
    if (!run) {
      return res.status(404).json({ error: 'Execution run not found' });
    }

    const step = run.plan.steps.find(s => s.id === stepId);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    if (!confirmed) {
      step.status = 'skipped';
      run.status = 'completed';
      run.finalResponse = 'Destructive operation was aborted by user.';
      nexusStore.saveExecutionRun(run);
      return res.json({ run });
    }

    step.confirmationGranted = true;
    const completedRun = await agentRuntime.executePlan(run);
    res.json({ run: completedRun });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Observability and Audit Logs
app.get('/api/observability', (req, res) => {
  const summary = nexusStore.getObservabilitySummary();
  res.json(summary);
});

// Integrations Status
app.get('/api/integrations', (req, res) => {
  const integrations = nexusStore.getIntegrations();
  const mode = getExecutionMode();
  res.json({ integrations, mode });
});

// Toggle Integration (useful for testing failure recovery in simulation/sandbox)
app.post('/api/integrations/toggle', (req, res) => {
  const { service, connected } = req.body;
  nexusStore.setIntegrationStatus(service, !!connected);
  res.json({ success: true, integrations: nexusStore.getIntegrations(), mode: getExecutionMode() });
});

// Switch Execution Mode (simulation sandbox vs live Google Workspace production)
app.get('/api/mode', (req, res) => {
  res.json({ mode: getExecutionMode() });
});

app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (mode === 'simulation' || mode === 'production') {
    setExecutionMode(mode);
    res.json({ success: true, mode: getExecutionMode() });
  } else {
    res.status(400).json({ error: 'Invalid mode. Must be simulation or production.' });
  }
});

// Memory API
app.get('/api/memory', (req, res) => {
  res.json({ memories: nexusStore.getMemories() });
});

app.post('/api/memory', (req, res) => {
  const { key, value, category } = req.body;
  if (!key || !value) return res.status(400).json({ error: 'Key and value required' });
  const mem = nexusStore.setMemory(key, value, category || 'preference');
  res.json({ memory: mem });
});

// Vite Middleware & Static Serving
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXUS Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
