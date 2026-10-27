/**
 * Curated compound taxonomy — the primary location model (Section 8: "a curated
 * compounds table is the primary location taxonomy, not free-text addresses").
 *
 * 50 real New Cairo / 6th of October / Sheikh Zayed compounds. Size ranges and unit-type
 * lists are what the publish gate cross-checks an owner's typed details against, so they
 * are deliberately generous — ops tightens them per compound over time.
 */

export type SeedCompound = {
  nameEn: string;
  nameAr: string;
  slug: string;
  developer: string;
  area: string; // area slug
  lat: number;
  lng: number;
  minSizeSqm: number;
  maxSizeSqm: number;
  types: string[];
  /** Rough EGP/sqm resale benchmark used to generate believable seed listings. */
  sqmBenchmark: number;
};

/**
 * `isCoastal` drives the Coastal segment tab (src/lib/segments.ts). It is set per AREA
 * rather than per unit type, so every unit in Marassi counts as coastal regardless of
 * whether it is a chalet, a villa or an apartment.
 */
export const SEED_AREAS = [
  { slug: "new-cairo", nameEn: "New Cairo", nameAr: "القاهرة الجديدة", city: "Cairo", lat: 30.0281, lng: 31.4956 },
  { slug: "6th-october", nameEn: "6th of October", nameAr: "السادس من أكتوبر", city: "Giza", lat: 29.9668, lng: 30.9476 },
  { slug: "sheikh-zayed", nameEn: "Sheikh Zayed", nameAr: "الشيخ زايد", city: "Giza", lat: 30.0444, lng: 30.9756 },
  { slug: "mostakbal-city", nameEn: "Mostakbal City", nameAr: "مدينة المستقبل", city: "Cairo", lat: 30.0106, lng: 31.6247 },
  { slug: "el-shorouk", nameEn: "El Shorouk", nameAr: "مدينة الشروق", city: "Cairo", lat: 30.1218, lng: 31.6103 },
  { slug: "madinaty", nameEn: "Madinaty & New Heliopolis", nameAr: "مدينتي ومصر الجديدة الجديدة", city: "Cairo", lat: 30.0966, lng: 31.6486 },

  // --- Coastal -------------------------------------------------------------
  { slug: "north-coast", nameEn: "North Coast", nameAr: "الساحل الشمالي", city: "Matrouh", lat: 30.9285, lng: 28.8944, isCoastal: true },
  { slug: "ain-sokhna", nameEn: "Ain Sokhna", nameAr: "العين السخنة", city: "Suez", lat: 29.6003, lng: 32.3233, isCoastal: true },
  { slug: "el-gouna", nameEn: "El Gouna", nameAr: "الجونة", city: "Red Sea", lat: 27.3948, lng: 33.6789, isCoastal: true },
];

export const SEED_COMPOUNDS: SeedCompound[] = [
  // --- New Cairo -----------------------------------------------------------
  { nameEn: "Mivida", nameAr: "ميفيدا", slug: "mivida", developer: "Emaar Misr", area: "new-cairo", lat: 30.0176, lng: 31.4899, minSizeSqm: 110, maxSizeSqm: 620, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 62000 },
  { nameEn: "Villette", nameAr: "فيليت", slug: "villette", developer: "SODIC", area: "new-cairo", lat: 30.0031, lng: 31.4767, minSizeSqm: 120, maxSizeSqm: 700, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 66000 },
  { nameEn: "Eastown", nameAr: "إيستاون", slug: "eastown", developer: "SODIC", area: "new-cairo", lat: 30.0122, lng: 31.4452, minSizeSqm: 95, maxSizeSqm: 420, types: ["apartment", "duplex", "office", "retail"], sqmBenchmark: 64000 },
  { nameEn: "Hyde Park", nameAr: "هايد بارك", slug: "hyde-park", developer: "Hyde Park Developments", area: "new-cairo", lat: 30.0069, lng: 31.4966, minSizeSqm: 100, maxSizeSqm: 650, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 58000 },
  { nameEn: "Katameya Heights", nameAr: "قطامية هايتس", slug: "katameya-heights", developer: "Starlight Developments", area: "new-cairo", lat: 30.0019, lng: 31.4187, minSizeSqm: 180, maxSizeSqm: 1200, types: ["villa", "townhouse", "apartment"], sqmBenchmark: 78000 },
  { nameEn: "Palm Hills New Cairo", nameAr: "بالم هيلز نيو كايرو", slug: "palm-hills-new-cairo", developer: "Palm Hills Developments", area: "new-cairo", lat: 30.0243, lng: 31.4635, minSizeSqm: 130, maxSizeSqm: 800, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 70000 },
  { nameEn: "Taj City", nameAr: "تاج سيتي", slug: "taj-city", developer: "MNHD", area: "new-cairo", lat: 30.0954, lng: 31.3937, minSizeSqm: 90, maxSizeSqm: 520, types: ["apartment", "villa", "townhouse", "duplex", "studio"], sqmBenchmark: 52000 },
  { nameEn: "Sarai", nameAr: "سراي", slug: "sarai", developer: "MNHD", area: "new-cairo", lat: 29.9737, lng: 31.5344, minSizeSqm: 95, maxSizeSqm: 560, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 48000 },
  { nameEn: "Fifth Square", nameAr: "فيفث سكوير", slug: "fifth-square", developer: "Al Marasem", area: "new-cairo", lat: 30.0213, lng: 31.4788, minSizeSqm: 110, maxSizeSqm: 480, types: ["apartment", "duplex", "villa"], sqmBenchmark: 60000 },
  { nameEn: "Stone Residence", nameAr: "ستون ريزيدنس", slug: "stone-residence", developer: "Rooya Group", area: "new-cairo", lat: 30.0316, lng: 31.4879, minSizeSqm: 100, maxSizeSqm: 400, types: ["apartment", "duplex", "townhouse"], sqmBenchmark: 56000 },
  { nameEn: "Stone Park", nameAr: "ستون بارك", slug: "stone-park", developer: "Rooya Group", area: "new-cairo", lat: 30.0064, lng: 31.4599, minSizeSqm: 120, maxSizeSqm: 600, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 59000 },
  { nameEn: "The Address East", nameAr: "ذا أدرس إيست", slug: "the-address-east", developer: "Ora Developers", area: "new-cairo", lat: 30.0107, lng: 31.5228, minSizeSqm: 115, maxSizeSqm: 430, types: ["apartment", "duplex"], sqmBenchmark: 72000 },
  { nameEn: "Cairo Festival City", nameAr: "كايرو فستيفال سيتي", slug: "cairo-festival-city", developer: "Al-Futtaim Group", area: "new-cairo", lat: 30.0289, lng: 31.4076, minSizeSqm: 130, maxSizeSqm: 700, types: ["apartment", "villa", "townhouse", "office", "retail"], sqmBenchmark: 82000 },
  { nameEn: "Lake View Residence", nameAr: "ليك فيو ريزيدنس", slug: "lake-view-residence", developer: "El Hazek Construction", area: "new-cairo", lat: 30.0432, lng: 31.4548, minSizeSqm: 140, maxSizeSqm: 620, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 68000 },
  { nameEn: "Layan Residence", nameAr: "ليان ريزيدنس", slug: "layan-residence", developer: "Capital Group Properties", area: "new-cairo", lat: 30.0605, lng: 31.5049, minSizeSqm: 110, maxSizeSqm: 450, types: ["apartment", "townhouse", "villa"], sqmBenchmark: 45000 },
  { nameEn: "La Vista City", nameAr: "لافيستا سيتي", slug: "la-vista-city", developer: "La Vista Developments", area: "new-cairo", lat: 29.9942, lng: 31.6019, minSizeSqm: 150, maxSizeSqm: 700, types: ["villa", "townhouse", "apartment"], sqmBenchmark: 47000 },
  { nameEn: "Il Bosco City", nameAr: "إل بوسكو سيتي", slug: "il-bosco-city", developer: "Misr Italia Properties", area: "mostakbal-city", lat: 30.0069, lng: 31.6318, minSizeSqm: 100, maxSizeSqm: 520, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 44000 },
  { nameEn: "Bloomfields", nameAr: "بلوم فيلدز", slug: "bloomfields", developer: "Tatweer Misr", area: "mostakbal-city", lat: 30.0205, lng: 31.6531, minSizeSqm: 95, maxSizeSqm: 480, types: ["apartment", "villa", "townhouse", "studio"], sqmBenchmark: 42000 },
  { nameEn: "Green Square", nameAr: "جرين سكوير", slug: "green-square", developer: "Al Ahly Sabbour", area: "mostakbal-city", lat: 30.0031, lng: 31.6442, minSizeSqm: 110, maxSizeSqm: 500, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 41000 },
  { nameEn: "Sodic East", nameAr: "سوديك إيست", slug: "sodic-east", developer: "SODIC", area: "el-shorouk", lat: 30.1359, lng: 31.6238, minSizeSqm: 120, maxSizeSqm: 600, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 46000 },
  { nameEn: "Al Burouj", nameAr: "البروج", slug: "al-burouj", developer: "Capital Group Properties", area: "el-shorouk", lat: 30.1567, lng: 31.6194, minSizeSqm: 110, maxSizeSqm: 640, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 43000 },
  { nameEn: "Madinaty", nameAr: "مدينتي", slug: "madinaty", developer: "Talaat Moustafa Group", area: "madinaty", lat: 30.0966, lng: 31.6486, minSizeSqm: 95, maxSizeSqm: 900, types: ["apartment", "villa", "townhouse", "duplex", "studio"], sqmBenchmark: 50000 },
  { nameEn: "Al Rehab", nameAr: "الرحاب", slug: "al-rehab", developer: "Talaat Moustafa Group", area: "new-cairo", lat: 30.0592, lng: 31.4921, minSizeSqm: 85, maxSizeSqm: 600, types: ["apartment", "villa", "townhouse", "duplex", "studio"], sqmBenchmark: 44000 },
  { nameEn: "Mountain View iCity New Cairo", nameAr: "ماونتن فيو آي سيتي التجمع", slug: "mountain-view-icity-new-cairo", developer: "Mountain View", area: "new-cairo", lat: 30.0009, lng: 31.5417, minSizeSqm: 105, maxSizeSqm: 560, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 57000 },
  { nameEn: "Mountain View Hyde Park", nameAr: "ماونتن فيو هايد بارك", slug: "mountain-view-hyde-park", developer: "Mountain View", area: "new-cairo", lat: 30.0091, lng: 31.5033, minSizeSqm: 110, maxSizeSqm: 520, types: ["apartment", "townhouse", "villa"], sqmBenchmark: 59000 },
  { nameEn: "Village Gate", nameAr: "فيلدج جيت", slug: "village-gate", developer: "Palm Hills Developments", area: "new-cairo", lat: 30.0158, lng: 31.4381, minSizeSqm: 95, maxSizeSqm: 330, types: ["apartment", "duplex", "studio"], sqmBenchmark: 63000 },
  { nameEn: "Zizinia El Mostakbal", nameAr: "زيزينيا المستقبل", slug: "zizinia-el-mostakbal", developer: "Arabia Holding", area: "mostakbal-city", lat: 30.0157, lng: 31.6633, minSizeSqm: 100, maxSizeSqm: 460, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 40000 },
  { nameEn: "Marvel Zayed", nameAr: "مارفل زايد", slug: "marvel-zayed", developer: "Arabia Holding", area: "sheikh-zayed", lat: 30.0311, lng: 30.9711, minSizeSqm: 105, maxSizeSqm: 380, types: ["apartment", "duplex"], sqmBenchmark: 61000 },
  { nameEn: "Azzar", nameAr: "آزار", slug: "azzar", developer: "Reedy Group", area: "new-cairo", lat: 30.0341, lng: 31.5083, minSizeSqm: 130, maxSizeSqm: 540, types: ["apartment", "townhouse", "villa"], sqmBenchmark: 65000 },
  { nameEn: "Cairo Gate", nameAr: "كايرو جيت", slug: "cairo-gate", developer: "Emaar Misr", area: "sheikh-zayed", lat: 30.0462, lng: 31.0138, minSizeSqm: 120, maxSizeSqm: 600, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 76000 },
  { nameEn: "Mivida Parks", nameAr: "ميفيدا باركس", slug: "mivida-parks", developer: "Emaar Misr", area: "new-cairo", lat: 30.0204, lng: 31.4934, minSizeSqm: 140, maxSizeSqm: 480, types: ["apartment", "duplex"], sqmBenchmark: 67000 },
  { nameEn: "The Waterway New Cairo", nameAr: "ذا ووتر واي", slug: "the-waterway-new-cairo", developer: "The Waterway Developments", area: "new-cairo", lat: 30.0378, lng: 31.4713, minSizeSqm: 100, maxSizeSqm: 420, types: ["apartment", "duplex", "studio"], sqmBenchmark: 64000 },
  { nameEn: "Galleria Moon Valley", nameAr: "جاليريا مون فالي", slug: "galleria-moon-valley", developer: "Landmark Sabbour", area: "new-cairo", lat: 30.0053, lng: 31.4425, minSizeSqm: 150, maxSizeSqm: 650, types: ["villa", "townhouse", "apartment"], sqmBenchmark: 69000 },
  { nameEn: "Hacienda Bay East", nameAr: "هاسيندا إيست", slug: "hacienda-east", developer: "Palm Hills Developments", area: "new-cairo", lat: 30.0286, lng: 31.5296, minSizeSqm: 120, maxSizeSqm: 520, types: ["apartment", "townhouse", "villa"], sqmBenchmark: 55000 },
  { nameEn: "Anakaji", nameAr: "أناكاجي", slug: "anakaji", developer: "Emaar Misr", area: "new-cairo", lat: 30.0123, lng: 31.5511, minSizeSqm: 130, maxSizeSqm: 460, types: ["apartment", "duplex"], sqmBenchmark: 71000 },

  // --- 6th of October & Sheikh Zayed ---------------------------------------
  { nameEn: "Zed West", nameAr: "زيد ويست", slug: "zed-west", developer: "Ora Developers", area: "sheikh-zayed", lat: 30.0224, lng: 31.0042, minSizeSqm: 90, maxSizeSqm: 480, types: ["apartment", "duplex", "studio", "retail"], sqmBenchmark: 88000 },
  { nameEn: "SODIC West", nameAr: "سوديك ويست", slug: "sodic-west", developer: "SODIC", area: "sheikh-zayed", lat: 30.0568, lng: 30.9536, minSizeSqm: 120, maxSizeSqm: 700, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 67000 },
  { nameEn: "Beverly Hills", nameAr: "بيفرلي هيلز", slug: "beverly-hills", developer: "SODIC", area: "sheikh-zayed", lat: 30.0438, lng: 30.9663, minSizeSqm: 110, maxSizeSqm: 750, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 60000 },
  { nameEn: "Allegria", nameAr: "أليجريا", slug: "allegria", developer: "SODIC", area: "sheikh-zayed", lat: 30.0293, lng: 30.9257, minSizeSqm: 200, maxSizeSqm: 1100, types: ["villa", "townhouse", "apartment"], sqmBenchmark: 74000 },
  { nameEn: "O West", nameAr: "أو ويست", slug: "o-west", developer: "Orascom Development", area: "6th-october", lat: 29.9701, lng: 30.9063, minSizeSqm: 100, maxSizeSqm: 650, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 63000 },
  { nameEn: "Badya", nameAr: "بادية", slug: "badya", developer: "Palm Hills Developments", area: "6th-october", lat: 29.9312, lng: 30.8624, minSizeSqm: 95, maxSizeSqm: 560, types: ["apartment", "villa", "townhouse", "duplex", "studio"], sqmBenchmark: 46000 },
  { nameEn: "Palm Hills October", nameAr: "بالم هيلز أكتوبر", slug: "palm-hills-october", developer: "Palm Hills Developments", area: "6th-october", lat: 29.9884, lng: 30.9284, minSizeSqm: 130, maxSizeSqm: 800, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 58000 },
  { nameEn: "Palm Parks", nameAr: "بالم باركس", slug: "palm-parks", developer: "Palm Hills Developments", area: "6th-october", lat: 29.9757, lng: 30.9112, minSizeSqm: 110, maxSizeSqm: 420, types: ["apartment", "townhouse", "villa"], sqmBenchmark: 49000 },
  { nameEn: "Mountain View October Park", nameAr: "ماونتن فيو أكتوبر بارك", slug: "mountain-view-october-park", developer: "Mountain View", area: "6th-october", lat: 29.9553, lng: 30.9337, minSizeSqm: 105, maxSizeSqm: 500, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 51000 },
  { nameEn: "Dreamland", nameAr: "دريم لاند", slug: "dreamland", developer: "Bahgat Group", area: "6th-october", lat: 30.0125, lng: 31.0048, minSizeSqm: 120, maxSizeSqm: 900, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 42000 },
  { nameEn: "Gardenia Park", nameAr: "جاردينيا بارك", slug: "gardenia-park", developer: "Gardenia Developments", area: "6th-october", lat: 29.9612, lng: 30.9455, minSizeSqm: 100, maxSizeSqm: 400, types: ["apartment", "villa", "duplex"], sqmBenchmark: 38000 },
  { nameEn: "Sun Capital", nameAr: "صن كابيتال", slug: "sun-capital", developer: "Arabia Holding", area: "6th-october", lat: 29.9224, lng: 31.0157, minSizeSqm: 90, maxSizeSqm: 450, types: ["apartment", "villa", "townhouse", "studio"], sqmBenchmark: 40000 },
  { nameEn: "The Butterfly", nameAr: "ذا باترفلاي", slug: "the-butterfly", developer: "Arabia Holding", area: "6th-october", lat: 29.9766, lng: 30.9631, minSizeSqm: 95, maxSizeSqm: 330, types: ["apartment", "duplex", "studio"], sqmBenchmark: 45000 },
  { nameEn: "Etapa", nameAr: "إيتابا", slug: "etapa", developer: "City Edge Developments", area: "sheikh-zayed", lat: 30.0217, lng: 30.9628, minSizeSqm: 110, maxSizeSqm: 470, types: ["apartment", "duplex", "townhouse"], sqmBenchmark: 62000 },
  { nameEn: "Karma Gates", nameAr: "كارما جيتس", slug: "karma-gates", developer: "Karma Developments", area: "sheikh-zayed", lat: 30.0397, lng: 30.9391, minSizeSqm: 140, maxSizeSqm: 620, types: ["villa", "townhouse", "apartment"], sqmBenchmark: 64000 },
  { nameEn: "Vinci", nameAr: "فينشي", slug: "vinci", developer: "Misr Italia Properties", area: "6th-october", lat: 29.9438, lng: 30.9822, minSizeSqm: 110, maxSizeSqm: 540, types: ["apartment", "villa", "townhouse", "duplex"], sqmBenchmark: 47000 },
  { nameEn: "Zayed Dunes", nameAr: "زايد ديونز", slug: "zayed-dunes", developer: "El Masria Group", area: "sheikh-zayed", lat: 30.0129, lng: 30.9908, minSizeSqm: 100, maxSizeSqm: 360, types: ["apartment", "duplex", "studio"], sqmBenchmark: 54000 },
  { nameEn: "Nyoum October", nameAr: "نيوم أكتوبر", slug: "nyoum-october", developer: "Alwan Developments", area: "6th-october", lat: 29.9484, lng: 30.9048, minSizeSqm: 95, maxSizeSqm: 420, types: ["apartment", "villa", "townhouse"], sqmBenchmark: 39000 },
  { nameEn: "Ashgar City", nameAr: "أشجار سيتي", slug: "ashgar-city", developer: "IGI Real Estate", area: "6th-october", lat: 29.9031, lng: 30.8996, minSizeSqm: 85, maxSizeSqm: 380, types: ["apartment", "studio", "duplex"], sqmBenchmark: 35000 },
  // --- North Coast ---------------------------------------------------------
  { nameEn: "Marassi", nameAr: "مراسي", slug: "marassi", developer: "Emaar Misr", area: "north-coast", lat: 30.9727, lng: 28.6108, minSizeSqm: 90, maxSizeSqm: 700, types: ["chalet", "villa", "townhouse", "apartment", "studio"], sqmBenchmark: 112000 },
  { nameEn: "Hacienda Bay", nameAr: "هاسيندا باي", slug: "hacienda-bay", developer: "Palm Hills Developments", area: "north-coast", lat: 30.9819, lng: 28.6742, minSizeSqm: 95, maxSizeSqm: 650, types: ["chalet", "villa", "townhouse"], sqmBenchmark: 98000 },
  { nameEn: "Mountain View Ras El Hekma", nameAr: "ماونتن فيو رأس الحكمة", slug: "mountain-view-ras-el-hekma", developer: "Mountain View", area: "north-coast", lat: 31.1203, lng: 27.7981, minSizeSqm: 85, maxSizeSqm: 520, types: ["chalet", "villa", "townhouse", "apartment"], sqmBenchmark: 86000 },
  { nameEn: "Telal North Coast", nameAr: "تلال الساحل الشمالي", slug: "telal-north-coast", developer: "Roya Developments", area: "north-coast", lat: 30.9466, lng: 28.8113, minSizeSqm: 80, maxSizeSqm: 480, types: ["chalet", "villa", "townhouse"], sqmBenchmark: 74000 },
  { nameEn: "Sodic Caesar", nameAr: "سوديك قيصر", slug: "sodic-caesar", developer: "SODIC", area: "north-coast", lat: 30.9902, lng: 28.5417, minSizeSqm: 90, maxSizeSqm: 430, types: ["chalet", "apartment", "townhouse"], sqmBenchmark: 91000 },

  // --- Ain Sokhna ----------------------------------------------------------
  { nameEn: "IL Monte Galala", nameAr: "إل مونتي جلالة", slug: "il-monte-galala", developer: "Tatweer Misr", area: "ain-sokhna", lat: 29.5127, lng: 32.3486, minSizeSqm: 75, maxSizeSqm: 420, types: ["chalet", "apartment", "villa", "studio"], sqmBenchmark: 63000 },
  { nameEn: "La Vista Gardens", nameAr: "لافيستا جاردنز", slug: "la-vista-gardens", developer: "La Vista Developments", area: "ain-sokhna", lat: 29.6741, lng: 32.3402, minSizeSqm: 80, maxSizeSqm: 380, types: ["chalet", "villa", "townhouse"], sqmBenchmark: 55000 },
  { nameEn: "Telal Sokhna", nameAr: "تلال السخنة", slug: "telal-sokhna", developer: "Roya Developments", area: "ain-sokhna", lat: 29.5688, lng: 32.3301, minSizeSqm: 85, maxSizeSqm: 400, types: ["chalet", "villa"], sqmBenchmark: 58000 },

  // --- El Gouna ------------------------------------------------------------
  { nameEn: "Ancient Sands", nameAr: "أنشنت ساندز", slug: "ancient-sands", developer: "Orascom Development", area: "el-gouna", lat: 27.4021, lng: 33.6742, minSizeSqm: 95, maxSizeSqm: 520, types: ["apartment", "villa", "townhouse", "studio"], sqmBenchmark: 68000 },
  { nameEn: "Fanadir Bay", nameAr: "فنادير باي", slug: "fanadir-bay", developer: "Orascom Development", area: "el-gouna", lat: 27.3611, lng: 33.6884, minSizeSqm: 100, maxSizeSqm: 480, types: ["apartment", "villa", "chalet"], sqmBenchmark: 72000 },
  { nameEn: "Cyan El Gouna", nameAr: "سيان الجونة", slug: "cyan-el-gouna", developer: "Orascom Development", area: "el-gouna", lat: 27.4187, lng: 33.6693, minSizeSqm: 70, maxSizeSqm: 300, types: ["apartment", "studio", "chalet", "retail"], sqmBenchmark: 61000 },
];
