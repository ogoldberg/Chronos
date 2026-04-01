import { useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import type { DifficultyLevel } from '../../stores/uiStore';

interface Props {
  onClose: () => void;
}

interface TierConfig {
  level: DifficultyLevel;
  label: string;
  ageRange: string;
  description: string;
  emoji: string;
  color: string;
  preview: string;
}

const TIERS: TierConfig[] = [
  {
    level: 'kids',
    label: 'Kids',
    ageRange: 'Ages 6-10',
    description: 'Simple words, short sentences, fun analogies',
    emoji: '\u{1F9D2}',
    color: '#f472b6',
    preview: 'A long time ago, people in Egypt built giant triangle-shaped buildings called pyramids. They were like huge sandcastles that lasted forever!',
  },
  {
    level: 'standard',
    label: 'Standard',
    ageRange: 'General audience',
    description: 'Engaging and accessible for everyone',
    emoji: '\u{1F4D6}',
    color: '#60a5fa',
    preview: 'The Great Pyramids of Giza were built around 2560 BCE as monumental tombs for Egyptian pharaohs. These architectural marvels required tens of thousands of workers and remain among the most impressive structures ever built.',
  },
  {
    level: 'advanced',
    label: 'Advanced',
    ageRange: 'College level',
    description: 'Dates, figures, historiographic context included',
    emoji: '\u{1F393}',
    color: '#a78bfa',
    preview: 'The Great Pyramid of Khufu (c. 2560 BCE) represents the apex of Old Kingdom funerary architecture. Herodotus claimed 100,000 workers over 20 years; modern estimates by Lehner and Hawass suggest 20,000-30,000 skilled laborers organized in rotating crews, challenging earlier forced-labor narratives.',
  },
  {
    level: 'research',
    label: 'Research',
    ageRange: 'Academic',
    description: 'Specific scholars, academic terminology, noted debates',
    emoji: '\u{1F52C}',
    color: '#fbbf24',
    preview: 'Per Lehner (1997) and Hawass (2003), the Khufu complex at Giza (c. 2560 BCE, 4th Dynasty) employed a corvee labor system rather than slave labor, as evidenced by the workers\' village excavations at Heit el-Ghurab. Romer (2007) contests the ramp theories of Arnold (1991), proposing internal construction methods. The precision of alignment (3/60th of a degree from true north, per Dash 2018) remains debated.',
  },
];

const STORAGE_KEY = 'chronos_difficulty';

export default function DifficultySelector({ onClose }: Props) {
  const difficulty = useUIStore(s => s.difficulty);
  const setDifficulty = useUIStore(s => s.setDifficulty);
  const [collapsed, setCollapsed] = useState(false);
  const [previewTier, setPreviewTier] = useState<DifficultyLevel | null>(null);

  const handleSelect = (level: DifficultyLevel) => {
    setDifficulty(level);
    localStorage.setItem(STORAGE_KEY, level);
  };

  const activePreview = previewTier || difficulty;

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: collapsed ? 44 : 420,
        maxHeight: collapsed ? 44 : 'calc(100vh - 120px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 14,
        border: '1px solid rgba(99, 102, 241, 0.25)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(99, 102, 241, 0.06)',
        zIndex: 30,
        overflow: 'hidden',
        transition: 'width 0.3s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: collapsed ? '10px 12px' : '12px 16px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(99, 102, 241, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u2699\uFE0F'}</span>
        {!collapsed && (
          <>
            <span style={{ color: '#818cf8', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              DIFFICULTY LEVEL
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14, padding: 2 }}
            >
              {'\u2715'}
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          <div style={{
            margin: '12px 0',
            fontSize: 11,
            color: '#ffffff80',
            lineHeight: 1.5,
          }}>
            Choose a complexity level. This adjusts vocabulary, description length, quiz difficulty, and chart complexity across the entire experience.
          </div>

          {/* Tier buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {TIERS.map((tier) => {
              const isActive = difficulty === tier.level;
              return (
                <button
                  key={tier.level}
                  onClick={() => handleSelect(tier.level)}
                  onMouseEnter={() => setPreviewTier(tier.level)}
                  onMouseLeave={() => setPreviewTier(null)}
                  style={{
                    padding: '12px 14px',
                    background: isActive
                      ? `rgba(${tier.level === 'kids' ? '244,114,182' : tier.level === 'standard' ? '96,165,250' : tier.level === 'advanced' ? '167,139,250' : '251,191,36'}, 0.1)`
                      : 'rgba(255,255,255,0.03)',
                    border: isActive
                      ? `2px solid ${tier.color}`
                      : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{tier.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: isActive ? tier.color : '#ffffffcc', fontSize: 14, fontWeight: 600 }}>
                        {tier.label}
                      </span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: '#ffffff60',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '1px 6px',
                        borderRadius: 3,
                      }}>
                        {tier.ageRange}
                      </span>
                      {isActive && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: tier.color,
                          background: `rgba(${tier.level === 'kids' ? '244,114,182' : tier.level === 'standard' ? '96,165,250' : tier.level === 'advanced' ? '167,139,250' : '251,191,36'}, 0.15)`,
                          padding: '1px 6px',
                          borderRadius: 3,
                          letterSpacing: 0.5,
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#ffffff70', marginTop: 3 }}>
                      {tier.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Preview */}
          <div style={{
            padding: 14,
            background: 'rgba(99, 102, 241, 0.06)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: 10,
          }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#818cf8',
              marginBottom: 8,
            }}>
              PREVIEW: {TIERS.find(t => t.level === activePreview)?.label.toUpperCase()} MODE
            </div>
            <div style={{
              fontSize: 12,
              color: '#ffffffbb',
              lineHeight: 1.7,
              fontStyle: 'italic',
            }}>
              &ldquo;{TIERS.find(t => t.level === activePreview)?.preview}&rdquo;
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 10,
              color: '#ffffff40',
            }}>
              Example: The Great Pyramids of Giza
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
