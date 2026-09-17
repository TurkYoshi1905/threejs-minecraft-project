// 1.21.1 uyumlu dünya sabitleri
export const MIN_Y = -64;          // en alt (bedrock katmanı)
export const MAX_Y = 319;          // son koyulabilir blok
export const WORLD_HEIGHT = MAX_Y - MIN_Y + 1; // 384
export const SEA_LEVEL = 62;
export const CHUNK_SIZE = 16;
export const SECTION_SIZE = 16;
export const SECTIONS_PER_CHUNK = WORLD_HEIGHT / SECTION_SIZE; // 24

export const BORDER_LIMIT = 250000; // ±250k => toplam genişlik 500.000 blok
export const REACH = 6;
export const EYE = 1.62;
export const PW = 0.3;
export const PH = 1.8;

export const RENDER_DISTANCE = 5;   // chunk yarıçapı (11x11=121 chunk, performans)
export const UNLOAD_DISTANCE = 7;   // bunun dışı bellekten atılır
export const GEN_BUDGET_PER_FRAME = 2;   // frame başına max chunk üretimi
export const MESH_BUDGET_PER_FRAME = 3;  // frame başına max meshleme

export const DB_NAME = 'mc-clone-v2';
// NOT: DB_VERSION js/core/idb.js içinde tutulur (şema oranın sorumluluğu).

export const DEFAULT_SEED = 'kanka-1211';
export const SAVE_AUTOSAVE_MS = 5000;
