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

  const isWelcome = messages.length===1 && messages[0].role==='assistant' && messages[0].content===welcome.content;
  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand"><BrandIcon/><div><strong>KERO</strong><small>YAPAY ZEKÂ ASİSTANI</small></div></div>
        <button className="newChat" onClick={clearChat}><span className="plus">＋</span><span className="navText">Yeni sohbet</span></button>
        <div className="sidebarNav">
          <span className="navHeading">ÇALIŞMA ALANI</span>
          <button className="navLink active" type="button" onClick={()=>{endVoice();}}><span className="navGlyph">▧</span><span className="navText">Sohbet</span></button>
          <button className="navLink" type="button" onClick={toggleVoice} disabled={!voiceAvailable}><span className="navGlyph">◉</span><span className="navText">Sesli görüşme</span></button>
        </div>
        <div className="sidebarBottom"><div className="online"><span className="statusDot"/> KERO arayüzü hazır</div><small>Sohbetler bu cihazda saklanır.</small></div>
      </aside>
      <section className="workspace">
        <LightWaves/>
        <header className="topbar"><div className="topName"><span className="topSpark">✦</span><strong>KERO</strong><span className="divider"/>Akıllı çalışma alanın</div>
          <button className="topVoice" type="button" onClick={toggleVoice} disabled={!voiceAvailable}><span aria-hidden="true">◉</span><span className="topVoiceText">Sesli görüşme</span></button>
        </header>
        <div className={'messageArea '+(isWelcome?'welcomeArea':'')} ref={scrollRef}>
          {isWelcome ? <div className="welcomeHero">
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
          <input aria-label="Mesaj" placeholder="KERO'ya bir şey sor…" value={input} onChange={e=>setInput(e.target.value)}/>
          <button type="button" className="voiceToggle" onClick={toggleVoice} disabled={!voiceAvailable} title={voiceAvailable?'Sesli sohbet':'Tarayıcı sesli sohbeti desteklemiyor'} aria-label="Sesli sohbet">
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
          <button type="submit" className="sendButton" disabled={busy || !input.trim()} aria-label="Gönder">↑</button>
        </form><small>KERO şu an test yanıtları vermektedir. Önemli bilgileri doğrulayın.</small></div>
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
