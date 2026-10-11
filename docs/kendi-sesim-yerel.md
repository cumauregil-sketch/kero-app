# KERO kendi sesim: yerel ve ücretsiz ses köprüsü

Bu seçenek, KERO'nun tarayıcı sesinden kendi sesini taklit eden **Chatterbox Multilingual V3** motoruna geçmesini sağlar. KERO'da sesli görüşme kutusu açıkken **Kendi sesim** düğmesiyle yalnızca bu cihazda etkinleştirilir.

- Ses motoru kendi Windows bilgisayarında `127.0.0.1:8765` üzerinde çalışır.
- Kişisel WAV ses kaydı bu GitHub reposunda **saklanmaz** ve Railway'e **gönderilmez**. Ayrı kişisel kurulum paketinde kalır.
- Ses motoru kurulu değilse veya yanıt vermezse KERO tarayıcı sesine döner.
- Ses motorunun yazılımda dakika başına konuşma kotası yoktur. **Ancak hız, donanım, çalışır kalma süresi, tarayıcı ve Gemini'nin ücretsiz kota sınırları farklıdır**.
- Bilgisayar kapalıyken telefondan bu yerel sese erişim mümkün değildir. Daha sonra şifreli sunucu/uzak bağlantı çözümü gerekir.
- İlk ses üretimi model indirilirken uzun sürebilir, CPU'da gerçek zamanlı performans garanti edilmez.

## Kurulum

1. Kişisel `KERO_Kendi_Sesim_Ucretsiz_Test.zip` paketini kendi bilgisayarına indir ve çıkar.
2. Python 3.11 kur. `BASLAT_WINDOWS.bat` dosyasını çalıştır. Bu komut bağımlılıkları indirir, model ilk kullanımda ayrıca iner.
3. `http://127.0.0.1:8765/health` adresine git; `"ok":true` ve `"reference_present":true` değerlerini gör.
4. `https://kero-web-production.up.railway.app` adresinde sesli görüşmeyi aç, ardından **Kendi sesim** seçeneğini aç.
5. Kısa bir cümleyle dene. Motorun performansını görmeden 2-3 saat kesintisiz konuşma garantisi verme.

Bu bir test aşamasıdır. Kullanıcı üyeliği, merkezi ortak kota, telefon desteği ve servis düzeyinde sürekli ses henüz tamamlanmamıştır.
