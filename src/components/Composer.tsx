import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Paperclip, Mic, MicOff, X, FileText, Sparkles } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (text: string, attachments?: Array<{ name: string; type: string; size: number; previewContent?: string }>) => void;
  isLoading?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size: number; previewContent?: string }>>([]);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Voice dictation initialization with Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript.trim()) {
          setInput(prev => (prev ? `${prev} ${currentTranscript}` : currentTranscript));
        }
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. You can type directly.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setIsListening(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).map(file => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      previewContent: file.name,
    }));

    setAttachments(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    onSendMessage(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="sticky bottom-0 z-20 pb-4 pt-2 px-4 sm:px-6 bg-gradient-to-t from-[#07080a] via-[#07080a]/95 to-transparent">
      <div className="max-w-3xl mx-auto">
        {/* Attachment preview tags */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-xl bg-[#111318] border border-white/[0.08]">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] text-xs text-slate-200 border border-white/[0.08]"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="p-0.5 hover:text-rose-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Composer Box */}
        <div
          className={`relative flex items-end rounded-2xl bg-[#111318] border ${
            isListening ? 'border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.2)]' : 'border-white/[0.1] focus-within:border-cyan-500/40'
          } shadow-lg transition-all`}
        >
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Paperclip upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-200 active:text-cyan-400 transition-colors flex-shrink-0"
            title="Attach file or document"
            aria-label="Attach file or document"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Multiline auto-expanding textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              isListening
                ? 'Listening to voice command...'
                : 'What do you need done? (e.g. "Find my latest invoice, summarize it and save next to original")'
            }
            className="flex-1 max-h-40 py-3 px-1 text-sm bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none overflow-y-auto leading-relaxed"
          />

          {/* Voice Input Button */}
          <button
            type="button"
            onClick={toggleListening}
            className={`p-3 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors flex-shrink-0 ${
              isListening
                ? 'text-cyan-400 animate-pulse'
                : 'text-slate-400 hover:text-slate-200 active:text-cyan-400'
            }`}
            title={isListening ? 'Stop voice recording' : 'Speak command'}
            aria-label={isListening ? 'Stop voice recording' : 'Speak command'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            className={`m-1.5 p-2.5 min-w-[42px] min-h-[42px] rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
              (input.trim() || attachments.length > 0) && !isLoading
                ? 'bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-black shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'bg-white/[0.04] text-slate-600 cursor-not-allowed'
            }`}
            title="Send"
            aria-label="Send"
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Micro-footnote */}
        <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>BLACKTOWER™ Autonomous Master Runtime</span>
          </div>
          <span className="hidden sm:inline">Shift+Return for newline</span>
        </div>
      </div>
    </div>
  );
};
