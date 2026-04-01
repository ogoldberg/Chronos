/**
 * Spaced Repetition System for CHRONOS
 * Implements the SM-2 algorithm to resurface learned content at optimal intervals.
 * Integrates with the quiz system and myth buster.
 */

export interface ReviewCard {
  id: string;
  eventTitle: string;
  eventYear: number;
  question: string;
  answer: string;
  // SM-2 algorithm fields
  interval: number;      // days until next review
  easeFactor: number;    // 2.5 default, adjusts based on performance
  nextReview: number;    // timestamp
  repetitions: number;   // consecutive correct answers
}

export interface ReviewStats {
  totalCards: number;
  dueToday: number;
  streak: number;
}

// ── Storage ──
const STORAGE_KEY = 'chronos_review_cards';
const STREAK_KEY = 'chronos_review_streak';
const LAST_REVIEW_KEY = 'chronos_review_last_date';

function loadCards(): ReviewCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ReviewCard[];
  } catch { /* corrupted */ }
  return [];
}

function saveCards(cards: ReviewCard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch { /* storage full */ }
}

function loadStreak(): number {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return parseInt(raw, 10) || 0;
  } catch { /* ignore */ }
  return 0;
}

function saveStreak(streak: number): void {
  try {
    localStorage.setItem(STREAK_KEY, String(streak));
  } catch { /* ignore */ }
}

function getLastReviewDate(): string | null {
  try {
    return localStorage.getItem(LAST_REVIEW_KEY);
  } catch { return null; }
}

function setLastReviewDate(date: string): void {
  try {
    localStorage.setItem(LAST_REVIEW_KEY, date);
  } catch { /* ignore */ }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── SM-2 Algorithm ──

/**
 * Apply the SM-2 algorithm to update a card based on review quality.
 * @param card - The card being reviewed
 * @param quality - Rating 0-5 (0=complete blackout, 5=perfect response)
 * @returns Updated card
 */
function sm2(card: ReviewCard, quality: number): ReviewCard {
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let { interval, easeFactor, repetitions } = card;

  if (q < 3) {
    // Failed review — reset repetitions
    repetitions = 0;
    interval = 1;
  } else {
    // Successful review
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor (minimum 1.3)
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;

  return {
    ...card,
    interval,
    easeFactor,
    repetitions,
    nextReview,
  };
}

// ── Public API ──

/**
 * Add a new review card (e.g., from a correct quiz answer or myth reveal).
 * If a card with the same id already exists, it is not duplicated.
 */
export function addReviewCard(card: Omit<ReviewCard, 'interval' | 'easeFactor' | 'nextReview' | 'repetitions'>): void {
  const cards = loadCards();
  if (cards.some(c => c.id === card.id)) return; // no duplicates

  const newCard: ReviewCard = {
    ...card,
    interval: 0,
    easeFactor: 2.5,
    nextReview: Date.now() + 24 * 60 * 60 * 1000, // first review tomorrow
    repetitions: 0,
  };
  cards.push(newCard);
  saveCards(cards);
}

/**
 * Get all cards that are due for review (nextReview <= now).
 */
export function getDueCards(): ReviewCard[] {
  const now = Date.now();
  return loadCards().filter(c => c.nextReview <= now);
}

/**
 * Review a card with the given quality rating (0-5).
 * Updates the card using the SM-2 algorithm.
 */
export function reviewCard(id: string, quality: number): ReviewCard | null {
  const cards = loadCards();
  const idx = cards.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const updated = sm2(cards[idx], quality);
  cards[idx] = updated;
  saveCards(cards);

  return updated;
}

/**
 * Get review statistics.
 */
export function getReviewStats(): ReviewStats {
  const cards = loadCards();
  const now = Date.now();
  const dueToday = cards.filter(c => c.nextReview <= now).length;

  // Update streak logic
  const today = todayStr();
  const lastReview = getLastReviewDate();
  let streak = loadStreak();

  if (lastReview !== today) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (lastReview !== yesterday) {
      // Streak broken (missed a day)
      streak = 0;
      saveStreak(0);
    }
  }

  return {
    totalCards: cards.length,
    dueToday,
    streak,
  };
}

/**
 * Mark today's reviews as complete, incrementing the streak.
 */
export function completeReviewSession(): void {
  const today = todayStr();
  const lastReview = getLastReviewDate();
  let streak = loadStreak();

  if (lastReview !== today) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (lastReview === yesterday) {
      streak += 1;
    } else {
      streak = 1;
    }
    saveStreak(streak);
    setLastReviewDate(today);
  }
}

/**
 * Get the next review time across all cards (for "No reviews due" display).
 */
export function getNextReviewTime(): number | null {
  const cards = loadCards();
  if (cards.length === 0) return null;
  return Math.min(...cards.map(c => c.nextReview));
}
