'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

const welcome: Message = { role: 'assistant', content: 'Merhaba, ben KERO. Nasıl yardımcı olabilirim?' };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('kero-chat-v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')) setMessages(parsed);
      } catch { /* Ignore invalid local data. */ }
    }
    const browser = window as any;
    setVoiceAvailable(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    return () => {
      activeRef.current = false;
      recognitionRef.current?.abort?.();
      controllerRef.current?.abort();
      window.speechSynthesis?.cancel();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => { localStorage.setItem('kero-chat-v1', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  function endVoice() {
    activeRef.current = false;
    setVoiceMode(false);
    setVoiceState('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    controllerRef.current?.abort();
    window.speechSynthesis?.cancel();
    busyRef.current = false;
    setBusy(false);
  }

  function listen() {
    if (!activeRef.current || busyRef.current) return;
    const browser = window as any;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) { setVoiceAvailable(false); endVoice(); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = false;
    let handled = false;
    recognition.onstart = () => setVoiceState('listening');
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript && !handled) {
        handled = true;
        recognitionRef.current = null;
        void sendMessage(transcript, true);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') { endVoice(); return; }
      setVoiceState('idle');
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!handled && activeRef.current && !busyRef.current) timerRef.current = setTimeout(listen, 450);
    };
    try { recognition.start(); } catch { setVoiceState('idle'); }
  }

  function speak(text: string) {
    if (!activeRef.current || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    const turkish = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('tr'));
    if (turkish) utterance.voice = turkish;
    utterance.onstart = () => setVoiceState('speaking');
    utterance.onend = utterance.onerror = () => {
      setVoiceState('idle');
      if (activeRef.current) timerRef.current = setTimeout(listen, 350);
    };
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(raw: string, fromVoice = false) {
    const content = raw.trim();
    if (!content || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content }]);
    setVoiceState('thinking');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('API hatası');
      const data = await response.json();
      const reply = typeof data.reply === 'string' ? data.reply : 'Yanıt alınamadı.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      if (fromVoice && activeRef.current) speak(reply);
      else setVoiceState('idle');
    } catch {
      if (!controller.signal.aborted) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Bağlantı kurulamadı. Lütfen tekrar dene.' }]);
        setVoiceState('idle');
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      busyRef.current = false;
      setBusy(false);
      if (fromVoice && activeRef.current && !window.speechSynthesis?.speaking && !controller.signal.aborted) {
        timerRef.current = setTimeout(() => { if (activeRef.current && !window.speechSynthesis?.speaking) listen(); }, 1200);
      }
    }
  }

  function toggleVoice() {
    if (voiceMode) { endVoice(); return; }
    if (!voiceAvailable) return;
    activeRef.current = true;
    setVoiceMode(true);
    listen();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function clearChat() {
    endVoice();
    setMessages([welcome]);
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">✦</span><span>KERO</span></div>
        <button className="newChat" onClick={clearChat}>＋ Yeni sohbet</button>
        <div className="sidebarBottom"><span className="statusDot" /> Yapay zekâ asistanın</div>
      </aside>
      <section className="workspace">
        <header className="topbar"><strong>KERO</strong><span>Akıllı asistan</span></header>
        <div className="messageArea" ref={scrollRef}>
          <div className="messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                {message.role === 'assistant' && <span className="messageSymbol">✦</span>}
                <div className="bubble">{message.content}</div>
              </div>
            ))}
            {busy && <div className="message assistant"><span className="messageSymbol">✦</span><div className="bubble muted">KERO düşünüyor…</div></div>}
          </div>
        </div>
        <div className="composerWrap">
          <form className="composer" onSubmit={submit}>
            <input aria-label="Mesaj" placeholder="KERO'ya bir şey sor…" value={input} onChange={e => setInput(e.target.value)} />
            <button type="button" className="voiceToggle" onClick={toggleVoice} title="Sesli sohbet" aria-label="Sesli sohbet">◉</button>
            <button type="submit" className="sendButton" disabled={busy || !input.trim()} aria-label="Gönder">↑</button>
          </form>
          <small>KERO yanıtları önemli konularda doğrulanmalıdır.</small>
        </div>
      </section>
      {voiceMode && <div className="voiceOverlay" role="dialog" aria-modal="true" aria-label="KERO sesli sohbet">
        <button className="closeVoice" onClick={endVoice} aria-label="Sesli sohbeti kapat">✕</button>
        <div className={`voiceOrb ${voiceState}`} aria-hidden="true"><div className="orbCore" /></div>
        <div className="voiceStatus">{voiceState === 'listening' ? 'Dinliyorum' : voiceState === 'thinking' ? 'Düşünüyorum' : voiceState === 'speaking' ? 'Konuşuyorum' : 'Sesli sohbet hazır'}</div>
        <button className="endVoice" onClick={endVoice}>Görüşmeyi bitir</button>
      </div>}
    </main>
  );
}
