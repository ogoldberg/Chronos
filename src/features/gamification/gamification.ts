/**
 * CHRONOS Gamification Engine
 * XP, levels, achievements, and stats — all persisted to localStorage.
 */

export interface PlayerStats {
  xp: number;
  level: number;
  eventsViewed: number;
  erasExplored: Set<string>;
  quizStreak: number;
  bestStreak: number;
  achievements: string[];
  totalQuizCorrect: number;
  totalQuizAttempted: number;
  lastActive: number;
  mythsRevealed: number;
  continentsVisited: Set<string>;
}

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  condition: (stats: PlayerStats) => boolean;
}

// ── Level thresholds ──
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 2000, 4000, 8000];

// ── XP values ──
const XP_EVENT_VIEW = 10;
const XP_QUIZ_CORRECT = 25;
const XP_STREAK_BONUS_PER = 5;
const XP_MYTH_REVEALED = 15;

// ── Achievements ──
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_steps',
    name: 'First Steps',
    emoji: '\ud83d\udc63',
    description: 'View your first historical event',
    condition: (s) => s.eventsViewed >= 1,
  },
  {
    id: 'curious_mind',
    name: 'Curious Mind',
    emoji: '\ud83e\udde0',
    description: 'View 10 historical events',
    condition: (s) => s.eventsViewed >= 10,
  },
  {
    id: 'historian',
    name: 'Historian',
    emoji: '\ud83d\udcda',
    description: 'View 50 historical events',
    condition: (s) => s.eventsViewed >= 50,
  },
  {
    id: 'scholar',
    name: 'Scholar',
    emoji: '\ud83c\udf93',
    description: 'View 200 historical events',
    condition: (s) => s.eventsViewed >= 200,
  },
  {
    id: 'time_traveler',
    name: 'Time Traveler',
    emoji: '\u231b',
    description: 'Explore 5 or more different eras',
    condition: (s) => s.erasExplored.size >= 5,
  },
  {
    id: 'cosmic_explorer',
    name: 'Cosmic Explorer',
    emoji: '\ud83c\udf0c',
    description: 'Zoom all the way back to the Big Bang',
    condition: (s) => s.erasExplored.has('cosmic'),
  },
  {
    id: 'quiz_rookie',
    name: 'Quiz Rookie',
    emoji: '\u2753',
    description: 'Answer your first quiz question correctly',
    condition: (s) => s.totalQuizCorrect >= 1,
  },
  {
    id: 'quiz_streak',
    name: 'On Fire',
    emoji: '\ud83d\udd25',
    description: 'Get a streak of 5 correct answers',
    condition: (s) => s.bestStreak >= 5,
  },
  {
    id: 'quiz_master',
    name: 'Quiz Master',
    emoji: '\ud83c\udfc6',
    description: 'Achieve a streak of 10 correct answers',
    condition: (s) => s.bestStreak >= 10,
  },
  {
    id: 'walking_encyclopedia',
    name: 'Walking Encyclopedia',
    emoji: '\ud83d\udcd6',
    description: 'Answer 100 quiz questions correctly',
    condition: (s) => s.totalQuizCorrect >= 100,
  },
  {
    id: 'myth_buster',
    name: 'Myth Buster',
    emoji: '\ud83d\udd2c',
    description: 'Reveal 10 historical myths',
    condition: (s) => s.mythsRevealed >= 10,
  },
  {
    id: 'globe_trotter',
    name: 'Globe Trotter',
    emoji: '\ud83c\udf0d',
    description: 'View events from 4 different continents',
    condition: (s) => s.continentsVisited.size >= 4,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    emoji: '\ud83e\udd89',
    description: 'Explore the timeline after midnight',
    condition: (s) => {
      const hour = new Date(s.lastActive).getHours();
      return hour >= 0 && hour < 5;
    },
  },
  {
    id: 'completionist',
    name: 'Completionist',
    emoji: '\u2b50',
    description: 'Explore all major eras on the timeline',
    condition: (s) => {
      const required = ['cosmic', 'geological', 'evolutionary', 'civilization', 'modern'];
      return required.every((era) => s.erasExplored.has(era));
    },
  },
  {
    id: 'dedicated_learner',
    name: 'Dedicated Learner',
    emoji: '\ud83d\udcaa',
    description: 'Attempt 50 quiz questions',
    condition: (s) => s.totalQuizAttempted >= 50,
  },
  {
    id: 'level_five',
    name: 'Rising Star',
    emoji: '\ud83c\udf1f',
    description: 'Reach level 5',
    condition: (s) => s.level >= 5,
  },
  {
    id: 'xp_thousand',
    name: 'Millennium Scholar',
    emoji: '\ud83d\udc8e',
    description: 'Earn 1,000 total XP',
    condition: (s) => s.xp >= 1000,
  },
];

// ── Storage key ──
const STORAGE_KEY = 'chronos_player_stats';

// ── Serialization helpers (Sets are not JSON-serializable) ──
interface SerializedStats {
  xp: number;
  level: number;
  eventsViewed: number;
  erasExplored: string[];
  quizStreak: number;
  bestStreak: number;
  achievements: string[];
  totalQuizCorrect: number;
  totalQuizAttempted: number;
  lastActive: number;
  mythsRevealed: number;
  continentsVisited: string[];
}

function serialize(stats: PlayerStats): SerializedStats {
  return {
    ...stats,
    erasExplored: [...stats.erasExplored],
    continentsVisited: [...stats.continentsVisited],
  };
}

function deserialize(raw: SerializedStats): PlayerStats {
  return {
    ...raw,
    erasExplored: new Set(raw.erasExplored),
    continentsVisited: new Set(raw.continentsVisited),
  };
}

function defaultStats(): PlayerStats {
  return {
    xp: 0,
    level: 1,
    eventsViewed: 0,
    erasExplored: new Set(),
    quizStreak: 0,
    bestStreak: 0,
    achievements: [],
    totalQuizCorrect: 0,
    totalQuizAttempted: 0,
    lastActive: Date.now(),
    mythsRevealed: 0,
    continentsVisited: new Set(),
  };
}

// ── In-memory cache ──
let _stats: PlayerStats | null = null;

function load(): PlayerStats {
  if (_stats) return _stats;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SerializedStats;
      _stats = deserialize(parsed);
      return _stats;
    }
  } catch {
    // corrupted — start fresh
  }
  _stats = defaultStats();
  return _stats;
}

function save(stats: PlayerStats): void {
  _stats = stats;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(stats)));
  } catch {
    // storage full — silently fail
  }
}

// ── Listeners ──
type Listener = (stats: PlayerStats) => void;
const listeners: Listener[] = [];

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(stats: PlayerStats): void {
  for (const fn of listeners) fn(stats);
}

// ── Achievement checking ──
type AchievementCallback = (achievement: Achievement) => void;
let _achievementCallback: AchievementCallback | null = null;

export function onAchievementUnlocked(cb: AchievementCallback): () => void {
  _achievementCallback = cb;
  return () => {
    if (_achievementCallback === cb) _achievementCallback = null;
  };
}

// ── Level calculation ──
export function getLevel(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
    else break;
  }
  return lvl;
}

export function getXPForNextLevel(level: number): number {
  if (level >= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  return LEVEL_THRESHOLDS[level]; // level is 1-indexed, threshold at [level] is next
}

export function getXPForCurrentLevel(level: number): number {
  if (level <= 1) return 0;
  return LEVEL_THRESHOLDS[level - 1];
}

// ── Core functions ──

export function getStats(): PlayerStats {
  return load();
}

export function checkAchievements(stats: PlayerStats): string[] {
  const newlyUnlocked: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (!stats.achievements.includes(ach.id) && ach.condition(stats)) {
      stats.achievements.push(ach.id);
      newlyUnlocked.push(ach.id);
      if (_achievementCallback) _achievementCallback(ach);
    }
  }
  return newlyUnlocked;
}

export function addXP(amount: number): PlayerStats {
  const stats = load();
  stats.xp += amount;
  stats.level = getLevel(stats.xp);
  stats.lastActive = Date.now();
  checkAchievements(stats);
  save(stats);
  notify(stats);
  return stats;
}

export function recordEventView(eraId?: string, continent?: string): PlayerStats {
  const stats = load();
  stats.eventsViewed += 1;
  stats.xp += XP_EVENT_VIEW;
  stats.lastActive = Date.now();
  if (eraId) stats.erasExplored.add(eraId);
  if (continent) stats.continentsVisited.add(continent);
  stats.level = getLevel(stats.xp);
  checkAchievements(stats);
  save(stats);
  notify(stats);
  return stats;
}

export function recordQuizAnswer(correct: boolean): PlayerStats {
  const stats = load();
  stats.totalQuizAttempted += 1;
  stats.lastActive = Date.now();

  if (correct) {
    stats.totalQuizCorrect += 1;
    stats.quizStreak += 1;
    if (stats.quizStreak > stats.bestStreak) {
      stats.bestStreak = stats.quizStreak;
    }
    const streakBonus = stats.quizStreak * XP_STREAK_BONUS_PER;
    stats.xp += XP_QUIZ_CORRECT + streakBonus;
  } else {
    stats.quizStreak = 0;
  }

  stats.level = getLevel(stats.xp);
  checkAchievements(stats);
  save(stats);
  notify(stats);
  return stats;
}

export function recordMythRevealed(): PlayerStats {
  const stats = load();
  stats.mythsRevealed += 1;
  stats.xp += XP_MYTH_REVEALED;
  stats.lastActive = Date.now();
  stats.level = getLevel(stats.xp);
  checkAchievements(stats);
  save(stats);
  notify(stats);
  return stats;
}

// ── Server sync ──
let _isAuthenticated = false;

export function setAuthenticated(auth: boolean): void {
  _isAuthenticated = auth;
}

/**
 * Sync current stats to the server.
 * Only runs if user is authenticated.
 */
export async function syncToServer(): Promise<boolean> {
  if (!_isAuthenticated) return false;
  try {
    const stats = load();
    const resp = await fetch('/api/user/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        xp: stats.xp,
        level: stats.level,
        eventsViewed: stats.eventsViewed,
        erasExplored: [...stats.erasExplored],
        quizStreak: stats.quizStreak,
        bestStreak: stats.bestStreak,
        achievements: stats.achievements,
        totalCorrect: stats.totalQuizCorrect,
        totalAttempted: stats.totalQuizAttempted,
        mythsRevealed: stats.mythsRevealed,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Load progress from server and merge with localStorage.
 * Server values win for numeric fields if they're higher.
 */
export async function syncFromServer(): Promise<boolean> {
  if (!_isAuthenticated) return false;
  try {
    const resp = await fetch('/api/user/progress', {
      credentials: 'include',
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (!data.progress) return false;

    const local = load();
    const remote = data.progress;

    // Merge: take the higher value for numeric stats
    local.xp = Math.max(local.xp, remote.xp ?? 0);
    local.level = Math.max(local.level, remote.level ?? 1);
    local.eventsViewed = Math.max(local.eventsViewed, remote.events_viewed ?? 0);
    local.quizStreak = Math.max(local.quizStreak, remote.quiz_streak ?? 0);
    local.bestStreak = Math.max(local.bestStreak, remote.best_streak ?? 0);
    local.totalQuizCorrect = Math.max(local.totalQuizCorrect, remote.total_correct ?? 0);
    local.totalQuizAttempted = Math.max(local.totalQuizAttempted, remote.total_attempted ?? 0);
    local.mythsRevealed = Math.max(local.mythsRevealed, remote.myths_revealed ?? 0);

    // Merge sets
    const remoteEras: string[] = remote.eras_explored ?? [];
    for (const era of remoteEras) local.erasExplored.add(era);

    // Merge achievements
    const remoteAchievements: string[] = remote.achievements ?? [];
    for (const ach of remoteAchievements) {
      if (!local.achievements.includes(ach)) local.achievements.push(ach);
    }

    save(local);
    notify(local);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-sync to server on important events.
 * Called internally after level ups and achievement unlocks.
 */
function autoSync(): void {
  if (_isAuthenticated) {
    syncToServer().catch(() => {});
  }
}

// Subscribe to stats changes for auto-sync on important events
let _prevLevel = 0;
let _prevAchCount = 0;

subscribe((stats) => {
  if (!_isAuthenticated) return;
  // Auto-sync when level changes or new achievement unlocked
  if (stats.level > _prevLevel || stats.achievements.length > _prevAchCount) {
    autoSync();
  }
  _prevLevel = stats.level;
  _prevAchCount = stats.achievements.length;
});

export { LEVEL_THRESHOLDS };
