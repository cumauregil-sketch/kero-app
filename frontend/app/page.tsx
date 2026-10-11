'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

const welcome: Message = { role: 'assistant', content: 'Merhaba, ben KERO. Nasıl yardımcı olabilirim?' };


function BrandIcon({large=false}:{large?:boolean}) {
  return <span className={large?'kMark large':'kMark'} aria-hidden="true"><img src="/kero-mark.svg" alt="" /></span>;
}
function LightWaves() {
  return <div className="lightWaves" aria-hidden="true"><i/><i/><i/><i/><b/></div>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  // Avoid displaying the default welcome screen before stored chats hydrate.
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [dictating, setDictating] = useState(false);
  const [dictationNotice, setDictationNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dictationRef = useRef<any>(null);
  const dictationWantedRef = useRef(false);
  const dictationSessionRef = useRef(0);
  const dictationBaseRef = useRef('');
  const dictationSegmentRef = useRef('');
  const dictationRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('kero-chat-v1');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')) {
          setMessages(parsed as Message[]);
        }
      }
    } catch { /* Gracefully fall back when saved chat or storage is unavailable. */ }
    setHydrated(true);
    const browser = window as any;
    setVoiceAvailable(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    return () => {
      activeRef.current = false;
      recognitionRef.current?.abort?.();
      dictationWantedRef.current = false;
      dictationSessionRef.current += 1;
      dictationRef.current?.abort?.();
      if (dictationRestartRef.current) clearTimeout(dictationRestartRef.current);
      controllerRef.current?.abort();
      window.speechSynthesis?.cancel();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem('kero-chat-v1', JSON.stringify(messages)); }
    catch { /* Allow chatting even if storage access is blocked. */ }
  }, [messages, hydrated]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);


  // Turkish browser speech recognition: show interim text live but keep the
  // final recognition result when it arrives. Never submit dictated text automatically.
  function joinSpoken(base: string, spoken: string) {
    const cleanBase = base.trimEnd();
    const cleanSpoken = spoken.trim();
    return cleanBase && cleanSpoken ? cleanBase + ' ' + cleanSpoken : (cleanBase || cleanSpoken);
  }

  function stopDictation() {
    dictationWantedRef.current = false;
    dictationSessionRef.current += 1; // Invalidate late callbacks from cancelled recognition.
    if (dictationRestartRef.current) {
      clearTimeout(dictationRestartRef.current);
      dictationRestartRef.current = null;
    }
    const current = dictationRef.current;
    dictationRef.current = null;
    current?.abort?.();
    setDictating(false);
  }

  function listenForDictation() {
    if (!dictationWantedRef.current) return;
    const browser = window as any;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      dictationWantedRef.current = false;
      setDictating(false);
      setDictationNotice('Bu tarayıcı sesle yazmayı desteklemiyor.');
      return;
    }
    const recognition = new Recognition();
    const session = ++dictationSessionRef.current;
    const base = dictationBaseRef.current;
    dictationSegmentRef.current = '';
    dictationRef.current = recognition;
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      if (session !== dictationSessionRef.current || !dictationWantedRef.current) return;
      const final: string[] = [];
      const interim: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const phrase = result?.[0]?.transcript?.trim();
        if (!phrase) continue;
        (result.isFinal ? final : interim).push(phrase);
      }
      const heard = [...final, ...interim].join(' ').trim();
      dictationSegmentRef.current = heard;
      setInput(joinSpoken(base, heard));
    };
    recognition.onerror = (event: any) => {
      if (session !== dictationSessionRef.current) return;
      const errors: Record<string, string> = {
        'not-allowed': 'Mikrofon izni verilmedi. Tarayıcıdan mikrofon erişimine izin ver.',
        'service-not-allowed': 'Tarayıcı konuşma tanıma hizmetine izin vermiyor.',
        'audio-capture': 'Mikrofon bulunamadı. Mikrofon bağlantısını kontrol et.',
        'network': 'Ses algılama hizmetine bağlanılamadı.',
        'no-speech': 'Ses duyulmadı. Mikrofonu tekrar açarak deneyebilirsin.',
        'language-not-supported': 'Tarayıcı Türkçe konuşma tanımayı desteklemiyor.'
      };
      if (event.error !== 'aborted') {
        setDictationNotice(errors[event.error] || 'Sesle yazma kesildi. Tekrar deneyebilirsin.');
      }
      dictationWantedRef.current = false;
      setDictating(false);
    };
    recognition.onend = () => {
      if (session !== dictationSessionRef.current) return;
      // Some browsers end recognition during pauses. Preserve the words already
      // displayed and reopen the listener while the user still wants dictation.
      dictationBaseRef.current = joinSpoken(base, dictationSegmentRef.current);
      dictationSegmentRef.current = '';
      dictationRef.current = null;
      if (dictationWantedRef.current) {
        dictationRestartRef.current = setTimeout(() => {
          dictationRestartRef.current = null;
          listenForDictation();
        }, 350);
      } else {
        setDictating(false);
      }
    };
    try {
      recognition.start();
      setDictating(true);
    } catch {
      dictationWantedRef.current = false;
      dictationRef.current = null;
      setDictating(false);
      setDictationNotice('Mikrofon başlatılamadı. Tekrar deneyebilirsin.');
    }
  }

  function toggleDictation() {
    if (dictationWantedRef.current) { stopDictation(); return; }
    if (busyRef.current || activeRef.current) return;
    dictationBaseRef.current = input;
    dictationWantedRef.current = true;
    setDictationNotice('');
    listenForDictation();
  }

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
    if (dictationWantedRef.current) stopDictation();
    activeRef.current = true;
    setVoiceMode(true);
    listen();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dictationWantedRef.current) stopDictation();
    void sendMessage(input);
  }

  function clearChat() {
    if (dictationWantedRef.current) stopDictation();
    setDictationNotice('');
    endVoice();
    setMessages([welcome]);
  }

  const isWelcome = hydrated && messages.length===1 && messages[0].role==='assistant' && messages[0].content===welcome.content;
  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand"><BrandIcon/><div><strong>KERO</strong><small>YAPAY ZEKÂ ASİSTANI</small></div></div>
        <button className="newChat" onClick={clearChat}><span className="plus">＋</span><span className="navText">Yeni sohbet</span></button>
        <div className="sidebarNav">
          <span className="navHeading">ÇALIŞMA ALANI</span>
          <button className="navLink active" type="button" onClick={()=>{endVoice();}}><span className="navGlyph">▧</span><span className="navText">Sohbet</span></button>
        </div>
        <div className="sidebarBottom"><div className="online"><span className="statusDot"/><strong>KERO HAZIR</strong></div><small>Sohbetler bu cihazda saklanır.</small></div>
      </aside>
      <section className="workspace">
        <LightWaves/>
        <header className="topbar"><div className="topName"><span className="topSpark">✦</span><strong>KERO</strong><span className="divider"/>Akıllı çalışma alanın</div>
        </header>
        <div className={'messageArea '+(isWelcome?'welcomeArea':'')} ref={scrollRef}>
          {!hydrated ? null : isWelcome ? <div className="welcomeHero">
            <div className="heroIcon"><span className="orbit orbit1"/><span className="orbit orbit2"/><BrandIcon large/></div>
            <div className="heroEyebrow">✧ &nbsp; INTELLIGENCE IN MOTION &nbsp; ✧</div>
            <h1>Bir fikrin varsa, <span>birlikte büyütelim.</span></h1>
            <p>Sor, keşfet, üret. Her düşünce için daha akıllı bir başlangıç.</p>
            <div className="suggestions">
              <button type="button" onClick={()=>setInput('Yeni bir iş fikrini birlikte geliştirelim.')}><span>✧</span><strong>Bir fikir geliştirelim</strong><em>↗</em></button>
              <button type="button" onClick={()=>setInput('Bir web uygulaması geliştirmeme yardım et.')}><span>⌘</span><strong>Birlikte kod yazalım</strong><em>↗</em></button>
              <button type="button" onClick={()=>setInput('Bir konuyu derinlemesine inceleyelim.')}><span>◈</span><strong>Bir konuyu inceleyelim</strong><em>↗</em></button>
            </div>
          </div> : <div className="messages">
            {messages.map((message, index) => <div key={index} className={'message '+message.role}>{message.role==='assistant'&&<BrandIcon/>}<div className="bubble">{message.content}</div></div>)}
            {busy&&<div className="message assistant"><BrandIcon/><div className="bubble muted"><span className="loadingDots">✦</span> KERO düşünüyor…</div></div>}
          </div>}
        </div>
        <div className="composerWrap"><form className="composer" onSubmit={submit}>
          <span className="composerStar" aria-hidden="true">✦</span>
          <input aria-label="Mesaj" placeholder={dictating?'Dinliyorum, konuşabilirsin…':"KERO'ya bir şey sor…"} value={input} onChange={e=>{ if (dictationWantedRef.current) stopDictation(); setInput(e.target.value); }}/>
          <button type="button" className={'dictateToggle'+(dictating?' active':'')} onClick={toggleDictation} disabled={!voiceAvailable || busy} aria-label={dictating?'Sesle yazmayı durdur':'Sesle yaz'} aria-pressed={dictating} title={dictating?'Sesle yazmayı durdur':'Sesle yaz: Konuşman mesaj kutusuna yazılır'}>
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
          <button type="button" className="voiceToggle" onClick={toggleVoice} disabled={!voiceAvailable} title={voiceAvailable?'Sesli görüşmeyi aç':'Tarayıcı sesli sohbeti desteklemiyor'} aria-label="Sesli görüşmeyi aç">
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M4 8a9 9 0 0 0 0 8M20 8a9 9 0 0 1 0 8M7 5a11 11 0 0 0 0 14M17 5a11 11 0 0 1 0 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
          </button>
          <button type="submit" className="sendButton" disabled={busy || !input.trim()} aria-label="Gönder">↑</button>
        </form><small className={dictationNotice?'dictationError':dictating?'dictationHint':''} aria-live="polite">{dictationNotice || (dictating?'🎙️ Sesle yazma açık. Konuşman otomatik gönderilmez; metni kontrol edip Gönder\'e bas.':'KERO şu an test yanıtları vermektedir. Önemli bilgileri doğrulayın.')}</small></div>
      </section>
      {voiceMode && <div className={'voiceOverlay state-'+voiceState} role="dialog" aria-modal="true" aria-label="KERO sesli sohbet">
        <LightWaves/>
        <header className="voiceTop"><div className="voiceBrand"><BrandIcon/><strong>KERO</strong><span>VOICE</span></div><button className="closeVoice" onClick={endVoice} aria-label="Sesli sohbeti kapat">✕</button></header>
        <div className="voiceStage">
          <div className="voiceEyebrow"><span className="statusDot"/> KERO SESLİ ASİSTAN</div>
          <div className={'voiceSculpture '+voiceState} aria-hidden="true">
            <span className="voiceHalo"/><span className="orbRing ringA"/><span className="orbRing ringB"/><span className="orbRing ringC"/><span className="glowPoint first"/><span className="glowPoint second"/>
            <div className="voiceOrb"><div className="orbSweep"/><div className="orbCore"/><div className="orbHighlight"/></div>
          </div>
          <div className="voiceStatus" aria-live="polite">{voiceState==='listening'?'Seni dinliyorum':voiceState==='thinking'?'Düşünüyorum':voiceState==='speaking'?'Konuşuyorum':'Hazırım, konuşabilirsin'}</div>
          <div className="voiceSubtitle">Sesinle konuş, KERO seni dinlesin.</div>
          <div className={'audioBars '+voiceState} aria-hidden="true">{Array.from({length:23},(_,i)=><span key={i} style={{animationDelay:(i*-45)+'ms'}}/>)}</div>
        </div>
        <div className="voiceActions"><button className="endVoice" onClick={endVoice}>■ &nbsp; Görüşmeyi bitir</button><small>Ses işleme özellikleri tarayıcına bağlıdır.</small></div>
      </div>}
    </main>
  );
}
