// Blok kayıtları. ID'ler kalıcıdır (kayıt uyumluluğu için ASLA değiştirme, sadece ekle).
// 1-15 eski dünyayla uyumlu. 16+ yeni.

export const BLOCKS = {
  1:  { ad: 'Çimen',      top: 'grass_block_top',  side: 'grass_block_side', bottom: 'dirt' },
  2:  { ad: 'Toprak',     all: 'dirt' },
  3:  { ad: 'Taş',        all: 'stone' },
  4:  { ad: 'Kırma Taş',  all: 'cobblestone' },
  5:  { ad: 'Meşe Kütük', top: 'oak_log_top', side: 'oak_log', bottom: 'oak_log_top' },
  6:  { ad: 'Yaprak',     all: 'oak_leaves', saydam: true, cutout: true },
  7:  { ad: 'Meşe Tahta', all: 'oak_planks' },
  8:  { ad: 'Kum',        all: 'sand' },
  9:  { ad: 'Cam',        all: 'glass', saydam: true, transparent: true },
  10: { ad: 'Ana Kaya',   all: 'bedrock' },
  11: { ad: 'Kömür Cevheri',  all: 'coal_ore' },
  12: { ad: 'Demir Cevheri',  all: 'iron_ore' },
  13: { ad: 'Elmas Cevheri',  all: 'diamond_ore' },
  14: { ad: 'Tuğla',      all: 'bricks' },
  15: { ad: 'Çakıl',      all: 'gravel' },
  // --- Yeni (1.21 uyumu) ---
  16: { ad: 'Su',         all: 'water_still', saydam: true, transparent: true, sivi: true, secilemez: true },
  17: { ad: 'Derin Kayrak', all: 'deepslate' },
  18: { ad: 'Karlı Çimen', top: 'grass_block_snow', side: 'grass_block_side', bottom: 'dirt' },
  19: { ad: 'Kar Bloğu',  all: 'snow' },
  20: { ad: 'Çalışma Masası', top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'oak_planks' },
  21: { ad: 'Meşale', all: 'torch', saydam: true, isik: 14, cross: true, desteksiz: true },
  22: { ad: 'Fırın', top: 'furnace_top', side: 'furnace_side', front: 'furnace_front', bottom: 'furnace_top', furnace: true },
  23: { ad: 'Altın Cevheri', all: 'gold_ore' },
  24: { ad: 'Yanık Fırın', top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on', bottom: 'furnace_top', furnace: true, lit: true },
  25: { ad: 'Meşe Kapı', all: 'oak_door_bottom', door: true, saydam: true },
  26: { ad: 'Kapı Üstü', all: 'oak_door_top', door: true, gizli: true, saydam: true },
  27: { ad: 'Sandık', top: 'chest_top', side: 'chest_side', bottom: 'oak_planks',
        front: 'chest_front', frontL: 'chest_front_l', frontR: 'chest_front_r', chest: true },
  // --- Renkli Yünler (16 renk, Faithful 1.21.1) ---
  28: { ad: 'Beyaz Yün', all: 'white_wool' },
  29: { ad: 'Turuncu Yün', all: 'orange_wool' },
  30: { ad: 'Magenta Yün', all: 'magenta_wool' },
  31: { ad: 'Açık Mavi Yün', all: 'light_blue_wool' },
  32: { ad: 'Sarı Yün', all: 'yellow_wool' },
  33: { ad: 'Lime Yün', all: 'lime_wool' },
  34: { ad: 'Pembe Yün', all: 'pink_wool' },
  35: { ad: 'Gri Yün', all: 'gray_wool' },
  36: { ad: 'Açık Gri Yün', all: 'light_gray_wool' },
  37: { ad: 'Cyan Yün', all: 'cyan_wool' },
  38: { ad: 'Mor Yün', all: 'purple_wool' },
  39: { ad: 'Mavi Yün', all: 'blue_wool' },
  40: { ad: 'Kahverengi Yün', all: 'brown_wool' },
  41: { ad: 'Yeşil Yün', all: 'green_wool' },
  42: { ad: 'Kırmızı Yün', all: 'red_wool' },
  43: { ad: 'Siyah Yün', all: 'black_wool' },
  // --- Yeni Bloklar (20 adet) ---
  // Terrakota serisi: düz terracotta (siray/renksiz) = ID 44, sonra 16 renkli varyant = ID 45-60
  44: { ad: 'Düz Terrakota', all: 'terracotta' },           // renksiz/siray terrakotta
  45: { ad: 'Beyaz Terrakota', all: 'white_terracotta' },
  46: { ad: 'Turuncu Terrakota', all: 'orange_terracotta' },
  47: { ad: 'Magenta Terrakota', all: 'magenta_terracotta' },
  48: { ad: 'Açık Mavi Terrakota', all: 'light_blue_terracotta' },
  49: { ad: 'Sarı Terrakota', all: 'yellow_terracotta' },
  50: { ad: 'Lime Terrakota', all: 'lime_terracotta' },
  51: { ad: 'Pembe Terrakota', all: 'pink_terracotta' },
  52: { ad: 'Gri Terrakota', all: 'gray_terracotta' },
  53: { ad: 'Açık Gri Terrakota', all: 'light_gray_terracotta' },
  54: { ad: 'Cyan Terrakota', all: 'cyan_terracotta' },
  55: { ad: 'Mor Terrakota', all: 'purple_terracotta' },
  56: { ad: 'Mavi Terrakota', all: 'blue_terracotta' },
  57: { ad: 'Kahverengi Terrakota', all: 'brown_terracotta' },
  58: { ad: 'Yeşil Terrakota', all: 'green_terracotta' },
  59: { ad: 'Kırmızı Terrakota', all: 'red_terracotta' },
  60: { ad: 'Siyah Terrakota', all: 'black_terracotta' },
  61: { ad: 'Beyaz Beton', all: 'white_concrete' },
  62: { ad: 'Taşı Tuğla', all: 'stone_bricks' },
  63: { ad: 'Mosslu Taşı Tuğla', all: 'mossy_stone_bricks' },
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
};


