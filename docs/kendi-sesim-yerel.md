# KERO yerel kendi sesim: gelecekte yeniden etkinleştirme notları

**Durum (12 Ekim 2026):** KERO arayüzündeki **Kendi sesim** seçeneği geçici olarak kaldırıldı. Sesli sohbet şimdi yalnızca tarayıcının `speechSynthesis` sesini kullanıyor ve `127.0.0.1:8765` üzerindeki yerel motora istek göndermiyor. Tarayıcının kendi seslendirmesi ve mikrofon işlevi korunuyor.

Yerel Chatterbox ses klonunun Windows bilgisayardaki kurulum dosyaları, referans WAV kaydı ve ses modeli **bu değişiklikle silinmedi**. İleride isteğe bağlı bir özellik olarak ayrı bir değişiklikle yeniden bağlanabilir. Mevcut donanımda performans kısıtları devam edebilir.

## Eski yerel ses motoru denemesine ilişkin arşiv bilgisi

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
4. **Artık geçerli değil:** KERO arayüzünden `Kendi sesim` seçeneği kaldırıldı. Yeniden eklenmeden bu adım uygulanamaz.
5. Kısa bir cümleyle dene. Motorun performansını görmeden 2-3 saat kesintisiz konuşma garantisi verme.

Bu bir test aşamasıdır. Kullanıcı üyeliği, merkezi ortak kota, telefon desteği ve servis düzeyinde sürekli ses henüz tamamlanmamıştır.
