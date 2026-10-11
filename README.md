# KERO

Türkçe öncelikli yapay zekâ asistanı. Next.js arayüzü ve FastAPI arka ucu Railway'de yayınlanır.

## Mevcut sistem
- Sohbet içinde küçük animasyonlu sesli görüşme küresi, Türkçe konuşma tanıma ve sohbet geçmişi bulunur.
- Ses çıkışı hâlâ tarayıcı `speechSynthesis` kullanır. **Doğal gerçek zamanlı ses henüz tamamlanmadı.**
- Gemini metin modeli için kod `feature/kero-gemini-chat` geliştirme dalında hazırlanmıştır. **Canlıda henüz etkin değildir.**
- Sohbet geçmişi şu anda cihazın yerel belleğinde saklanır; kalıcı kullanıcı hesapları henüz yoktur.

## Gemini pilot ayarları
Railway **kero-api** servisine sunucu tarafında şunlar tanımlanmalıdır:

```
GEMINI_API_KEY=<Google AI Studio'dan aldığınız API anahtarı>
KERO_ACCESS_CODE=<uzun ve tahmin edilmesi güç davet kodu>
GEMINI_MODEL=gemini-3.5-flash-lite
```

Model isteğe bağlıdır; daha yüksek yanıt kalitesi için `gemini-3.8-flash` seçilebilir. Kullanım kotası ve ücretli kullanım şartlarını ayrıca kontrol edin. Anahtarı GitHub, tarayıcı kaynak kodu veya `NEXT_PUBLIC_` değişkenlerinde tutmayın.

Davet kodu yalnızca geçici bir pilot korumasıdır. 50 kullanıcılık aşamadan önce bireysel kimlik doğrulama, hesap bazında kota ve merkezi sohbet kaydı gereklidir. Şu haliyle herkese açık kullanıma hazır değildir.

## Çalıştırma
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Başka terminalde `cd frontend && npm install && npm run dev`.
Frontend proxy adresi `RAILWAY_SERVICE_KERO_API_URL` değişkeninden okunur.
