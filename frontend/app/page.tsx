'use client';

import { FormEvent, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type Message = { role: 'user' | 'assistant'; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Kero hazır. Ne üzerinde çalışmak istiyorsun?' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error('API hatası');
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Backend bağlantısı kurulamadı. API adresini kontrol et.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <header className="topbar">
          <div className="brandMark">K</div>
          <div>
            <h1>KERO</h1>
            <p>Yapay Zekâ Asistanı</p>
          </div>
          <span className="status">● Çevrimiçi</span>
        </header>

        <div className="chat">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {busy && <div className="bubble assistant">Düşünüyorum…</div>}
        </div>

        <form onSubmit={sendMessage} className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Kero'ya bir şey yaz…"
            aria-label="Mesaj"
          />
          <button type="submit" disabled={busy}>Gönder</button>
        </form>
      </section>
    </main>
  );
}
