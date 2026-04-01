/**
 * Simplified border polygons for major historical empires at their peak extent.
 * Each polygon is an array of [lat, lng] points approximating the empire boundary.
 * Coordinates are geographically approximate but recognizable on a globe.
 */

export interface Empire {
  id: string;
  name: string;
  color: string;
  startYear: number;
  endYear: number;
  peakYear: number;
  polygon: [number, number][]; // [lat, lng][]
}

export const EMPIRES: Empire[] = [
  {
    id: 'roman',
    name: 'Roman Empire',
    color: '#e63946',
    startYear: -27,
    endYear: 476,
    peakYear: 117,
    polygon: [
      // Starting from Britannia, going clockwise around the Mediterranean
      [55, -4],    // Northern Britain
      [51, 1],     // Southeast England
      [49, -2],    // Normandy coast
      [48, 2],     // Paris region
      [47, 7],     // Rhine frontier (upper)
      [50, 8],     // Rhine frontier (middle)
      [51, 12],    // Germanic frontier
      [48, 16],    // Danube frontier (Vienna)
      [45, 20],    // Danube (Serbia)
      [44, 26],    // Danube (Romania)
      [42, 28],    // Black Sea coast (Bulgaria)
      [41, 32],    // Bosphorus region
      [38, 35],    // Central Anatolia
      [37, 40],    // Eastern Anatolia
      [36, 44],    // Mesopotamia (peak extent)
      [33, 44],    // Baghdad region
      [31, 36],    // Judea / Palestine
      [30, 33],    // Sinai
      [28, 33],    // Egypt (Red Sea coast)
      [24, 33],    // Upper Egypt
      [30, 30],    // Nile Delta
      [32, 22],    // Cyrenaica
      [33, 12],    // Tripolitania
      [35, 8],     // Tunisia
      [36, 3],     // Algeria coast
      [35, -1],    // Morocco coast
      [36, -6],    // Strait of Gibraltar
      [38, -8],    // Portugal coast
      [41, -8],    // Northwest Iberia
      [43, -3],    // Northern Spain
      [43, 0],     // Pyrenees
      [43, 5],     // Southern France
      [44, 8],     // Liguria
      [46, 10],    // Alps
      [47, 13],    // Noricum
      [55, -4],    // Close back to Britannia
    ],
  },
  {
    id: 'mongol',
    name: 'Mongol Empire',
    color: '#457b9d',
    startYear: 1206,
    endYear: 1368,
    peakYear: 1279,
    polygon: [
      // Massive empire from Korea to Eastern Europe
      [55, 22],    // Eastern Europe (Poland border)
      [50, 24],    // Ukraine
      [47, 30],    // Southern Ukraine
      [45, 35],    // Crimea region
      [42, 40],    // Caucasus
      [38, 44],    // Northern Iraq
      [35, 50],    // Iran
      [30, 55],    // Southern Iran
      [25, 60],    // Persian Gulf coast
      [28, 65],    // Afghanistan
      [25, 68],    // Indus region
      [30, 72],    // Northern India border
      [35, 72],    // Kashmir
      [35, 78],    // Tibet border
      [30, 85],    // Central Tibet
      [28, 90],    // Eastern Tibet
      [25, 98],    // Yunnan
      [22, 105],   // Southern China
      [24, 112],   // Guangdong
      [30, 118],   // Eastern China coast
      [35, 120],   // Shandong
      [40, 122],   // Manchuria coast
      [42, 130],   // Korea
      [47, 135],   // Primorsky
      [53, 130],   // Amur region
      [55, 120],   // Northern Manchuria
      [52, 110],   // Mongolia east
      [50, 95],    // Mongolia center
      [52, 85],    // Altai
      [55, 75],    // Western Siberia
      [55, 60],    // Ural region
      [55, 45],    // Volga region
      [55, 35],    // Russian steppe
      [55, 22],    // Close to Eastern Europe
    ],
  },
  {
    id: 'ottoman',
    name: 'Ottoman Empire',
    color: '#2a9d8f',
    startYear: 1299,
    endYear: 1922,
    peakYear: 1683,
    polygon: [
      // At peak: Balkans, Anatolia, Middle East, North Africa
      [48, 16],    // Hungary (peak extent)
      [48, 20],    // Eastern Hungary
      [46, 22],    // Transylvania border
      [44, 26],    // Wallachia
      [42, 28],    // Bulgaria / Black Sea
      [42, 34],    // Northern Anatolia coast
      [41, 40],    // Eastern Black Sea
      [38, 44],    // Eastern Anatolia
      [37, 44],    // Kurdistan
      [33, 44],    // Baghdad
      [30, 47],    // Basra
      [27, 49],    // Kuwait region
      [23, 40],    // Western Arabia
      [18, 42],    // Yemen coast
      [13, 44],    // Horn of Africa
      [22, 38],    // Hejaz
      [26, 35],    // Medina region
      [28, 34],    // Sinai
      [30, 31],    // Egypt
      [24, 33],    // Upper Egypt
      [31, 25],    // Cyrenaica
      [33, 13],    // Tripoli
      [35, 10],    // Tunisia
      [37, 3],     // Algeria coast
      [36, -1],    // Western Algeria
      [38, 0],     // Western Mediterranean
      [37, 15],    // Sicily region
      [39, 18],    // Southern Italy (briefly)
      [40, 20],    // Albania
      [42, 20],    // Macedonia
      [44, 16],    // Bosnia
      [46, 16],    // Croatia border
      [48, 16],    // Close to Hungary
    ],
  },
  {
    id: 'british',
    name: 'British Empire',
    color: '#e9c46a',
    startYear: 1583,
    endYear: 1997,
    peakYear: 1920,
    polygon: [
      // Simplified: focusing on core connected territories
      // The British Empire was scattered; we show a rough "influence zone"
      // centered on the British Isles + major holdings
      // Using a simplified outline of primary territories circa 1920
      // British Isles core
      [58, -6],    // Scotland
      [55, -2],    // Northeast England
      [51, 1],     // Southeast England
      [50, -5],    // Cornwall
      [52, -10],   // Ireland
      [55, -8],    // Northern Ireland
      [58, -6],    // Close Scotland
    ],
  },
  {
    id: 'british_india',
    name: 'British India',
    color: '#e9c46a',
    startYear: 1757,
    endYear: 1947,
    peakYear: 1920,
    polygon: [
      // Indian subcontinent
      [35, 74],    // Kashmir
      [33, 76],    // Ladakh
      [30, 80],    // Northern India
      [28, 84],    // Nepal border
      [27, 88],    // Sikkim
      [26, 92],    // Assam
      [22, 94],    // Burma border
      [18, 95],    // Myanmar
      [12, 80],    // Southern India east
      [8, 77],     // Sri Lanka region
      [10, 76],    // Kerala
      [15, 73],    // Goa
      [20, 72],    // Western India
      [24, 67],    // Sindh
      [28, 62],    // Baluchistan
      [30, 66],    // Western frontier
      [33, 70],    // Northwest frontier
      [35, 74],    // Close Kashmir
    ],
  },
  {
    id: 'british_africa',
    name: 'British Africa',
    color: '#e9c46a',
    startYear: 1800,
    endYear: 1965,
    peakYear: 1920,
    polygon: [
      // Cape to Cairo corridor (simplified)
      [31, 30],    // Egypt (Suez)
      [22, 33],    // Sudan north
      [12, 34],    // Sudan south
      [4, 32],     // Uganda
      [0, 35],     // Kenya
      [-4, 37],    // Tanzania
      [-10, 35],   // Southern Tanzania
      [-15, 30],   // Malawi
      [-20, 28],   // Zimbabwe
      [-25, 28],   // South Africa north
      [-34, 26],   // South Africa east
      [-34, 18],   // Cape Town
      [-28, 16],   // Namibia coast
      [-22, 24],   // Botswana
      [-15, 27],   // Zambia
      [-8, 30],    // Congo border
      [2, 32],     // Uganda west
      [5, 30],     // South Sudan
      [15, 32],    // Sudan
      [22, 31],    // Egypt south
      [30, 30],    // Egypt north
      [31, 30],    // Close Egypt
    ],
  },
  {
    id: 'han',
    name: 'Han Dynasty',
    color: '#f4a261',
    startYear: -206,
    endYear: 220,
    peakYear: -100,
    polygon: [
      // Han Dynasty at roughly 100 CE
      [42, 80],    // Western Regions (Xinjiang)
      [40, 90],    // Tarim Basin
      [42, 98],    // Gansu Corridor
      [41, 105],   // Inner Mongolia
      [42, 112],   // Northern frontier
      [42, 118],   // Hebei
      [40, 122],   // Liaodong
      [38, 124],   // Korea border
      [35, 120],   // Shandong
      [32, 122],   // Jiangsu coast
      [30, 121],   // Shanghai region
      [28, 120],   // Zhejiang
      [25, 118],   // Fujian
      [23, 114],   // Guangdong
      [22, 108],   // Guangxi
      [21, 106],   // Vietnam border
      [23, 103],   // Yunnan
      [26, 100],   // Southwest China
      [28, 98],    // Western Sichuan
      [30, 97],    // Eastern Tibet border
      [32, 95],    // Qinghai
      [35, 90],    // Northern Tibet border
      [38, 83],    // Tarim Basin south
      [42, 80],    // Close Western Regions
    ],
  },
  {
    id: 'achaemenid',
    name: 'Achaemenid (Persian) Empire',
    color: '#a855f7',
    startYear: -550,
    endYear: -330,
    peakYear: -500,
    polygon: [
      // From Egypt/Libya to Indus, Thrace to Persian Gulf
      [42, 26],    // Thrace (European side)
      [41, 29],    // Bosphorus
      [39, 32],    // Central Anatolia
      [37, 36],    // Cilicia
      [38, 40],    // Eastern Anatolia
      [40, 44],    // Armenia
      [40, 50],    // Caspian south shore
      [38, 55],    // Turkmenistan
      [37, 62],    // Afghanistan north
      [35, 68],    // Hindu Kush
      [32, 70],    // Gandhara (Indus)
      [28, 68],    // Sindh
      [25, 62],    // Southern Pakistan
      [26, 57],    // Makran coast
      [27, 52],    // Persian Gulf east
      [24, 52],    // Oman coast
      [26, 48],    // Persian Gulf
      [30, 48],    // Mesopotamia south
      [33, 44],    // Mesopotamia center
      [35, 40],    // Northern Mesopotamia
      [34, 36],    // Syria
      [31, 35],    // Palestine
      [30, 32],    // Sinai
      [26, 33],    // Egypt (Nile)
      [22, 33],    // Upper Egypt
      [30, 30],    // Nile Delta
      [32, 24],    // Cyrenaica (Libya)
      [35, 24],    // Crete region
      [37, 26],    // Aegean
      [40, 26],    // Thrace
      [42, 26],    // Close Thrace
    ],
  },
];
