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
  - Düşen bloklar (kum/çakıl), yaprak çürümesi
  - **Sıvı motoru (MC 1.21.1 seviye sistemi)**: kaynak/akan ayrımı blok id'sine gömülü
    (`16` su kaynağı, `87` lav kaynağı, `88–94` akan su seviye 1–7, `95–97` akan lav seviye 1–3),
    böylece seviye chunk ile birlikte otomatik kaydedilir. "Kısa yol kazanır" kuralı:
    seviye = 1 + min(yatay komşu seviyesi). Su kaynağı **7 blok**, lav kaynağı **3 blok**
    yana yayılır → 2×2 su **sonsuz**, 2×2 lav **sınırlı** (MC kuralı).
    Su her yükseklikte akar, yerçekimiyle düşer, çukurları doldurur, kazılan yan boşlukları doldurur;
    kaynak kalkınca sıvı geri çekilir. Lav **yavaştır** (su 4 tick/sn, lav 2 tick/sn).
    Lav kaynağı + su → **obsidyen**, akan lav + su → **çakıltaşı** (MC).
    Sıvı blokları kırılamaz (MC) — yalnızca kova ile alınır/konur; su altında blok koyulabilir.
  - **Lav**: derinde mağara lav havuzları (Y≤-8, ~%10 chunk) + nadir yüzey lav çukurları
    (MC badlands tarzı: çukur + yükseltilmiş obsidyen çember, ~%2 chunk, spawn'dan uzak),
    lav ışığı (seviye 15, meşale gibi taxicab sönüm), lav yanıcı blokları tutuşturur,
    oyuncu lavın **içine girebilir** (yavaş batma, Space ile yavaş yüzme, 4 HP/sn hasar)
  - **Kova**: V şeklinde 3 demir → kova; **yalnızca kaynaktan** sıvı kapar (MC), dolu kova ile
    hedef hücreye sıvı konur, boş kova katı yüzeye **kova bloğu** olarak yerleştirilebilir
  - **Zırh**: Demir/Altın/Elmas × miğfer/gömlek/bacak/bot (MC 1.21.1 puanları:
    2/6/5/2, 2/5/3/1, 3/8/6/3 — toplam üstü 80% azalma, eşyanın başı %4/puan);
    envanterde zırh takma slotları, HUD'da zırh barı (Faithful),
    düşme hasarı dahil tüm hasarda geçer
  - **HUD sprite seti**: kalp / oksijen / zırh / XP (Faithful 1.21.1)
  - **TNT**: çakmak ve çelikle ateşlenir, yanıp söner, 5 saniye sonra patlar;
    tüm bloklarda MC 1.21.1 patlama dayanıklılığı tablosu geçerlidir
  - Çakıl kırınca %10 çakmak; çakmak + demir → çakmak ve çelik
  - Oksijen/boğulma, düşme hasarı, gün döngüsü
  - **Ateş**: çakmak ve çelikle ateşlenir, animasyonlu Faithful alevi, ışık yayar,
    odun/yaprak/tahta/yün/terrakotaları yakar ve yayılır, suda söner, tepeden atılan eşyaları yakıp yok eder
  - **Madenler**: bakır, lapis lazuli, redstone, zümrüt — cevher + blok haline getirme (9↔1),
    çift yönlü craft tarifleri, ham/külde bloklar, füzyon ile bütün maden ailesi tam
  - **Işıklandırma**: meşale MC seviye 14, her blok 1 sönümlenme (taxicab); ateş seviye 15;
    yeraltı ve kapalı iç mekanlar karanlık (blocked-above occlusion); gece MC 1.21.1 gibi karanlık
  - **Sandık birleştirme** kanunu: yan yana konulan iki sandık 1 sandık olarak görünür (MC),
    ateşlemeden sonra tarama ile de korunur; sandık kırılınca içindekiler yere saçılır (iki modda da)
- Çoklu dünya kaydı (IndexedDB), 5 sn otomatik kayıt, dünya seçme/silme/oluşturma
- Dokusuz tek atlas (texture atlas), chunk başına 3 draw call, gölge haritası throttle
- **Çok dilli arayüz** (Türkçe / İngilizce), ilk girişte profesyonel karşılama ekranı (oyuncu adı + dil),
  kayıt tarayıcıda kalır, sohbette oyuncu adı görünür, ayarlardan her zaman değiştirilebilir
- **Envanter/masa/fırın/sandık/pause** açılınca oyun donmaz (MC paritesi)
- Modern tarayıcı + WebGL 2
- `vendor/three.module.js` — Three.js artık yerelde (CDN gerekmez)
- **Performans sekmesi**: Render Ölçeği (%50-100), Gölgeler/Bulutlar (aç/kapa),
  FPS sınırı (30-144/sınırsız), Dünya Yükleme Hızı (sakin/dengeli/hızlı),
  Grafik Hızı (hızlı=perf preset / güzel=full), partikül ve altyazı desteği

## Gereksinimler

- Modern bir tarayıcı (WebGL 2): Chrome / Edge / Firefox
- Statik bir dosya sunucusu (ES modülleri `file://` ile çalışmaz)
- Google Fonts internet bağlantısı (oyun yerel three.js ile çalışır)
- Three.js yerel `vendor/three.module.js` içinde — CDN gerekmez

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
