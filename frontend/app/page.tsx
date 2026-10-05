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
          <aside className="sideInfo">
            <strong>Canlı karakter</strong>
            Nefes, baş, omuz ve gövde mikro hareketleri sürekli aktiftir.
          </aside>

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
                aria-label="KERO hareketli dijital insan hologramı"
              >
                <defs>
                  <linearGradient id="bodyGlow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#d8f5ff" stopOpacity="0.38" />
                    <stop offset="42%" stopColor="#55cfff" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#246bff" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="softBodyGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7edfff" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#1f6eff" stopOpacity="0.03" />
                  </linearGradient>
                  <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#d9f7ff" stopOpacity="0.92" />
                    <stop offset="52%" stopColor="#58caff" stopOpacity="0.72" />
                    <stop offset="100%" stopColor="#2d76ff" stopOpacity="0.36" />
                  </linearGradient>
                  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g className="holoFigure">
                  <g className="headGroup">
                    <path
                      className="holoPart"
                      d="M210 82c-43 0-70 32-70 78 0 35 10 71 31 91 12 12 25 18 39 18s27-6 39-18c21-20 31-56 31-91 0-46-27-78-70-78Z"
                    />
                    <path className="faceContour" d="M164 168c9-27 28-44 46-44s37 17 46 44" opacity=".36" />
                    <path className="faceEye" d="M171 179c10-5 20-5 30 0M219 179c10-5 20-5 30 0" />
                    <path className="faceContour" d="M210 184v26" opacity=".58" />
                    <path className="faceMouth" d="M188 226c14 7 30 7 44 0" />
                    <path className="faceContour" d="M179 245c19 12 43 12 62 0" opacity=".32" />
                  </g>

                  <path className="holoSoft" d="M182 260h56l9 42-37 34-37-34 9-42Z" />

                  <path
                    className="holoPart"
                    d="M150 298c18-10 38-17 60-17s42 7 60 17l36 27 22 162-32 105H124L92 487l22-162 36-27Z"
                  />

                  <path
                    className="holoSoft"
                    d="M164 306c13 17 29 27 46 27s33-10 46-27l21 28-25 176h-84l-25-176 21-28Z"
                  />

                  <path className="chestTrace" d="M137 357c45 25 101 25 146 0" opacity=".42" />
                  <path className="chestTrace" d="M155 399c34 18 76 18 110 0" opacity=".22" />
                  <path className="chestTrace" d="M170 476h80" opacity=".2" />

                  <circle className="coreOuter" cx="210" cy="386" r="28" strokeDasharray="7 8" />
                  <circle className="coreOuter" cx="210" cy="386" r="20" strokeDasharray="3 6" opacity=".6" />
                  <circle className="coreInner" cx="210" cy="386" r="6" />

                  <g className="leftArm">
                    <path
                      className="holoPart"
                      d="M116 321c-25 13-39 38-47 76L48 516c-5 25 9 40 25 40 18 0 28-13 33-32l29-119 9-55-28-29Z"
                    />
                    <g className="leftForearm">
                      <path
                        className="holoSoft"
                        d="M76 505c-13 17-23 37-29 59-5 18 4 34 19 38 16 4 29-7 34-23l17-58-41-16Z"
                      />
                      <ellipse className="holoPart" cx="59" cy="610" rx="17" ry="26" />
                    </g>
                  </g>

                  <g className="rightArm">
                    <path
                      className="holoPart"
                      d="M304 321c25 13 39 38 47 76l21 119c5 25-9 40-25 40-18 0-28-13-33-32l-29-119-9-55 28-29Z"
                    />
                    <g className="rightForearm">
                      <path
                        className="holoSoft"
                        d="M344 505c13 17 23 37 29 59 5 18-4 34-19 38-16 4-29-7-34-23l-17-58 41-16Z"
                      />
                      <ellipse className="holoPart" cx="361" cy="610" rx="17" ry="26" />
                    </g>
                  </g>

                  <path className="holoSoft" d="M144 587h132l26 71H118l26-71Z" />
                  <path className="chestTrace" d="M138 623h144" opacity=".2" />
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

          <aside className="sideInfo right">
            <strong>Hareket sistemi</strong>
            Dinleme, düşünme ve konuşma durumlarında jestler ayrı çalışır.
          </aside>
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
