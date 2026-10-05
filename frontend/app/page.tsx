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
  const [voiceHint, setVoiceHint] = useState('Konuşmak için mikrofona dokun');
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content;
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')?.content;

  useEffect(() => {
    const browser = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };

    setVoiceSupported(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));

    return () => {
      if (speechTimer.current) clearTimeout(speechTimer.current);
    };
  }, []);

  async function sendText(rawText: string) {
    const text = rawText.trim();
    if (!text || busy) return;

    if (speechTimer.current) clearTimeout(speechTimer.current);

    setMessages((current) => [...current, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    setAvatarState('thinking');
    setVoiceHint('KERO düşünüyor');

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
      setAvatarState('speaking');
      setVoiceHint('KERO yanıt veriyor');

      const speakingTime = Math.min(9000, Math.max(2200, reply.length * 42));
      speechTimer.current = setTimeout(() => {
        setAvatarState('idle');
        setVoiceHint('Konuşmak için mikrofona dokun');
      }, speakingTime);
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Backend bağlantısı kurulamadı. API adresini kontrol et.' },
      ]);
      setAvatarState('idle');
      setVoiceHint('Bağlantı kurulamadı');
    } finally {
      setBusy(false);
    }
  }

  function submitFallback(event: FormEvent) {
    event.preventDefault();
    void sendText(input);
  }

  function startListening() {
    if (busy) return;

    const browser = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };

    const SpeechRecognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceHint('Bu tarayıcıda ses tanıma yok, metin alanını kullan');
      inputRef.current?.focus();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setAvatarState('listening');
      setVoiceHint('Seni dinliyorum');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) void sendText(transcript);
    };

    recognition.onerror = () => {
      setAvatarState('idle');
      setVoiceHint('Mikrofon kullanılamadı, tekrar dokun');
    };

    recognition.onend = () => {
      setAvatarState((current) => (current === 'listening' ? 'idle' : current));
    };

    recognition.start();
  }

  return (
    <main className="shell">
      <section className="panel">
        <header className="topbar">
          <div className="logoMark" aria-hidden="true" />
          <div className="brandText">
            <h1>KERO</h1>
            <p>Dijital Yapay Zekâ Asistanı</p>
          </div>
          <div className="status">
            <span className="statusDot" />
            Çevrimiçi
          </div>
        </header>

        <section className="stage" aria-label="KERO dijital karakter alanı">
          <div className="avatarColumn">
            <div className="modePill">
              <i />
              {stateLabel[avatarState]}
            </div>

            <div className={`hologram ${avatarState}`}>
              <div className="holoAura" />
              <div className="dataDust" />
              <div className="scanLine" />

              <svg
                className="holoSvg"
                viewBox="0 0 420 720"
                role="img"
                aria-label="KERO gerçekçi premium dijital insan hologramı"
              >
                <defs>
                  <linearGradient id="skinGlow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f1fbff" stopOpacity="0.34" />
                    <stop offset="48%" stopColor="#73d9ff" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#2c7cff" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="bodyGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dff8ff" stopOpacity="0.28" />
                    <stop offset="45%" stopColor="#64d0ff" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#236fff" stopOpacity="0.05" />
                  </linearGradient>
                  <linearGradient id="softBodyGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8be4ff" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#226dff" stopOpacity="0.025" />
                  </linearGradient>
                  <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#effcff" stopOpacity="0.92" />
                    <stop offset="50%" stopColor="#78dcff" stopOpacity="0.68" />
                    <stop offset="100%" stopColor="#3c85ff" stopOpacity="0.30" />
                  </linearGradient>
                  <radialGradient id="faceShade" cx="50%" cy="38%" r="64%">
                    <stop offset="0%" stopColor="#dff8ff" stopOpacity="0.16" />
                    <stop offset="72%" stopColor="#57c7ff" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#1c62ff" stopOpacity="0.01" />
                  </radialGradient>
                  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g className="holoFigure humanFigure">
                  <g className="headGroup">
                    <path className="hairShape" d="M151 147c2-44 25-77 59-77 39 0 61 29 62 77-9-22-23-37-39-44-22-10-51-3-82 44Z" />
                    <path
                      className="skinPart faceShape"
                      d="M210 89c-37 0-61 28-62 72-1 38 11 76 34 97 9 9 18 14 28 14s19-5 28-14c23-21 35-59 34-97-1-44-25-72-62-72Z"
                    />
                    <path className="earPart" d="M149 166c-11-5-14 7-10 23 3 13 9 22 17 20M271 166c11-5 14 7 10 23-3 13-9 22-17 20" />
                    <path className="browLine" d="M169 171c10-6 22-7 33-2M218 169c11-5 23-4 33 2" />
                    <path className="eyeLine" d="M170 184c9-5 20-5 29 0M221 184c9-5 20-5 29 0" />
                    <path className="noseLine" d="M210 181c-1 13-2 24-1 31 4 3 8 4 12 3" />
                    <path className="cheekLine" d="M165 202c8 12 17 18 27 21M255 202c-8 12-17 18-27 21" />
                    <path className="faceMouth" d="M188 231c14 7 30 7 44 0" />
                    <path className="jawLine" d="M175 244c10 15 22 23 35 23s25-8 35-23" />
                  </g>

                  <path className="neckPart" d="M181 251c3 22 0 38-11 51 11 18 25 27 40 27s29-9 40-27c-11-13-14-29-11-51-9 10-19 16-29 16s-20-6-29-16Z" />

                  <path
                    className="torsoPart"
                    d="M166 296c-25 5-48 16-66 34-14 14-20 36-22 63l-8 133c-2 37 19 66 52 75 26 7 58 9 88 9s62-2 88-9c33-9 54-38 52-75l-8-133c-2-27-8-49-22-63-18-18-41-29-66-34-7 31-23 48-44 48s-37-17-44-48Z"
                  />
                  <path className="chestShade" d="M123 347c25 27 54 41 87 41s62-14 87-41c-5 63-11 126-13 189-18 8-43 12-74 12s-56-4-74-12c-2-63-8-126-13-189Z" />
                  <path className="collarLine" d="M157 310c11 28 28 43 53 43s42-15 53-43" />
                  <path className="chestTrace" d="M139 377c23 13 47 20 71 20s48-7 71-20" opacity=".26" />
                  <path className="chestTrace" d="M153 430c18 9 37 14 57 14s39-5 57-14" opacity=".14" />

                  <g className="leftArm">
                    <path
                      className="limbPart"
                      d="M102 333c-20 13-31 34-35 61l-18 111c-4 25 6 41 24 44 18 2 31-11 35-33l18-108c4-28 2-53-7-69l-17-6Z"
                    />
                    <g className="leftForearm">
                      <path
                        className="limbSoft"
                        d="M73 518c-8 13-14 31-17 51l-6 38c-3 18 7 31 22 33 15 2 27-8 30-25l8-42c4-22 1-39-8-50l-29-5Z"
                      />
                      <path className="handPart" d="M52 606c-5 16-3 31 8 43 8 9 21 10 30 3 8-6 12-18 9-30l-6-26-41 10Z" />
                      <path className="fingerLine" d="M58 620l-2 19M68 616l-1 25M79 615v24M89 618l2 17" />
                    </g>
                  </g>

                  <g className="rightArm">
                    <path
                      className="limbPart"
                      d="M318 333c20 13 31 34 35 61l18 111c4 25-6 41-24 44-18 2-31-11-35-33l-18-108c-4-28-2-53 7-69l17-6Z"
                    />
                    <g className="rightForearm">
                      <path
                        className="limbSoft"
                        d="M347 518c8 13 14 31 17 51l6 38c3 18-7 31-22 33-15 2-27-8-30-25l-8-42c-4-22-1-39 8-50l29-5Z"
                      />
                      <path className="handPart" d="M368 606c5 16 3 31-8 43-8 9-21 10-30 3-8-6-12-18-9-30l6-26 41 10Z" />
                      <path className="fingerLine" d="M362 620l2 19M352 616l1 25M341 615v24M331 618l-2 17" />
                    </g>
                  </g>

                  <path className="lowerBody" d="M128 584c23 10 50 15 82 15s59-5 82-15l18 75H110l18-75Z" />
                  <path className="waistLine" d="M132 600c22 9 48 13 78 13s56-4 78-13" />
                </g>
              </svg>

              <div className="holoRing" />
            </div>

            <div className="transcript" aria-live="polite">
              <div className="transcriptCard userHistory">
                <strong>Sen</strong>
                {lastUser ?? 'Henüz konuşma başlamadı.'}
              </div>
              <div className="transcriptCard">
                <strong>KERO</strong>
                {lastAssistant ?? 'Hazır.'}
              </div>
            </div>
          </div>

        </section>

        <footer className="controlDock">
          <div className="voiceRow">
            <button
              type="button"
              className={`micButton ${avatarState === 'listening' ? 'listening' : ''}`}
              onClick={startListening}
              disabled={busy}
              aria-label="KERO ile konuş"
            >
              <span className="micIcon" aria-hidden="true" />
            </button>

            <div className="voiceLabel">
              <strong>{voiceHint}</strong>
              <span>
                {voiceSupported === false
                  ? 'Ses tanıma desteklenmiyorsa metin alanı kullanılabilir.'
                  : 'KERO yalnızca sen başlattığında dinler.'}
              </span>
            </div>
          </div>

          <form className="fallbackForm" onSubmit={submitFallback}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Gerekirse metinle test et…"
              aria-label="Metinle mesaj"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Gönder
            </button>
          </form>
        </footer>
      </section>
    </main>
  );
}
