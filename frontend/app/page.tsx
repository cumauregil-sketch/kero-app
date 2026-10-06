'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'KERO hazır. Konuşmak için mikrofona dokun.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [voiceSupported, setVoiceSupported] = useState<boolean | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [speechBeat, setSpeechBeat] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [mouthFrame, setMouthFrame] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mouthVideoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const conversationModeRef = useRef(false);
  const avatarStateRef = useRef<AvatarState>('idle');

  const motionUrl = '/api/motion';
  const lastAssistant =
    [...messages].reverse().find((message) => message.role === 'assistant')?.content ?? '';

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  useEffect(() => {
    avatarStateRef.current = avatarState;
  }, [avatarState]);

  useEffect(() => {
    const browser = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };

    setVoiceSupported(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));

    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort?.();
      requestControllerRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const mouthVideo = mouthVideoRef.current;

    const playbackRate =
      avatarState === 'speaking'
        ? speechBeat
          ? 1.05
          : 0.96
        : avatarState === 'listening'
          ? 0.72
          : avatarState === 'thinking'
            ? 0.56
            : 0.38;

    if (video) video.playbackRate = playbackRate;
    if (mouthVideo) mouthVideo.playbackRate = playbackRate;
  }, [avatarState, speechBeat]);

  useEffect(() => {
    if (avatarState !== 'speaking') {
      setMouthFrame(0);
      return;
    }

    const pattern = [1, 3, 1, 2, 0, 2, 3, 1, 0, 2];
    const delays = [72, 96, 84, 118, 76, 104, 88, 126, 78, 98];
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pulse = () => {
      setMouthFrame(pattern[index % pattern.length]);
      timer = setTimeout(pulse, delays[index % delays.length]);
      index += 1;
    };

    pulse();

    return () => {
      if (timer) clearTimeout(timer);
      setMouthFrame(0);
    };
  }, [avatarState]);

  useEffect(() => {
    if (avatarState !== 'speaking') return;

    let animationFrame = 0;

    const syncMouthVideo = () => {
      const base = videoRef.current;
      const mouth = mouthVideoRef.current;

      if (base && mouth && Number.isFinite(base.currentTime)) {
        if (Math.abs(mouth.currentTime - base.currentTime) > 0.055) {
          mouth.currentTime = base.currentTime;
        }

        if (mouth.paused && !base.paused) {
          void mouth.play().catch(() => undefined);
        }
      }

      animationFrame = requestAnimationFrame(syncMouthVideo);
    };

    animationFrame = requestAnimationFrame(syncMouthVideo);
    return () => cancelAnimationFrame(animationFrame);
  }, [avatarState]);

  function scheduleListening(delay = 280) {
    if (!conversationModeRef.current || busyRef.current) return;

    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    restartTimerRef.current = setTimeout(() => {
      if (
        conversationModeRef.current &&
        !busyRef.current &&
        avatarStateRef.current !== 'speaking'
      ) {
        startListening();
      }
    }, delay);
  }

  function speakReply(text: string) {
    if (!('speechSynthesis' in window)) {
      setAvatarState('idle');
      scheduleListening();
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

    utterance.onstart = () => {
      setSpeechBeat(true);
      setMouthFrame(2);
      setAvatarState('speaking');
    };

    utterance.onboundary = () => {
      setSpeechBeat((current) => !current);
      setMouthFrame((current) => (current + 2) % 4);
    };

    utterance.onend = () => {
      setSpeechBeat(false);
      setMouthFrame(0);
      setAvatarState('idle');
      scheduleListening(340);
    };

    utterance.onerror = () => {
      setSpeechBeat(false);
      setMouthFrame(0);
      setAvatarState('idle');
      scheduleListening(340);
    };

    window.speechSynthesis.speak(utterance);
  }

  async function sendText(rawText: string) {
    const text = rawText.trim();
    if (!text || busyRef.current) return;

    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();

    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;

    setMessages((current) => [...current, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    busyRef.current = true;
    setAvatarState('thinking');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('API hatası');

      const data = await response.json();
      const reply = typeof data.reply === 'string' ? data.reply : 'Yanıt hazır.';

      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      speakReply(reply);
    } catch {
      if (controller.signal.aborted) {
        setAvatarState('idle');
        return;
      }

      const reply = 'Backend bağlantısı kurulamadı. API adresini kontrol et.';
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      setAvatarState('idle');
      scheduleListening();
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setBusy(false);
      busyRef.current = false;
    }
  }

  function startListening() {
    if (busyRef.current) return;

    const browser = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };

    const SpeechRecognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setConversationMode(false);
      conversationModeRef.current = false;
      setShowKeyboard(true);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    window.speechSynthesis?.cancel();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let handledResult = false;

    recognition.onstart = () => {
      setSpeechBeat(false);
      setMouthFrame(0);
      setAvatarState('listening');
    };

    recognition.onspeechstart = () => {
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results ?? []) as any[];
      const finalResult = [...results].reverse().find((result) => result.isFinal);
      const transcript = finalResult?.[0]?.transcript?.trim();

      if (transcript && !handledResult) {
        handledResult = true;
        void sendText(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      recognitionRef.current = null;

      if (event?.error === 'aborted') return;

      setAvatarState('idle');

      if (conversationModeRef.current && event?.error !== 'not-allowed') {
        scheduleListening(650);
      } else if (event?.error === 'not-allowed') {
        setConversationMode(false);
        conversationModeRef.current = false;
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (!handledResult && avatarStateRef.current === 'listening') {
        setAvatarState('idle');
        scheduleListening(500);
      }
    };

    recognition.start();
  }

  function stopConversation() {
    setConversationMode(false);
    conversationModeRef.current = false;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    window.speechSynthesis?.cancel();

    setSpeechBeat(false);
    setMouthFrame(0);
    setBusy(false);
    busyRef.current = false;
    setAvatarState('idle');
  }

  function handleMicClick() {
    if (conversationMode && avatarState === 'listening') {
      stopConversation();
      return;
    }

    setConversationMode(true);
    conversationModeRef.current = true;

    if (avatarState === 'speaking') {
      window.speechSynthesis?.cancel();
      setSpeechBeat(false);
      setMouthFrame(0);
      setAvatarState('idle');
    }

    if (avatarState === 'thinking') {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setBusy(false);
      busyRef.current = false;
      setAvatarState('idle');
    }

    startListening();
  }

  function submitFallback(event: FormEvent) {
    event.preventDefault();
    void sendText(input);
  }

  return (
    <main
      className={`keroShell state-${avatarState} ${speechBeat ? 'speech-beat' : ''} ${conversationMode ? 'conversation-live' : ''}`}
    >
      <div className="cosmos" aria-hidden="true" />

      {!videoFailed ? (
        <>
          <video
            ref={videoRef}
            className="keroMotion"
            src={motionUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onCanPlay={(event) => {
              setVideoFailed(false);
              void event.currentTarget.play().catch(() => undefined);

              const mouthVideo = mouthVideoRef.current;
              if (mouthVideo) {
                mouthVideo.currentTime = event.currentTarget.currentTime;
                void mouthVideo.play().catch(() => undefined);
              }
            }}
            onError={() => setVideoFailed(true)}
            aria-label="KERO hareketli dijital karakteri"
          />

          <div className={`mouthMask mouth-open-${mouthFrame}`} aria-hidden="true">
            <video
              ref={mouthVideoRef}
              className="mouthVideo"
              src={motionUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              tabIndex={-1}
            />
            <span className="mouthDepth" />
          </div>
        </>
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
            onClick={handleMicClick}
            aria-label={conversationMode ? 'Canlı konuşmayı durdur' : 'KERO ile konuş'}
            aria-pressed={conversationMode}
          >
            <span className="micIcon" aria-hidden="true" />
          </button>

          <span className="stateLight" aria-hidden="true" />
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
