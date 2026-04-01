/**
 * Knowledge Lenses — explore history through thematic perspectives.
 *
 * A lens filters the timeline, generates relevant events, and provides
 * thematic context. Think of it as putting on "glasses" that make the
 * entire timeline about one topic.
 */

export interface KnowledgeLens {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: 'academic' | 'thematic' | 'custom';
  tags: string[];
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Pre-built Academic Lenses (~15)                                    */
/* ------------------------------------------------------------------ */

export const ACADEMIC_LENSES: KnowledgeLens[] = [
  {
    id: 'military',
    name: 'Military History',
    emoji: '⚔️',
    description: 'Wars, battles, strategy, and the evolution of conflict from ancient armies to modern warfare.',
    category: 'academic',
    tags: ['war', 'battle', 'army', 'siege', 'military', 'conflict', 'invasion', 'defense', 'strategy', 'warfare', 'weapon', 'navy', 'cavalry'],
    color: '#dc143c',
  },
  {
    id: 'science',
    name: 'History of Science',
    emoji: '🔬',
    description: 'Scientific breakthroughs, paradigm shifts, and the people who reshaped our understanding of reality.',
    category: 'academic',
    tags: ['science', 'discovery', 'physics', 'chemistry', 'biology', 'astronomy', 'experiment', 'theory', 'research', 'laboratory', 'mathematics'],
    color: '#4169e1',
  },
  {
    id: 'art',
    name: 'Art History',
    emoji: '🎨',
    description: 'Movements, masterpieces, and artists who transformed how humanity sees itself.',
    category: 'academic',
    tags: ['art', 'painting', 'sculpture', 'renaissance', 'baroque', 'impressionism', 'museum', 'artist', 'gallery', 'aesthetic', 'masterpiece'],
    color: '#ff69b4',
  },
  {
    id: 'economics',
    name: 'Economic History',
    emoji: '📊',
    description: 'Trade routes, market crashes, economic revolutions, and how wealth shaped civilizations.',
    category: 'academic',
    tags: ['economy', 'trade', 'market', 'commerce', 'merchant', 'finance', 'currency', 'bank', 'inflation', 'depression', 'capitalism', 'wealth'],
    color: '#20b2aa',
  },
  {
    id: 'religion',
    name: 'Religious History',
    emoji: '🕌',
    description: 'Faiths, prophets, reformations, schisms, and the spiritual forces that moved billions.',
    category: 'academic',
    tags: ['religion', 'church', 'temple', 'faith', 'prophet', 'reformation', 'monastery', 'pilgrimage', 'theology', 'scripture', 'crusade', 'missionary'],
    color: '#daa520',
  },
  {
    id: 'philosophy',
    name: 'Political Philosophy',
    emoji: '🏛️',
    description: 'From Plato to Marx — the ideas about governance, justice, and freedom that shaped nations.',
    category: 'academic',
    tags: ['philosophy', 'democracy', 'republic', 'monarchy', 'revolution', 'constitution', 'liberty', 'justice', 'governance', 'ideology', 'political'],
    color: '#9370db',
  },
  {
    id: 'medicine',
    name: 'History of Medicine',
    emoji: '⚕️',
    description: 'Plagues, cures, surgical breakthroughs, and the long fight to understand the human body.',
    category: 'academic',
    tags: ['medicine', 'plague', 'surgery', 'vaccine', 'hospital', 'epidemic', 'anatomy', 'disease', 'doctor', 'pharmacy', 'cure', 'health'],
    color: '#228b22',
  },
  {
    id: 'maritime',
    name: 'Maritime History',
    emoji: '⚓',
    description: 'Naval empires, exploration voyages, piracy, and how the oceans connected the world.',
    category: 'academic',
    tags: ['maritime', 'naval', 'ship', 'voyage', 'ocean', 'port', 'navigation', 'pirate', 'admiral', 'fleet', 'sailing', 'submarine', 'coast'],
    color: '#1e90ff',
  },
  {
    id: 'law',
    name: 'History of Law',
    emoji: '⚖️',
    description: 'Legal codes, landmark trials, rights movements, and the evolution of justice systems.',
    category: 'academic',
    tags: ['law', 'legal', 'court', 'trial', 'constitution', 'rights', 'treaty', 'crime', 'justice', 'amendment', 'verdict', 'legislation'],
    color: '#8b4513',
  },
  {
    id: 'technology',
    name: 'History of Technology',
    emoji: '⚙️',
    description: 'From the wheel to the microchip — inventions that redefined what humans can do.',
    category: 'academic',
    tags: ['technology', 'invention', 'engineering', 'machine', 'innovation', 'industrial', 'patent', 'electricity', 'computer', 'telegraph', 'steam'],
    color: '#ff8c00',
  },
  {
    id: 'diplomacy',
    name: 'Diplomatic History',
    emoji: '🤝',
    description: 'Treaties, alliances, betrayals, and the negotiations that redrew the map of the world.',
    category: 'academic',
    tags: ['treaty', 'alliance', 'diplomacy', 'negotiation', 'ambassador', 'summit', 'accord', 'congress', 'pact', 'armistice', 'ceasefire'],
    color: '#6a5acd',
  },
  {
    id: 'archaeology',
    name: 'Archaeological Discoveries',
    emoji: '🏺',
    description: 'Tombs, ruins, and artifacts — how we unearthed the secrets of lost civilizations.',
    category: 'academic',
    tags: ['archaeology', 'excavation', 'artifact', 'tomb', 'ruins', 'fossil', 'discovery', 'ancient', 'bronze age', 'iron age', 'neolithic'],
    color: '#cd853f',
  },
  {
    id: 'linguistics',
    name: 'History of Language',
    emoji: '🗣️',
    description: 'Scripts, translations, language deaths, and how communication shaped civilizations.',
    category: 'academic',
    tags: ['language', 'writing', 'script', 'alphabet', 'translation', 'literature', 'grammar', 'printing', 'cuneiform', 'hieroglyph', 'book'],
    color: '#b8860b',
  },
  {
    id: 'exploration',
    name: 'History of Exploration',
    emoji: '🧭',
    description: 'Expeditions to uncharted lands, first contacts, and the mapmakers who revealed Earth.',
    category: 'academic',
    tags: ['exploration', 'expedition', 'navigator', 'discovery', 'mapping', 'frontier', 'colony', 'voyage', 'compass', 'cartography', 'pioneer'],
    color: '#2e8b57',
  },
  {
    id: 'social-movements',
    name: 'Social Movements',
    emoji: '✊',
    description: 'Abolition, suffrage, civil rights, labor — the long arc of people demanding change.',
    category: 'academic',
    tags: ['protest', 'movement', 'rights', 'abolition', 'suffrage', 'civil rights', 'labor', 'equality', 'freedom', 'emancipation', 'strike'],
    color: '#e6550d',
  },
];

/* ------------------------------------------------------------------ */
/*  Pre-built Thematic Lenses (~10)                                    */
/* ------------------------------------------------------------------ */

export const THEMATIC_LENSES: KnowledgeLens[] = [
  {
    id: 'food-civilizations',
    name: 'How Food Shaped Civilizations',
    emoji: '🌶️',
    description: 'Spice wars, agricultural revolutions, famines, and the meals that moved empires.',
    category: 'thematic',
    tags: ['food', 'spice', 'agriculture', 'famine', 'farming', 'crop', 'feast', 'bread', 'rice', 'wheat', 'sugar', 'tea', 'coffee', 'trade'],
    color: '#e67e22',
  },
  {
    id: 'cryptography',
    name: 'History of Cryptography & Secrets',
    emoji: '🔐',
    description: 'Codes, ciphers, espionage, and the hidden messages that changed the course of wars.',
    category: 'thematic',
    tags: ['cryptography', 'cipher', 'code', 'espionage', 'spy', 'secret', 'enigma', 'intelligence', 'decipher', 'encryption', 'steganography'],
    color: '#2c3e50',
  },
  {
    id: 'women-changed-everything',
    name: 'When Women Changed Everything',
    emoji: '👑',
    description: 'Queens, scientists, rebels, and the women who bent the arc of history.',
    category: 'thematic',
    tags: ['women', 'queen', 'empress', 'suffrage', 'feminist', 'heroine', 'matriarch', 'priestess', 'pioneer', 'activist', 'equality'],
    color: '#8e44ad',
  },
  {
    id: 'disasters-improved',
    name: 'Disasters That Accidentally Improved Things',
    emoji: '🌋',
    description: 'Catastrophes that paradoxically led to progress, reform, or unexpected breakthroughs.',
    category: 'thematic',
    tags: ['disaster', 'catastrophe', 'fire', 'earthquake', 'flood', 'plague', 'accident', 'collapse', 'eruption', 'reform', 'rebuilding'],
    color: '#c0392b',
  },
  {
    id: 'measurement-time',
    name: 'History of Measurement & Time',
    emoji: '⏳',
    description: 'Calendars, clocks, the meter, longitude — humanitys obsession with precision.',
    category: 'thematic',
    tags: ['measurement', 'time', 'calendar', 'clock', 'longitude', 'metric', 'standard', 'sundial', 'atomic', 'observatory', 'precision'],
    color: '#16a085',
  },
  {
    id: 'money-debt',
    name: 'The History of Money & Debt',
    emoji: '💰',
    description: 'From cowrie shells to crypto — how abstract value systems built and broke civilizations.',
    category: 'thematic',
    tags: ['money', 'coin', 'currency', 'debt', 'bank', 'gold', 'silver', 'inflation', 'credit', 'exchange', 'mint', 'treasury', 'stock'],
    color: '#f39c12',
  },
  {
    id: 'weather-history',
    name: 'How Weather Changed History',
    emoji: '🌪️',
    description: 'Storms that sank armadas, volcanic winters, droughts that toppled empires.',
    category: 'thematic',
    tags: ['weather', 'storm', 'drought', 'flood', 'volcano', 'climate', 'ice age', 'monsoon', 'hurricane', 'frost', 'eruption', 'winter'],
    color: '#3498db',
  },
  {
    id: 'music-revolution',
    name: 'Connections Between Music & Revolution',
    emoji: '🎵',
    description: 'Anthems of uprising, banned composers, and the soundtracks of social change.',
    category: 'thematic',
    tags: ['music', 'revolution', 'anthem', 'composer', 'opera', 'protest song', 'jazz', 'punk', 'folk', 'concert', 'symphony', 'banned'],
    color: '#e74c3c',
  },
  {
    id: 'pandemics',
    name: 'Pandemics That Reshaped Society',
    emoji: '🦠',
    description: 'From the Plague of Athens to COVID — how diseases rewrote the rules of civilization.',
    category: 'thematic',
    tags: ['pandemic', 'plague', 'epidemic', 'disease', 'quarantine', 'virus', 'contagion', 'smallpox', 'cholera', 'influenza', 'vaccination'],
    color: '#27ae60',
  },
  {
    id: 'architecture-power',
    name: 'Architecture as Power',
    emoji: '🏰',
    description: 'Pyramids, cathedrals, skyscrapers — how rulers used buildings to project dominance.',
    category: 'thematic',
    tags: ['architecture', 'building', 'cathedral', 'palace', 'pyramid', 'castle', 'monument', 'tower', 'fortress', 'temple', 'construction'],
    color: '#7f8c8d',
  },
];

/** All pre-built lenses for convenience */
export const ALL_BUILTIN_LENSES: KnowledgeLens[] = [
  ...ACADEMIC_LENSES,
  ...THEMATIC_LENSES,
];

/** Create a custom lens from user input */
export function createCustomLens(
  name: string,
  description: string,
  tags: string[],
  color: string,
  emoji?: string,
): KnowledgeLens {
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    name,
    emoji: emoji || '🔍',
    description,
    category: 'custom',
    tags,
    color,
  };
}

/** Check if an event (by its tags/text) is relevant to a lens */
export function isEventRelevantToLens(
  lens: KnowledgeLens,
  eventTitle: string,
  eventDescription: string,
  eventCategory?: string,
): boolean {
  const haystack = `${eventTitle} ${eventDescription} ${eventCategory || ''}`.toLowerCase();
  return lens.tags.some(tag => haystack.includes(tag.toLowerCase()));
}
