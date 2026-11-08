# Three.js Minecraft

Tarayıcı tabanlı 3D voksel oyunu — Minecraft tarzı, Three.js ile yazıldı.
**Bu proje Mojang/Microsoft ile bağlantılı değildir; resmî olmayan, ticari olmayan bir hayran projesidir.**

> ⚠️ İsim ve logo uyarısı: Bu depo, Minecraft ve Mojang markalarının haklarını ihlal etmemeyi amaçlar.
> Yayına almadan önce özgün bir oyun adı ve logo kullanılması önerilir (bkz. `NOTICE`).

## Özellikler

- Sonsuz chunk üretimi (deterministik seed), Y: −64..319, derin kayrak ve mağaralar
- Minecraft 1.21.1 kurallarına yakın oynanış:
  - Alet kademeleri (ahşap/taş/demir/altın/elmas) + hasat seviyesi kuralları
  - Çift-W koşma, çift-Space uçma (yaratıcı), Shift ile kenardan düşmeme
  - 4 köşeli zemin tespiti, kırılma süreleri ve alet çarpanları
  - 2×2 / 3×3 şekilli üretim, eşitleme (fetolama), yakıt/eritme, dayanıklılık barı
  - Kapı (çift kapı eşleme), meşale (yere/duvara, destek kırılınca düşer), sandık (tek/çift)
  - Düşen bloklar (kum/çakıl), sınırlı su simülasyonu, yaprak çürümesi
  - **TNT**: çakmak ve çelikle ateşlenir, yanıp söner, 5 saniye sonra patlar;
    tüm bloklarda MC 1.21.1 patlama dayanıklılığı tablosu geçerlidir
  - Çakıl kırınca %10 çakmak; çakmak + demir → çakmak ve çelik
  - Oksijen/boğulma, düşme hasarı, gün döngüsü
- Çoklu dünya kaydı (IndexedDB), 5 sn otomatik kayıt, dünya seçme/silme/oluşturma
- Dokusuz tek atlas (texture atlas), chunk başına 3 draw call, gölge haritası throttle
- Türkçe arayüz, MC 1.21.1 tarzı menü ve HUD

## Gereksinimler

- Modern bir tarayıcı (WebGL 2): Chrome / Edge / Firefox
- Statik bir dosya sunucusu (ES modülleri `file://` ile çalışmaz)
- İnternet bağlantısı (Three.js CDN'den, Google Fonts) — `js/core/` altına yerelde barındırılabilir

## Çalıştırma

```bash
# Depoyu klonla
git clone https://github.com/TurkYoshi1905/threejs-minecraft-project.git
cd threejs-minecraft-project

# Basit bir statik sunucu (herhangi biri iş görür)
python -m http.server 8123
# veya: npx serve .

# Tarayıcıda aç
# http://localhost:8123/
```

## Kontroller

| Tuş | İşlev |
|---|---|
| W A S D | Hareket |
| Mouse | Bakış (ekrana tıklayarak kilitle) |
| Space | Zıpla / Yüz / Uç (yaratıcıda) |
| Çift-Space | Uçma aç/kapat (yaratıcı) |
| Çift-W | Koş |
| Sol Shift | Sürün (kenardan düşmez) |
| Sol Tık | Kır (basılı tut) |
| Sağ Tık | Koy (basılı tut) / TNT'ye çakmak ve çelikle ateşle |
| 1–0 / Tekerlek | Hotbar seçimi |
| E | Envanter / masa / fırın / sandık kapat |
| T | Sohbet (`/give`, `/tp`, `/gamemode`, `/setblock`, `/time`, `/seed`, `/clear`, `/kill`, `/spawn`, `/help`) |
| H | Yardım |
| Esc | Duraklat / panel kapat |

## Dünya kaydı

Tüm dünya verisi tarayıcıda **IndexedDB**'de saklanır (`mc-clone-v2`).
Dünya listesi ana menüde görünür; silme işlemi chunk'ları da temizler.

## Debug bayrakları

URL'ye ekleyin: `?debug=perf` (FPS + kuyruk derinlikleri) · `?debug=lock` (pointer lock günlüğü) ·
`?debug=atlas` (atlas önizleme) · `?debug=drops` (düşen eşya istatistikleri) ·
`?debug=inv` (envanter sürükle-bırak günlüğü) · `?debug=noshadow` / `?debug=nohighlight`

## Bilinen sınırlamalar

- PvE yok (mob/açlık/XP sistemi yok; XP çubuğu dekoratiftir)
- Gelişmiş su: yalnızca SEA_LEVEL altında yayılır, kaynak spring mekanikleri yok
- Chunk üretimi ana thread'de (Web Worker yok); görüş mesafesi 8+'de takılma olabilir
- Mobil/dokunma kontrolü yok
- Barutun oyunda doğal kaynağı yok (creeper yok): TNT yalnızca yaratıcı/`/give` ile alınır

## Lisans ve atıflar

- Kaynak kod: [MIT](LICENSE)
- Dokular: Faithful 1.21.1 (bkz. `NOTICE`) — kendi lisans bildirimine tabidir
- Minecraft varlıkları Mojang'a aittir; bu proje kullanılmayan varlıklar için atıf sayfası içerir
