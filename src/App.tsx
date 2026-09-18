import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { ObservabilityDrawer } from './components/ObservabilityDrawer';
import { HistoryDrawer } from './components/HistoryDrawer';
import { SettingsModal } from './components/SettingsModal';
import { InteractiveBackground } from './components/InteractiveBackground';
import { ConversationSession, NexusMessage } from './types/nexus';

export default function App() {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [messages, setMessages] = useState<NexusMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Drawers / Modals
  const [isObservabilityOpen, setIsObservabilityOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Fetch conversations on load
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (data.sessions && data.sessions.length > 0 && !currentSessionId) {
          // Select most recent session or stay empty
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
      const res = await fetch(`/api/conversations/${sessionId}/messages`);
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
      const res = await fetch('/api/conversations', { method: 'POST' });
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
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        handleNewChat();
      }
    } catch (e) {
      console.error(e);
    }
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
      attachments: attachments?.map(a => ({
        name: a.name,
        type: a.type,
        size: a.size,
      })),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentSessionId,
          content: text,
          attachments,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Append assistant message with execution run
        setMessages(prev => [...prev, data.message]);
        // Refresh session list to update titles/timestamps
        loadSessions();
      } else {
        const err = await res.json();
        const errorMsg: NexusMessage = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `I encountered an issue executing this workflow: ${err.error || 'Execution interrupted.'}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (e: any) {
      const errorMsg: NexusMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Connection error: Could not reach NEXUS execution server.`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmStep = async (runId: string, stepId: string, confirmed: boolean) => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/confirm-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, stepId, confirmed }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update the message containing this run
        setMessages(prev =>
          prev.map(m => {
            if (m.executionRun?.id === runId) {
              return {
                ...m,
                content: data.run.finalResponse || m.content,
                executionRun: data.run,
              };
            }
            return m;
          })
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

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
      />
    </div>
  );
}
