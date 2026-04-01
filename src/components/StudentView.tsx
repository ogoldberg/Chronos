import { useState, useEffect, useCallback } from 'react';

/* ─────────────────────────── Types ───────────────────────────────────── */

interface CurriculumUnit {
  id: string;
  title: string;
  description: string;
  eraStart: number;
  eraEnd: number;
  learningObjectives: string[];
  eventIds: string[];
  quizEnabled: boolean;
  discussionPrompt: string;
  guidedTour: { year: number; span: number; text: string }[] | null;
  narrative: string;
}

interface Curriculum {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  description: string;
  units: CurriculumUnit[];
}

interface ClassroomInfo {
  id: string;
  name: string;
  joinCode: string;
  curriculum: Curriculum | null;
}

interface StudentProgress {
  completedUnits: string[];
  quizScores: Record<string, number>;
  xpEarned: number;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/* ─────────────────────────── Styles ──────────────────────────────────── */

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  backdropFilter: 'blur(12px)',
  ...extra,
});

const greenBtn: React.CSSProperties = {
  background: 'rgba(34,197,94,0.2)',
  border: '1px solid rgba(34,197,94,0.4)',
  borderRadius: 10,
  color: '#6ee7a0',
  padding: '10px 20px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#fff',
  padding: '12px 16px',
  fontSize: 16,
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
  textAlign: 'center',
  letterSpacing: 4,
  fontFamily: 'monospace',
  fontWeight: 700,
};

/* ─────────────────────── Component ───────────────────────────────────── */

interface Props {
  onClose: () => void;
}

export default function StudentView({ onClose }: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [classroom, setClassroom] = useState<ClassroomInfo | null>(null);
  const [progress, setProgress] = useState<StudentProgress>({ completedUnits: [], quizScores: {}, xpEarned: 0 });
  const [activeUnit, setActiveUnit] = useState<CurriculumUnit | null>(null);
  const [unitView, setUnitView] = useState<'content' | 'quiz' | 'discussion'>('content');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quizQuestion, setQuizQuestion] = useState<QuizQuestion | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [showTour, setShowTour] = useState(false);

  // Try to rejoin last classroom
  useEffect(() => {
    const savedCode = localStorage.getItem('chronos_classroom_code');
    if (savedCode) {
      handleJoin(savedCode);
    }
  }, []);

  const handleJoin = async (code?: string) => {
    const c = (code || joinCode).trim().toUpperCase();
    if (c.length !== 6) { setError('Code must be 6 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/classroom/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Could not join classroom');
      }
      const data = await res.json();
      setClassroom(data.classroom);
      setProgress(data.progress || { completedUnits: [], quizScores: {}, xpEarned: 0 });
      localStorage.setItem('chronos_classroom_code', c);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const leaveClassroom = () => {
    setClassroom(null);
    setActiveUnit(null);
    setProgress({ completedUnits: [], quizScores: {}, xpEarned: 0 });
    localStorage.removeItem('chronos_classroom_code');
  };

  const openUnit = (unit: CurriculumUnit) => {
    setActiveUnit(unit);
    setUnitView('content');
    setQuizQuestion(null);
    setQuizAnswer(null);
    setQuizSubmitted(false);
    setTourStep(0);
    setShowTour(false);
  };

  const completeUnit = async (unitId: string) => {
    const updated = {
      ...progress,
      completedUnits: [...new Set([...progress.completedUnits, unitId])],
      xpEarned: progress.xpEarned + 50,
    };
    setProgress(updated);
    try {
      await fetch('/api/classroom/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId: classroom?.id, progress: updated }),
      });
    } catch { /* offline is ok */ }
  };

  const loadQuiz = async () => {
    if (!activeUnit) return;
    setQuizLoading(true);
    setQuizAnswer(null);
    setQuizSubmitted(false);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [], era: `${activeUnit.eraStart}-${activeUnit.eraEnd} ${activeUnit.title}` }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuizQuestion(data);
      }
    } catch { /* ignore */ }
    setQuizLoading(false);
  };

  const submitQuiz = async () => {
    if (quizAnswer === null || !quizQuestion || !activeUnit) return;
    setQuizSubmitted(true);
    const correct = quizAnswer === quizQuestion.correctIndex;
    const score = correct ? 100 : 0;
    const updated = {
      ...progress,
      quizScores: { ...progress.quizScores, [activeUnit.id]: score },
      xpEarned: progress.xpEarned + (correct ? 25 : 5),
    };
    setProgress(updated);
    try {
      await fetch('/api/classroom/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId: classroom?.id, progress: updated }),
      });
    } catch { /* offline */ }
  };

  const curriculum = classroom?.curriculum;
  const totalUnits = curriculum?.units.length || 0;
  const completedCount = progress.completedUnits.length;
  const pct = totalUnits > 0 ? Math.round((completedCount / totalUnits) * 100) : 0;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(5,5,15,0.98)',
      zIndex: 85,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflow: 'auto',
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20,
        background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
        fontSize: 18, cursor: 'pointer', borderRadius: '50%', width: 40, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        x
      </button>

      {/* ══════ JOIN SCREEN ══════ */}
      {!classroom && (
        <div style={{ textAlign: 'center', maxWidth: 420, marginTop: '15vh', padding: '0 20px' }}>
          <span style={{ fontSize: 48 }}>🎓</span>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 300, margin: '16px 0 8px' }}>Join a Classroom</h1>
          <p style={{ color: '#ffffff50', fontSize: 14, marginBottom: 30 }}>
            Enter the 6-character code from your teacher.
          </p>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', color: '#f87171', marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="ABC123"
            maxLength={6}
            style={inputStyle}
          />
          <button
            onClick={() => handleJoin()}
            disabled={loading || joinCode.length !== 6}
            style={{ ...greenBtn, marginTop: 16, width: '100%', opacity: joinCode.length !== 6 ? 0.5 : 1 }}
          >
            {loading ? 'Joining...' : 'Join Classroom'}
          </button>
        </div>
      )}

      {/* ══════ CURRICULUM OVERVIEW ══════ */}
      {classroom && !activeUnit && (
        <div style={{ maxWidth: 700, width: '100%', padding: '40px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ color: '#ffffff50', fontSize: 12 }}>Classroom: {classroom.name}</div>
              <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 300, margin: '6px 0 0' }}>
                {curriculum?.title || 'No curriculum assigned'}
              </h1>
              {curriculum && (
                <div style={{ color: '#ffffff50', fontSize: 13, marginTop: 4 }}>
                  {curriculum.subject} - {curriculum.gradeLevel}
                </div>
              )}
            </div>
            <button onClick={leaveClassroom} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: '#ffffff60', padding: '6px 14px', cursor: 'pointer', fontSize: 12,
            }}>Leave</button>
          </div>

          {curriculum && (
            <>
              {/* Progress + XP */}
              <div style={glass({ padding: 20, marginBottom: 24 })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ color: '#ffffff80', fontSize: 14 }}>Overall Progress</span>
                  <span style={{ color: '#6ee7a0', fontSize: 14, fontWeight: 600 }}>{pct}% complete</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(90deg, #22c55e, #3b82f6)', height: '100%', width: `${pct}%`, borderRadius: 6, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ color: '#ffffff40', fontSize: 12 }}>{completedCount} of {totalUnits} units</span>
                  <span style={{ color: '#daa520', fontSize: 12, fontWeight: 600 }}>{progress.xpEarned} XP earned</span>
                </div>
              </div>

              {/* Description */}
              {curriculum.description && (
                <p style={{ color: '#ffffff70', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
                  {curriculum.description}
                </p>
              )}

              {/* Unit list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {curriculum.units.map((unit, idx) => {
                  const done = progress.completedUnits.includes(unit.id);
                  const score = progress.quizScores[unit.id];
                  return (
                    <button
                      key={unit.id}
                      onClick={() => openUnit(unit)}
                      style={{
                        ...glass({ padding: '18px 22px', cursor: 'pointer', textAlign: 'left', width: '100%' }),
                        borderColor: done ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                              border: done ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.15)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: done ? '#22c55e' : '#ffffff30', fontSize: 14, flexShrink: 0,
                            }}>
                              {done ? '✓' : idx + 1}
                            </span>
                            <div>
                              <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>{unit.title || `Unit ${idx + 1}`}</div>
                              <div style={{ color: '#ffffff50', fontSize: 12, marginTop: 2 }}>
                                {unit.learningObjectives.filter(Boolean).length} objective{unit.learningObjectives.filter(Boolean).length !== 1 ? 's' : ''}
                                {unit.quizEnabled && ' · Quiz'}
                                {unit.guidedTour && ' · Tour'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ color: '#ffffff30', fontSize: 11 }}>~15 min</div>
                          {score !== undefined && (
                            <div style={{ color: score >= 70 ? '#6ee7a0' : '#f87171', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                              Quiz: {score}%
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!curriculum && (
            <div style={{ color: '#ffffff40', textAlign: 'center', padding: 60, fontSize: 14 }}>
              Your teacher hasn't assigned a curriculum yet. Check back soon.
            </div>
          )}
        </div>
      )}

      {/* ══════ UNIT VIEW ══════ */}
      {classroom && activeUnit && (
        <div style={{ maxWidth: 700, width: '100%', padding: '30px 20px' }}>
          {/* Back + title */}
          <button onClick={() => setActiveUnit(null)} style={{
            background: 'none', border: 'none', color: '#93bbfc', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 16,
          }}>
            ← Back to curriculum
          </button>

          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: '0 0 6px' }}>{activeUnit.title}</h2>
          <div style={{ color: '#ffffff50', fontSize: 12, marginBottom: 20 }}>
            Era: {activeUnit.eraStart} – {activeUnit.eraEnd}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['content', 'quiz', 'discussion'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setUnitView(v); if (v === 'quiz' && !quizQuestion) loadQuiz(); }}
                style={{
                  background: unitView === v ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                  border: unitView === v ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '8px 16px', color: unitView === v ? '#93bbfc' : '#ffffff60',
                  cursor: 'pointer', fontSize: 13, fontWeight: unitView === v ? 600 : 400,
                }}
              >
                {v === 'content' ? 'Content' : v === 'quiz' ? 'Quiz' : 'Discussion'}
              </button>
            ))}
          </div>

          {/* ── Content view ── */}
          {unitView === 'content' && (
            <div>
              {/* Objectives */}
              {activeUnit.learningObjectives.filter(Boolean).length > 0 && (
                <div style={glass({ padding: 16, marginBottom: 16 })}>
                  <div style={{ color: '#ffffff60', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>LEARNING OBJECTIVES</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {activeUnit.learningObjectives.filter(Boolean).map((obj, i) => (
                      <li key={i} style={{ color: '#ffffff90', fontSize: 13, marginBottom: 4 }}>{obj}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Narrative */}
              {activeUnit.narrative && (
                <div style={glass({ padding: 20, marginBottom: 16 })}>
                  <div style={{ color: '#ffffff60', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>READING</div>
                  <p style={{ color: '#ffffffd0', fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {activeUnit.narrative}
                  </p>
                </div>
              )}

              {/* Guided tour */}
              {activeUnit.guidedTour && activeUnit.guidedTour.length > 0 && (
                <div style={glass({ padding: 20, marginBottom: 16 })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ color: '#ffffff60', fontSize: 11, fontWeight: 600 }}>GUIDED TOUR</div>
                    <button onClick={() => { setShowTour(!showTour); setTourStep(0); }} style={{
                      ...greenBtn, padding: '6px 14px', fontSize: 12,
                    }}>
                      {showTour ? 'Hide Tour' : 'Start Tour'}
                    </button>
                  </div>
                  {showTour && (
                    <div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                        {activeUnit.guidedTour.map((_, i) => (
                          <div key={i} style={{
                            flex: 1, height: 4, borderRadius: 2,
                            background: i <= tourStep ? '#3b82f6' : 'rgba(255,255,255,0.08)',
                          }} />
                        ))}
                      </div>
                      <p style={{ color: '#ffffffd0', fontSize: 15, lineHeight: 1.6, margin: '0 0 14px' }}>
                        {activeUnit.guidedTour[tourStep].text}
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          disabled={tourStep === 0}
                          onClick={() => setTourStep(s => s - 1)}
                          style={{ ...greenBtn, padding: '6px 14px', fontSize: 12, opacity: tourStep === 0 ? 0.4 : 1 }}
                        >
                          Previous
                        </button>
                        <button
                          disabled={tourStep >= activeUnit.guidedTour!.length - 1}
                          onClick={() => setTourStep(s => s + 1)}
                          style={{ ...greenBtn, padding: '6px 14px', fontSize: 12, opacity: tourStep >= activeUnit.guidedTour!.length - 1 ? 0.4 : 1 }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Events placeholder */}
              {activeUnit.eventIds.length > 0 && (
                <div style={glass({ padding: 16, marginBottom: 16 })}>
                  <div style={{ color: '#ffffff60', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>KEY EVENTS</div>
                  <div style={{ color: '#ffffff70', fontSize: 13 }}>
                    {activeUnit.eventIds.length} event{activeUnit.eventIds.length !== 1 ? 's' : ''} highlighted on the timeline for this unit.
                  </div>
                </div>
              )}

              {/* Complete button */}
              {!progress.completedUnits.includes(activeUnit.id) && (
                <button onClick={() => completeUnit(activeUnit.id)} style={{ ...greenBtn, width: '100%', marginTop: 8 }}>
                  Mark Unit as Complete (+50 XP)
                </button>
              )}
              {progress.completedUnits.includes(activeUnit.id) && (
                <div style={{ textAlign: 'center', color: '#6ee7a0', fontSize: 14, fontWeight: 600, marginTop: 8 }}>
                  ✓ Unit completed
                </div>
              )}
            </div>
          )}

          {/* ── Quiz view ── */}
          {unitView === 'quiz' && (
            <div>
              {!activeUnit.quizEnabled && (
                <div style={{ color: '#ffffff40', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  No quiz for this unit.
                </div>
              )}
              {activeUnit.quizEnabled && quizLoading && (
                <div style={{ color: '#ffffff40', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  Loading quiz question...
                </div>
              )}
              {activeUnit.quizEnabled && quizQuestion && (
                <div style={glass({ padding: 24 })}>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 500, marginBottom: 20 }}>
                    {quizQuestion.question}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {quizQuestion.options.map((opt, i) => {
                      let bg = 'rgba(255,255,255,0.04)';
                      let border = '1px solid rgba(255,255,255,0.08)';
                      let col = '#ffffffd0';
                      if (quizSubmitted) {
                        if (i === quizQuestion.correctIndex) { bg = 'rgba(34,197,94,0.15)'; border = '1px solid rgba(34,197,94,0.4)'; col = '#6ee7a0'; }
                        else if (i === quizAnswer) { bg = 'rgba(239,68,68,0.15)'; border = '1px solid rgba(239,68,68,0.4)'; col = '#f87171'; }
                      } else if (quizAnswer === i) {
                        bg = 'rgba(59,130,246,0.15)'; border = '1px solid rgba(59,130,246,0.4)'; col = '#93bbfc';
                      }
                      return (
                        <button
                          key={i}
                          onClick={() => { if (!quizSubmitted) setQuizAnswer(i); }}
                          style={{ background: bg, border, borderRadius: 10, padding: '14px 18px', color: col, cursor: quizSubmitted ? 'default' : 'pointer', textAlign: 'left', fontSize: 14 }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {!quizSubmitted && (
                    <button onClick={submitQuiz} disabled={quizAnswer === null} style={{ ...greenBtn, width: '100%', marginTop: 16, opacity: quizAnswer === null ? 0.5 : 1 }}>
                      Submit Answer
                    </button>
                  )}
                  {quizSubmitted && (
                    <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                      <div style={{ color: quizAnswer === quizQuestion.correctIndex ? '#6ee7a0' : '#f87171', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                        {quizAnswer === quizQuestion.correctIndex ? 'Correct! +25 XP' : 'Not quite. +5 XP'}
                      </div>
                      <p style={{ color: '#ffffff90', fontSize: 13, margin: 0 }}>{quizQuestion.explanation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Discussion view ── */}
          {unitView === 'discussion' && (
            <div>
              {!activeUnit.discussionPrompt ? (
                <div style={{ color: '#ffffff40', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  No discussion prompt for this unit.
                </div>
              ) : (
                <div style={glass({ padding: 24 })}>
                  <div style={{ color: '#ffffff60', fontSize: 11, fontWeight: 600, marginBottom: 12 }}>DISCUSSION PROMPT</div>
                  <p style={{ color: '#ffffffd0', fontSize: 16, lineHeight: 1.6, margin: '0 0 20px' }}>
                    {activeUnit.discussionPrompt}
                  </p>
                  <div style={{ color: '#ffffff40', fontSize: 13 }}>
                    Discuss with your classmates or write your response.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
