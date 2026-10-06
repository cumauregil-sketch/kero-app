'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

const stateLabel: Record<AvatarState, string> = {
  idle: 'Hazır',
  listening: 'Dinliyor',
  thinking: 'Düşünüyor',
  speaking: 'Konuşuyor',
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'KERO hazır. Konuşmak için mikrofona dokun.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [voiceSupported, setVoiceSupported] = useState<boolean | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);\n  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const motionUrl = '/api/motion';
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';

  useEffect(() => {
    const browser = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    setVoiceSupported(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));

    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate =
      avatarState === 'speaking' ? 1 :
      avatarState === 'listening' ? 0.78 :
      avatarState === 'thinking' ? 0.62 : 0.45;
  }, [avatarState]);

  function speakReply(text: string) {
    if (!('speechSynthesis' in window)) {
      setAvatarState('idle');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.02;
    utterance.pitch = 0.92;

    const voices = window.speechSynthesis.getVoices();
    const turkish = voices.find((voice) => voice.lang.toLowerCase().startsWith('tr'));
    if (turkish) utterance.voice = turkish;

    utterance.onstart = () => setAvatarState('speaking');
    utterance.onend = () => setAvatarState('idle');
    utterance.onerror = () => setAvatarState('idle');
    window.speechSynthesis.speak(utterance);
  }

  async function sendText(rawText: string) {
    const text = rawText.trim();
    if (!text || busy) return;

    window.speechSynthesis?.cancel();
    setMessages((current) => [...current, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    setAvatarState('thinking');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) throw new Error('API hatası');
      const data = await response.json();
      const reply = typeof data.reply === 'string' ? data.reply : 'Yanıt hazır.';
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      speakReply(reply);
    } catch {
      const reply = 'Backend bağlantısı kurulamadı. API adresini kontrol et.';
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      setAvatarState('idle');
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    if (busy) return;

    window.speechSynthesis?.cancel();

    const browser = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const SpeechRecognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setShowKeyboard(true);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setAvatarState('listening');
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) void sendText(transcript);
    };
    recognition.onerror = () => setAvatarState('idle');
    recognition.onend = () => {
      setAvatarState((current) => (current === 'listening' ? 'idle' : current));
    };
    recognition.start();
  }

  function submitFallback(event: FormEvent) {
    event.preventDefault();
    void sendText(input);
  }

  return (
    <main className={`keroShell state-${avatarState}`}>
      <div className="cosmos" aria-hidden="true" />

      {!videoFailed ? (
        <video
          ref={videoRef}
          className="keroMotion"
          src={motionUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label="KERO hareketli dijital karakteri"
        />
      ) : (
        <div className="fallbackHero" aria-hidden="true">
          <div className="fallbackGlow" />
          <div className="fallbackFace">K</div>
        </div>
      )}

      <div className="cinematicShade" aria-hidden="true" />

      <header className="hudTop">
        <div className="brand">
          <span className="brandOrb" aria-hidden="true" />
          <strong>KERO</strong>
        </div>
        <div className="online">
          <i />
          Çevrimiçi
        </div>
      </header>

      <div className="statePill" aria-live="polite">
        <i />
        {stateLabel[avatarState]}
      </div>

      <section className="responseCaption" aria-live="polite">
        {avatarState === 'speaking' && lastAssistant ? lastAssistant : ''}
      </section>

      <footer className="controlLayer">
        <div className="voiceDock">
          <button
            type="button"
            className="keyboardButton"
            onClick={() => {
              setShowKeyboard((value) => !value);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label="Klavye ile yaz"
          >
            ⌨
          </button>

          <button
            type="button"
            className="micButton"
            onClick={startListening}
            disabled={busy}
            aria-label="KERO ile konuş"
          >
            <span className="micIcon" aria-hidden="true" />
          </button>

          <div className="spacerButton" aria-hidden="true" />
        </div>

        {showKeyboard && (
          <form className="textComposer" onSubmit={submitFallback}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={voiceSupported === false ? 'Mesajını yaz…' : 'İstersen yazabilirsin…'}
              aria-label="KERO'ya mesaj yaz"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Gönder
            </button>
          </form>
        )}
      </footer>
    </main>
  );
}
