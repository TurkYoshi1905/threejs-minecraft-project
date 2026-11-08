// Blok kayıtları. ID'ler kalıcıdır (kayıt uyumluluğu için ASLA değiştirme, sadece ekle).
// 1-15 eski dünyayla uyumlu. 16+ yeni.
// blast = Minecraft 1.21.1 patlama dayanıklılığı (TNT patlaması buna göre bloğu yıkar/yıkamaz).

export const BLOCKS = {
  1:  { ad: 'Çimen',      top: 'grass_block_top',  side: 'grass_block_side', bottom: 'dirt', blast: 0.6 },
  2:  { ad: 'Toprak',     all: 'dirt', blast: 0.5 },
  3:  { ad: 'Taş',        all: 'stone', blast: 6 },
  4:  { ad: 'Kırma Taş',  all: 'cobblestone', blast: 6 },
  5:  { ad: 'Meşe Kütük', top: 'oak_log_top', side: 'oak_log', bottom: 'oak_log_top', blast: 2 },
  6:  { ad: 'Yaprak',     all: 'oak_leaves', saydam: true, cutout: true, blast: 0.2 },
  7:  { ad: 'Meşe Tahta', all: 'oak_planks', blast: 2 },
  8:  { ad: 'Kum',        all: 'sand', blast: 0.5 },
  9:  { ad: 'Cam',        all: 'glass', saydam: true, transparent: true, blast: 0.3 },
  10: { ad: 'Ana Kaya',   all: 'bedrock', blast: 3600000 },
  11: { ad: 'Kömür Cevheri',  all: 'coal_ore', blast: 3 },
  12: { ad: 'Demir Cevheri',  all: 'iron_ore', blast: 3 },
  13: { ad: 'Elmas Cevheri',  all: 'diamond_ore', blast: 3 },
  14: { ad: 'Tuğla',      all: 'bricks', blast: 3 },
  15: { ad: 'Çakıl',      all: 'gravel', blast: 0.6 },
  // --- Yeni (1.21 uyumu) ---
  16: { ad: 'Su',         all: 'water_still', saydam: true, transparent: true, sivi: true, secilemez: true, blast: 100 },
  17: { ad: 'Derin Kayrak', all: 'deepslate', blast: 6 },
  18: { ad: 'Karlı Çimen', top: 'grass_block_snow', side: 'grass_block_side', bottom: 'dirt', blast: 0.6 },
  19: { ad: 'Kar Bloğu',  all: 'snow', blast: 0.2 },
  20: { ad: 'Çalışma Masası', top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'oak_planks', blast: 2.5 },
  21: { ad: 'Meşale', all: 'torch', saydam: true, isik: 14, cross: true, desteksiz: true, blast: 0 },
  22: { ad: 'Fırın', top: 'furnace_top', side: 'furnace_side', front: 'furnace_front', bottom: 'furnace_top', furnace: true, blast: 3.5 },
  23: { ad: 'Altın Cevheri', all: 'gold_ore', blast: 3 },
  24: { ad: 'Yanık Fırın', top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on', bottom: 'furnace_top', furnace: true, lit: true, blast: 3.5 },
  25: { ad: 'Meşe Kapı', all: 'oak_door_bottom', door: true, saydam: true, blast: 3 },
  26: { ad: 'Kapı Üstü', all: 'oak_door_top', door: true, gizli: true, saydam: true, blast: 3 },
  27: { ad: 'Sandık', top: 'chest_top', topL: 'chest_top_l', topR: 'chest_top_r', side: 'chest_side', bottom: 'chest_bottom',
        front: 'chest_front', frontL: 'chest_front_l', frontR: 'chest_front_r', chest: true, blast: 2.5 },
  // --- Renkli Yünler (16 renk, Faithful 1.21.1) ---
  28: { ad: 'Beyaz Yün', all: 'white_wool', blast: 0.8 },
  29: { ad: 'Turuncu Yün', all: 'orange_wool', blast: 0.8 },
  30: { ad: 'Magenta Yün', all: 'magenta_wool', blast: 0.8 },
  31: { ad: 'Açık Mavi Yün', all: 'light_blue_wool', blast: 0.8 },
  32: { ad: 'Sarı Yün', all: 'yellow_wool', blast: 0.8 },
  33: { ad: 'Lime Yün', all: 'lime_wool', blast: 0.8 },
  34: { ad: 'Pembe Yün', all: 'pink_wool', blast: 0.8 },
  35: { ad: 'Gri Yün', all: 'gray_wool', blast: 0.8 },
  36: { ad: 'Açık Gri Yün', all: 'light_gray_wool', blast: 0.8 },
  37: { ad: 'Cyan Yün', all: 'cyan_wool', blast: 0.8 },
  38: { ad: 'Mor Yün', all: 'purple_wool', blast: 0.8 },
  39: { ad: 'Mavi Yün', all: 'blue_wool', blast: 0.8 },
  40: { ad: 'Kahverengi Yün', all: 'brown_wool', blast: 0.8 },
  41: { ad: 'Yeşil Yün', all: 'green_wool', blast: 0.8 },
  42: { ad: 'Kırmızı Yün', all: 'red_wool', blast: 0.8 },
  43: { ad: 'Siyah Yün', all: 'black_wool', blast: 0.8 },
  // --- Yeni Bloklar (20 adet) ---
  // Terrakota serisi: düz terracotta (siray/renksiz) = ID 44, sonra 16 renkli varyant = ID 45-60
  44: { ad: 'Düz Terrakota', all: 'terracotta', blast: 0.8 },           // renksiz/siray terrakotta
  45: { ad: 'Beyaz Terrakota', all: 'white_terracotta', blast: 0.8 },
  46: { ad: 'Turuncu Terrakota', all: 'orange_terracotta', blast: 0.8 },
  47: { ad: 'Magenta Terrakota', all: 'magenta_terracotta', blast: 0.8 },
  48: { ad: 'Açık Mavi Terrakota', all: 'light_blue_terracotta', blast: 0.8 },
  49: { ad: 'Sarı Terrakota', all: 'yellow_terracotta', blast: 0.8 },
  50: { ad: 'Lime Terrakota', all: 'lime_terracotta', blast: 0.8 },
  51: { ad: 'Pembe Terrakota', all: 'pink_terracotta', blast: 0.8 },
  52: { ad: 'Gri Terrakota', all: 'gray_terracotta', blast: 0.8 },
  53: { ad: 'Açık Gri Terrakota', all: 'light_gray_terracotta', blast: 0.8 },
  54: { ad: 'Cyan Terrakota', all: 'cyan_terracotta', blast: 0.8 },
  55: { ad: 'Mor Terrakota', all: 'purple_terracotta', blast: 0.8 },
  56: { ad: 'Mavi Terrakota', all: 'blue_terracotta', blast: 0.8 },
  57: { ad: 'Kahverengi Terrakota', all: 'brown_terracotta', blast: 0.8 },
  58: { ad: 'Yeşil Terrakota', all: 'green_terracotta', blast: 0.8 },
  59: { ad: 'Kırmızı Terrakota', all: 'red_terracotta', blast: 0.8 },
  60: { ad: 'Siyah Terrakota', all: 'black_terracotta', blast: 0.8 },
  61: { ad: 'Beyaz Beton', all: 'white_concrete', blast: 1.8 },
  62: { ad: 'Taşı Tuğla', all: 'stone_bricks', blast: 6 },
  63: { ad: 'Mosslu Taşı Tuğla', all: 'mossy_stone_bricks', blast: 6 },
  // --- TNT + Huş/Ladin seti (Faithful 1.21.1) ---
  64: { ad: 'TNT', top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom', blast: 0 },
  65: { ad: 'Huş Kütüğü', top: 'birch_log_top', side: 'birch_log', bottom: 'birch_log_top', blast: 2 },
  66: { ad: 'Huş Tahtası', all: 'birch_planks', blast: 2 },
  67: { ad: 'Huş Yaprağı', all: 'birch_leaves', saydam: true, cutout: true, blast: 0.2 },
  68: { ad: 'Ladin Kütüğü', top: 'spruce_log_top', side: 'spruce_log', bottom: 'spruce_log_top', blast: 2 },
  69: { ad: 'Ladin Tahtası', all: 'spruce_planks', blast: 2 },
  70: { ad: 'Ladin Yaprağı', all: 'spruce_leaves', saydam: true, cutout: true, blast: 0.2 },
  // --- Maden Blokları ve Cevherler (Faithful 1.21.1) ---
  71: { ad: 'Kömür Bloğu', all: 'coal_block', blast: 2.5 },
  72: { ad: 'Demir Bloğu', all: 'iron_block', blast: 6 },
  73: { ad: 'Altın Bloğu', all: 'gold_block', blast: 6 },
  74: { ad: 'Elmas Bloğu', all: 'diamond_block', blast: 6 },
  75: { ad: 'Lapis Lazuli Cevheri', all: 'lapis_ore', blast: 3 },
  76: { ad: 'Lapis Lazuli Bloğu', all: 'lapis_block', blast: 3 },
  77: { ad: 'Redstone Cevheri', all: 'redstone_ore', blast: 3 },
  78: { ad: 'Redstone Bloğu', all: 'redstone_block', blast: 6 },
  79: { ad: 'Zümrüt Cevheri', all: 'emerald_ore', blast: 3 },
  80: { ad: 'Zümrüt Bloğu', all: 'emerald_block', blast: 6 },
  81: { ad: 'Bakır Cevheri', all: 'copper_ore', blast: 3 },
  82: { ad: 'Bakır Bloğu', all: 'copper_block', blast: 6 },
  83: { ad: 'Ham Demir Bloğu', all: 'raw_iron_block', blast: 6 },
  84: { ad: 'Ham Altın Bloğu', all: 'raw_gold_block', blast: 6 },
  85: { ad: 'Ham Bakır Bloğu', all: 'raw_copper_block', blast: 6 },
};

export const HOTBAR_DEFAULT = [1, 2, 3, 4, 7, 5, 6, 8, 9, 14];

export function isOpaque(id) {
  if (!id) return false;
  const b = BLOCKS[id];
  if (!b) return true;
  return !b.saydam;
}

// Kırma süreleri: EL ile saniye = MC sertlik x 1.5 (Wiki tablosu).
// Dogrusal alet: /hiz. Ornek: tas+demir kazma 2.25/6 = 0.375sn (MC ile ayni).
export const BREAK_TIME = {
  1: 0.9, 2: 0.75, 3: 2.25, 4: 3.0, 5: 3.0, 6: 0.3, 7: 3.0,
  8: 0.75, 9: 0.45, 10: Infinity, 11: 4.5, 12: 4.5, 13: 4.5,
  14: 3.0, 15: 0.9, 17: 4.5, 18: 0.9, 19: 0.3, 20: 3.75, 21: 0.05, 22: 5.25, 23: 4.5, 24: 5.25, 25: 4.5, 26: 4.5, 27: 3.75,
  // Yünler
  28: 0.3, 29: 0.3, 30: 0.3, 31: 0.3, 32: 0.3, 33: 0.3, 34: 0.3, 35: 0.3,
  36: 0.3, 37: 0.3, 38: 0.3, 39: 0.3, 40: 0.3, 41: 0.3, 42: 0.3, 43: 0.3,
  // Terrakotalar
  44: 0.7, 45: 0.7, 46: 0.7, 47: 0.7, 48: 0.7, 49: 0.7, 50: 0.7, 51: 0.7,
  52: 0.7, 53: 0.7, 54: 0.7, 55: 0.7, 56: 0.7, 57: 0.7, 58: 0.7, 59: 0.7,
  60: 0.7,
  // Beton ve taşı tuğla
  61: 0.9, 62: 1.5, 63: 1.5,
  // TNT (MC: sıfır sertlik, elle anında kırılır) + Huş/Ladin seti
  64: 0, 65: 3.0, 66: 3.0, 67: 0.3, 68: 3.0, 69: 3.0, 70: 0.3,
  // Maden blokları ve cevherler
  71: 7.5, 72: 7.5, 73: 4.5, 74: 7.5,
  75: 4.5, 76: 4.5, 77: 4.5, 78: 7.5, 79: 4.5, 80: 7.5, 81: 4.5, 82: 4.5,
  83: 4.5, 84: 4.5, 85: 4.5,
};
