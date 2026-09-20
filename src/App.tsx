import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { ObservabilityDrawer } from './components/ObservabilityDrawer';
import { HistoryDrawer } from './components/HistoryDrawer';
import { SettingsModal } from './components/SettingsModal';
import { InteractiveBackground } from './components/InteractiveBackground';
import { SecureLandingGateway } from './components/SecureLandingGateway';
import { ConversationSession, NexusMessage } from './types/nexus';
import { getAccessToken } from './lib/googleAuth';

export default function App() {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [messages, setMessages] = useState<NexusMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Security Gateway & Session State (Movement 03)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isEmergencyLocked, setIsEmergencyLocked] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [securityChecked, setSecurityChecked] = useState<boolean>(false);

  // Drawers / Modals
  const [isObservabilityOpen, setIsObservabilityOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Check initial security state and existing session token on load
  useEffect(() => {
    checkSecurityPosture();
  }, []);

  const checkSecurityPosture = async () => {
    try {
      const storedToken = localStorage.getItem('nexus_session_token');
      const res = await fetch('/api/auth/status', {
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setIsEmergencyLocked(!!data.isLocked);
        if (data.authenticated && !data.isLocked) {
          setIsAuthenticated(true);
          setSessionToken(storedToken || data.sessionId);
          loadSessions();
        } else {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error('Failed to verify security posture', e);
      setIsAuthenticated(false);
    } finally {
      setSecurityChecked(true);
    }
  };

  const loadSessions = async () => {
    try {
      const storedToken = localStorage.getItem('nexus_session_token');
      const res = await fetch('/api/conversations', {
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (data.sessions && data.sessions.length > 0 && !currentSessionId) {
          const first = data.sessions[0];
          setCurrentSessionId(first.id);
          loadMessages(first.id);
        }
      }
    } catch (e) {
      console.error('Failed to load conversations', e);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const storedToken = localStorage.getItem('nexus_session_token');
      const res = await fetch(`/api/conversations/${sessionId}/messages`, {
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  };

  const handleNewChat = async () => {
    try {
      const storedToken = localStorage.getItem('nexus_session_token');
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const newSession = data.session;
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to create new chat', e);
    }
  };

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    loadMessages(id);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      const storedToken = localStorage.getItem('nexus_session_token');
      await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        handleNewChat();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Emergency Lock Action: Terminates session, freezes tools, returns to Gateway
  const handleEmergencyLock = async () => {
    try {
      const storedToken = localStorage.getItem('nexus_session_token');
      await fetch('/api/auth/emergency-lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        },
      });
      localStorage.removeItem('nexus_session_token');
      setIsAuthenticated(false);
      setIsEmergencyLocked(true);
      setSessionToken(null);
    } catch (e) {
      console.error('Failed to engage emergency lock', e);
      setIsAuthenticated(false);
      setIsEmergencyLocked(true);
    }
  };

  const handleAuthenticated = (token: string) => {
    setSessionToken(token);
    setIsAuthenticated(true);
    setIsEmergencyLocked(false);
    loadSessions();
  };

  const handleSendMessage = async (
    text: string,
    attachments?: Array<{ name: string; type: string; size: number; previewContent?: string }>
  ) => {
    if (!text.trim() && (!attachments || attachments.length === 0)) return;

    // Optimistically show user message
    const tempUserMsg: NexusMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: attachments || [],
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      // Fetch fresh Google OAuth token if available
      const googleToken = await getAccessToken();
      const storedSessionToken = localStorage.getItem('nexus_session_token');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (googleToken) {
        headers['Authorization'] = `Bearer ${googleToken}`;
      }
      if (storedSessionToken) {
        headers['x-nexus-session'] = storedSessionToken;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId: currentSessionId || undefined,
          content: text,
          attachments,
        }),
      });

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.code === 'EMERGENCY_LOCKED') {
          setIsEmergencyLocked(true);
          setIsAuthenticated(false);
          return;
        }
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server error occurred during execution');
      }

      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, data.message]);
      }

      // If a new conversation was created implicitly by the backend, refresh session list
      if (!currentSessionId && data.message?.executionRun?.conversationId) {
        setCurrentSessionId(data.message.executionRun.conversationId);
        loadSessions();
      }
    } catch (error: any) {
      console.error('Workflow error:', error);
      const errorMsg: NexusMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Error executing workflow: ${error.message || 'Unknown network error'}. Verify Google Workspace credentials or check Observability logs.`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmStep = async (runId: string, stepId: string) => {
    try {
      setIsLoading(true);
      const googleToken = await getAccessToken();
      const storedSessionToken = localStorage.getItem('nexus_session_token');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (googleToken) {
        headers['Authorization'] = `Bearer ${googleToken}`;
      }
      if (storedSessionToken) {
        headers['x-nexus-session'] = storedSessionToken;
      }

      const res = await fetch('/api/confirm-step', {
        method: 'POST',
        headers,
        body: JSON.stringify({ runId, stepId }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update the message carrying this execution run
        setMessages(prev =>
          prev.map(msg => {
            if (msg.executionRun?.id === runId) {
              return {
                ...msg,
                executionRun: data.run,
                content: data.run.finalResponse || msg.content,
              };
            }
            return msg;
          })
        );
      }
    } catch (e) {
      console.error('Failed to confirm step', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Movement 03 Secure Landing Gateway: Unauthenticated or Emergency Locked state
  if (securityChecked && (!isAuthenticated || isEmergencyLocked)) {
    return (
      <SecureLandingGateway
        onAuthenticated={handleAuthenticated}
        isEmergencyLocked={isEmergencyLocked}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#07080a] text-slate-100 selection:bg-cyan-500/20 selection:text-cyan-200 relative overflow-x-hidden">
      {/* 120Hz Ultra-Responsive Interactive Background */}
      <InteractiveBackground />

      {/* Top Header */}
      <Header
        onNewChat={handleNewChat}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenObservability={() => setIsObservabilityOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onEmergencyLock={handleEmergencyLock}
        isLocked={isEmergencyLocked}
      />

      {/* Main Conversational Canvas */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden w-full">
        <MessageList
          messages={messages}
          onSelectPrompt={prompt => handleSendMessage(prompt)}
          onConfirmStep={handleConfirmStep}
          isLoading={isLoading}
        />

        {/* Intelligent Composer Bar */}
        <Composer onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>

      {/* Secondary Drawers & Modals (Protected, Non-Intrusive) */}
      <ObservabilityDrawer
        isOpen={isObservabilityOpen}
        onClose={() => setIsObservabilityOpen(false)}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLockNexus={handleEmergencyLock}
      />
    </div>
  );
}
