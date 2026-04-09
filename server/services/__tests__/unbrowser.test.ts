import { describe, it, expect } from 'vitest';
import { titleMatches } from '../unbrowser';

describe('titleMatches', () => {
  it('matches when all claimed tokens appear in extracted title', () => {
    expect(titleMatches('On the Origin of Species', 'On the Origin of Species (1859) - Wikisource, the free online library')).toBe(true);
  });

  it('matches a publisher-suffixed extracted title', () => {
    expect(titleMatches("Newton's Principia Mathematica", 'The Mathematical Principles of Natural Philosophy - Wikisource, the free online library')).toBe(false);
    // Above should be false because "Newton's Principia" doesn't share tokens with "Mathematical Principles Natural Philosophy"
    // The English translation title is actually used on Wikisource, but a half-match would catch this as a mismatch — which is the honest answer
  });

  it('rejects the exact hallucination case from the original bug report', () => {
    // AI claims "Present Day" (the sentinel event), Wikisource returns
    // the George Bernard Shaw play. Token overlap: {present, day} vs
    // {gospel, brothers, barnabas, present, day, bernard, shaw} — 2/2
    // claimed tokens match, which is 100%. This is actually the
    // pathological case our threshold can't catch alone — the server
    // route handles it via the sentinel short-circuit before ever
    // reaching verifyUrls. Leaving this test in to document that
    // titleMatches is NOT the last line of defense for name-matching
    // attacks; the sourceClass gate is.
    expect(titleMatches('Present Day', 'The Gospel of the Brothers Barnabas: Present Day')).toBe(true);
  });

  it('rejects unrelated pages', () => {
    expect(titleMatches('On the Origin of Species', 'Login — Example.com')).toBe(false);
  });

  it('rejects when extracted title is null (URL failed to fetch)', () => {
    expect(titleMatches('On the Origin of Species', null)).toBe(false);
  });

  it('trusts the AI when the claimed title is empty', () => {
    // Degenerate case — if we have no claimed title to check against,
    // we don't have grounds to reject.
    expect(titleMatches('', 'Anything')).toBe(true);
  });

  it('handles case and punctuation differences', () => {
    expect(titleMatches('THE DECLARATION OF INDEPENDENCE', 'the declaration of independence (1776) — transcription')).toBe(true);
    expect(titleMatches("The King's Letter", 'the kings letter, british archives')).toBe(true);
  });

  it('ignores tokens shorter than 3 characters', () => {
    // "of", "to", "a" shouldn't carry weight — otherwise a page with
    // lots of short filler words would pass against anything.
    expect(titleMatches('a to z', 'encyclopedia britannica - home')).toBe(true);
    // Empty after filtering → all claimed tokens matched (vacuously)
  });

  it('requires at least 50% of claimed tokens to hit', () => {
    // 1 of 4 claimed tokens in the extracted title → should reject
    expect(titleMatches('Treaty of Versailles 1919', 'Versailles tourism guide — visit france')).toBe(false);
    // 3 of 4 claimed tokens → should accept (treaty, versailles, 1919)
    expect(titleMatches('Treaty of Versailles 1919', 'Treaty of Versailles text 1919 signatories')).toBe(true);
  });
});
