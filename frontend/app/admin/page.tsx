'use client';

import { FormEvent, useCallback, useState } from 'react';
import './admin.css';

type Summary = { capacity: number; registered: number; reserved: number; available: number };
type Invitation = {
  id: number; username: string; created_at: string;
  expires_at: number; status: 'pending' | 'used' | 'expired' | 'revoked';
};

const statusText: Record<Invitation['status'], string> = {
  pending: 'Davet bekliyor', used: 'Kayıt tamamlandı',
  expired: 'Süresi doldu', revoked: 'İptal edildi',
};

export default function KeroBetaAdminPage() {
  const [ownerKey, setOwnerKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [username, setUsername] = useState('');
  const [validDays, setValidDays] = useState(7);
  const [issuedCode, setIssuedCode] = useState('');
  const [issuedName, setIssuedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const api = useCallback(async (path: string, method: 'GET' | 'POST' = 'GET', body?: object) => {
    const response = await fetch(`/api/beta/admin/${path}`, {
      method,
      headers: {
        'X-Kero-Beta-Admin-Token': ownerKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.detail || 'Yönetici isteği başarısız.');
    return result;
  }, [ownerKey]);

  const reload = useCallback(async () => {
    const [stats, list] = await Promise.all([api('status'), api('invitations')]);
    setSummary(stats);
    setInvitations(list.invitations || []);
  }, [api]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await reload();
      setAuthenticated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bağlanılamadı.');
    } finally { setBusy(false); }
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice(''); setIssuedCode('');
    try {
      const result = await api('invitations', 'POST', { username: username.trim(), days_valid: validDays });
      setIssuedCode(result.code);
      setIssuedName(result.username);
      setUsername('');
      await reload();
      setNotice('Davet oluşturuldu. Kod yalnızca burada bir kez görüntülenir.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Davet oluşturulamadı.');
    } finally { setBusy(false); }
  }

  async function revoke(item: Invitation) {
    if (!window.confirm(`${item.username} için kullanılmamış daveti iptal etmek istiyor musun?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`invitations/${item.id}/revoke`, 'POST');
      await reload();
      setNotice('Davet iptal edildi.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Davet iptal edilemedi.'); }
    finally { setBusy(false); }
  }

  function exit() {
    setOwnerKey(''); setAuthenticated(false); setIssuedCode(''); setSummary(null);
    setInvitations([]); setNotice(''); setError('');
  }

  return (
    <main className="betaAdmin">
      <div className="betaShell">
        <header className="betaHeader">
          <a href="/" className="betaWordmark"><span className="betaMark">K</span>
            <span><strong>KERO</strong><small>ÖZEL BETA YÖNETİMİ</small></span>
          </a>
          <div className="betaHeaderRight"><span className="betaPhase">BETA 1.0 · 50 ÜYE</span>
            {authenticated && <button type="button" className="betaTextButton" onClick={exit}>Oturumu kapat</button>}
          </div>
        </header>

        <div className="betaHeading"><span className="betaOverline">KERO KONTROL MERKEZİ</span>
          <h1>Davetli kullanıcı yönetimi</h1>
          <p>Yalnızca seçtiğin 50 kişi. Her davet senin kontrolünde.</p>
        </div>

        {!authenticated ? (
          <section className="betaCard betaLogin">
            <span className="betaSectionEyebrow">YETKİLİ ERİŞİM</span>
            <h2>Yönetici doğrulaması</h2>
            <p>Bu panel yalnızca yönetici anahtarı ve etkinleştirilmiş kalıcı veritabanı ile açılır.</p>
            <form onSubmit={connect}>
              <label htmlFor="betaOwnerKey">Yönetici anahtarı</label>
              <input id="betaOwnerKey" type="password" value={ownerKey} autoComplete="off"
                onChange={e => setOwnerKey(e.target.value)} placeholder="Yönetici erişim anahtarını gir" required />
              <button type="submit" disabled={busy || !ownerKey.trim()} className="betaPrimary">
                {busy ? 'Doğrulanıyor…' : 'Yönetici paneline giriş'}
              </button>
            </form>
            <div className="betaHint">Üyelik sistemi henüz canlıda etkin değilse bağlantı reddedilir. Anahtar tarayıcı depolamasına kaydedilmez.</div>
          </section>
        ) : (
          <>
            <div className="betaStats">
              <section className="betaCard betaMetric"><span>Kayıtlı üye</span><strong>{summary?.registered ?? '…'}<em> / 50</em></strong><small>Hesabı aktif olan kullanıcılar</small></section>
              <section className="betaCard betaMetric"><span>Bekleyen davet</span><strong>{summary?.reserved ?? '…'}</strong><small>Kontenjandan yer ayıran davetler</small></section>
              <section className="betaCard betaMetric betaAvailable"><span>Kalan kontenjan</span><strong>{summary?.available ?? '…'}</strong><small>Yeni davet için uygun yer</small></section>
            </div>

            <div className="betaColumns">
              <section className="betaCard">
                <span className="betaSectionEyebrow">DAVET OLUŞTUR</span>
                <h2>Yeni kullanıcı daveti</h2>
                <p>Davet kodu belirlediğin kullanıcı adına bağlanır ve tek kullanımlıktır.</p>
                <form onSubmit={createInvitation} className="betaForm">
                  <label htmlFor="betaUsername">Kullanıcı adı</label>
                  <input id="betaUsername" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="Örn. kerouye01" minLength={3} maxLength={32} required />
                  <label htmlFor="betaDays">Davet geçerliliği</label>
                  <select id="betaDays" value={validDays} onChange={e => setValidDays(Number(e.target.value))}>
                    <option value={1}>1 gün</option>
                    <option value={3}>3 gün</option>
                    <option value={7}>7 gün</option>
                    <option value={14}>14 gün</option>
                    <option value={30}>30 gün</option>
                  </select>
                  <button className="betaPrimary" disabled={busy || (summary?.available ?? 0) === 0} type="submit">
                    {busy ? 'İşleniyor…' : '+ Davet oluştur'}
                  </button>
                </form>

                {issuedCode && <div className="betaIssued" role="status">
                  <strong>{issuedName} için davet kodu</strong>
                  <p>Bu kodu yalnızca davet edeceğin kişiye özel olarak ilet. Tekrar görüntülenemez.</p>
                  <code>{issuedCode}</code>
                  <button type="button" className="betaSecondary" onClick={async () => {
                    try { await navigator.clipboard.writeText(issuedCode); setNotice('Davet kodu kopyalandı.'); }
                    catch { setError('Kopyalanamadı. Kodu seçip elle kopyalayabilirsin.'); }
                  }}>Kodu kopyala</button>
                </div>}
              </section>

              <section className="betaCard">
                <div className="betaListTitle">
                  <div><span className="betaSectionEyebrow">DAVET LİSTESİ</span><h2>Davet durumları</h2></div>
                  <button type="button" className="betaSecondary" disabled={busy} onClick={async () => {
                    setBusy(true); setError(''); try { await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Yenilenemedi.'); } finally { setBusy(false); }
                  }}>Yenile</button>
                </div>
                <div className="betaInvitationList">
                  {invitations.length === 0 ? <div className="betaEmpty">Henüz davet oluşturulmamış.</div> :
                  invitations.map(item => <div className="betaInvitation" key={item.id}>
                    <div className="betaInviteIdentity"><strong>{item.username}</strong>
                      <small>Davet #{item.id} · {new Date(item.expires_at * 1000).toLocaleDateString('tr-TR')}</small></div>
                    <div className="betaInviteActions">
                      <span className={`betaState betaState-${item.status}`}>{statusText[item.status]}</span>
                      {item.status === 'pending' && <button type="button" disabled={busy}
                        onClick={() => void revoke(item)} className="betaRevoke">İptal et</button>}
                    </div>
                  </div>)}
                </div>
              </section>
            </div>
          </>
        )}

        {error && <div className="betaAlert betaError" role="alert">{error}</div>}
        {notice && <div className="betaAlert betaSuccess" role="status">{notice}</div>}
        <footer className="betaFooter">KERO Beta 1.0 · Yetkisiz erişim engellidir · <a href="/">KERO'ya dön</a></footer>
      </div>
    </main>
  );
}
