import { useState, useRef, useEffect } from 'react';
import { callAI } from '../../ai/callAI';
import { CURRICULUM_SYSTEM } from '../../ai/prompts';

/* ────────────────────────────────── Types ─────────────────────────────── */

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
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Classroom {
  id: string;
  name: string;
  joinCode: string;
  curriculumId: string | null;
  createdAt: string;
}

interface StudentProgress {
  userId: string;
  userName: string;
  completedUnits: string[];
  quizScores: Record<string, number>;
  joinedAt: string;
}

/* ────────────────────────────── Helpers ───────────────────────────────── */

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function emptyUnit(): CurriculumUnit {
  return {
    id: makeId(),
    title: '',
    description: '',
    eraStart: 1900,
    eraEnd: 2000,
    learningObjectives: [''],
    eventIds: [],
    quizEnabled: false,
    discussionPrompt: '',
    guidedTour: null,
    narrative: '',
  };
}

function emptyCurriculum(): Curriculum {
  return {
    id: makeId(),
    title: '',
    subject: '',
    gradeLevel: '',
    description: '',
    units: [emptyUnit()],
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ────────────────────────────── Styles ────────────────────────────────── */

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  backdropFilter: 'blur(12px)',
  ...extra,
});

const blueBtn: React.CSSProperties = {
  background: 'rgba(59,130,246,0.25)',
  border: '1px solid rgba(59,130,246,0.5)',
  borderRadius: 10,
  color: '#93bbfc',
  padding: '10px 20px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

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

const dangerBtn: React.CSSProperties = {
  background: 'rgba(239,68,68,0.15)',
  border: '1px solid rgba(239,68,68,0.35)',
  borderRadius: 10,
  color: '#f87171',
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#fff',
  padding: '10px 14px',
  fontSize: 14,
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
};

/* ─────────────────────── Component ───────────────────────────────────── */

interface Props {
  onClose: () => void;
}

export default function TeacherDashboard({ onClose }: Props) {
  const [tab, setTab] = useState<'curricula' | 'classrooms'>('curricula');
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [editing, setEditing] = useState<Curriculum | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [classroomName, setClassroomName] = useState('');
  const [studentRoster, setStudentRoster] = useState<StudentProgress[]>([]);
  const [viewingClassroom, setViewingClassroom] = useState<Classroom | null>(null);
  const [eventSearch, setEventSearch] = useState('');
  const [eventResults, setEventResults] = useState<{ id: string; title: string; year: number }[]>([]);
  const [, setSearchingEvents] = useState(false);

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // ── Fetch curricula on mount ──
  useEffect(() => {
    fetchCurricula();
    fetchClassrooms();
  }, []);

  const fetchCurricula = async () => {
    try {
      const res = await fetch('/api/curriculum?mine=true');
      if (res.ok) {
        const data = await res.json();
        setCurricula(data.curricula || []);
      }
    } catch { /* offline */ }
  };

  const fetchClassrooms = async () => {
    try {
      const res = await fetch('/api/classroom?mine=true');
      if (res.ok) {
        const data = await res.json();
        setClassrooms(data.classrooms || []);
      }
    } catch { /* offline */ }
  };

  // ── Curriculum CRUD ──
  const saveCurriculum = async (c: Curriculum) => {
    setLoading(true);
    setError('');
    try {
      const isNew = !curricula.find(x => x.id === c.id);
      const url = isNew ? '/api/curriculum' : `/api/curriculum?id=${c.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Save failed');
      }
      await fetchCurricula();
      setEditing(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteCurriculum = async (id: string) => {
    if (!confirm('Delete this curriculum?')) return;
    try {
      await fetch(`/api/curriculum?id=${id}`, { method: 'DELETE' });
      setCurricula(p => p.filter(c => c.id !== id));
    } catch { /* ignore */ }
  };

  const duplicateCurriculum = (c: Curriculum) => {
    const dup: Curriculum = {
      ...JSON.parse(JSON.stringify(c)),
      id: makeId(),
      title: c.title + ' (copy)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dup.units = dup.units.map((u: CurriculumUnit) => ({ ...u, id: makeId() }));
    setEditing(dup);
  };

  // ── AI Generation ──
  const generateCurriculum = async () => {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setError('');
    try {
      const gradeLevelMatch = aiTopic.match(/(\d+)(?:th|st|nd|rd)\s*grade/i);
      const gradeLevel = gradeLevelMatch ? `${gradeLevelMatch[1]}th Grade` : '8th Grade';
      const system = CURRICULUM_SYSTEM(aiTopic, gradeLevel);
      const { text } = await callAI(
        system,
        [{ role: 'user', content: `Generate a comprehensive curriculum about: ${aiTopic}` }],
        { maxTokens: 3000 },
      );
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI did not return valid JSON');
      const parsed = JSON.parse(jsonMatch[0]);
      const generated: Curriculum = { ...emptyCurriculum(), ...parsed, id: makeId() };
      setEditing(generated);
      setAiTopic('');
    } catch (e: any) {
      setError(e.message || 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Classroom ──
  const createClassroom = async () => {
    if (!classroomName.trim()) return;
    try {
      const res = await fetch('/api/classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: classroomName }),
      });
      if (res.ok) {
        setClassroomName('');
        await fetchClassrooms();
      }
    } catch { /* offline */ }
  };

  const assignCurriculum = async (classroomId: string, curriculumId: string) => {
    try {
      await fetch('/api/classroom/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId, curriculumId }),
      });
      await fetchClassrooms();
    } catch { /* ignore */ }
  };

  const viewProgress = async (classroom: Classroom) => {
    setViewingClassroom(classroom);
    try {
      const res = await fetch(`/api/classroom/progress?id=${classroom.id}`);
      if (res.ok) {
        const data = await res.json();
        setStudentRoster(data.students || []);
      }
    } catch { /* offline */ }
  };

  // ── Event search for units ──
  const searchEventsForUnit = async (query: string) => {
    if (!query.trim()) { setEventResults([]); return; }
    setSearchingEvents(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setEventResults((data.events || []).map((e: any) => ({ id: e.id, title: e.title, year: e.year })));
      }
    } catch { /* ignore */ }
    setSearchingEvents(false);
  };

  // ── Drag reorder units ──
  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (!editing || dragItem.current === null || dragOverItem.current === null) return;
    const units = [...editing.units];
    const dragged = units.splice(dragItem.current, 1)[0];
    units.splice(dragOverItem.current, 0, dragged);
    setEditing({ ...editing, units });
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const updateUnit = (idx: number, patch: Partial<CurriculumUnit>) => {
    if (!editing) return;
    const units = [...editing.units];
    units[idx] = { ...units[idx], ...patch };
    setEditing({ ...editing, units });
  };

  const removeUnit = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, units: editing.units.filter((_, i) => i !== idx) });
  };

  const addUnit = () => {
    if (!editing) return;
    setEditing({ ...editing, units: [...editing.units, emptyUnit()] });
  };

  // ── Render ──
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(5,5,15,0.98)',
      zIndex: 85,
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* ── Sidebar ── */}
      <div style={{
        width: 240,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Teacher Hub</span>
        </div>

        {(['curricula', 'classrooms'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setEditing(null); setPreviewing(false); setViewingClassroom(null); }}
            style={{
              background: tab === t ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: tab === t ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              borderRadius: 10,
              color: tab === t ? '#93bbfc' : '#ffffff80',
              padding: '12px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'curricula' ? '📖 Curricula' : '🏫 Classrooms'}
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          color: '#ffffff80',
          padding: '10px 16px',
          cursor: 'pointer',
          fontSize: 13,
        }}>
          Close
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 30 }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', color: '#f87171', marginBottom: 20, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ════════ CURRICULA TAB ════════ */}
        {tab === 'curricula' && !editing && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: 0 }}>My Curricula</h2>
              <button onClick={() => setEditing(emptyCurriculum())} style={blueBtn}>
                + Create New Curriculum
              </button>
            </div>

            {/* AI Generate */}
            <div style={{ ...glass({ padding: '20px', marginBottom: 24 }) }}>
              <div style={{ color: '#ffffff90', fontSize: 13, marginBottom: 10, fontWeight: 600 }}>
                AI Curriculum Generator
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={aiTopic}
                  onChange={e => setAiTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateCurriculum()}
                  placeholder='e.g. "World War II for 8th graders"'
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={generateCurriculum} disabled={aiGenerating} style={blueBtn}>
                  {aiGenerating ? 'Generating...' : 'Generate Curriculum'}
                </button>
              </div>
            </div>

            {/* Curriculum list */}
            {curricula.length === 0 && (
              <div style={{ color: '#ffffff40', textAlign: 'center', padding: 60, fontSize: 14 }}>
                No curricula yet. Create one or let AI generate an outline.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {curricula.map(c => (
                <div key={c.id} style={glass({ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                  <div>
                    <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{c.title || 'Untitled'}</div>
                    <div style={{ color: '#ffffff50', fontSize: 12, marginTop: 4 }}>
                      {c.subject} · {c.gradeLevel} · {c.units.length} unit{c.units.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditing(c)} style={{ ...blueBtn, padding: '6px 14px', fontSize: 12 }}>Edit</button>
                    <button onClick={() => duplicateCurriculum(c)} style={{ ...blueBtn, padding: '6px 14px', fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ffffff80' }}>Duplicate</button>
                    <button onClick={() => deleteCurriculum(c.id)} style={{ ...dangerBtn, padding: '6px 14px', fontSize: 12 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════ CURRICULUM EDITOR ════════ */}
        {tab === 'curricula' && editing && !previewing && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: 0 }}>
                {curricula.find(c => c.id === editing.id) ? 'Edit Curriculum' : 'New Curriculum'}
              </h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPreviewing(true)} style={{ ...greenBtn, padding: '8px 16px', fontSize: 13 }}>Preview as Student</button>
                <button onClick={() => setEditing(null)} style={{ ...dangerBtn }}>Cancel</button>
              </div>
            </div>

            {/* Metadata fields */}
            <div style={{ ...glass({ padding: 20, marginBottom: 20 }), display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ color: '#ffffff60', fontSize: 12, display: 'block', marginBottom: 4 }}>Title</label>
                <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} style={inputStyle} placeholder="Curriculum title" />
              </div>
              <div>
                <label style={{ color: '#ffffff60', fontSize: 12, display: 'block', marginBottom: 4 }}>Subject</label>
                <input value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} style={inputStyle} placeholder="e.g. World History" />
              </div>
              <div>
                <label style={{ color: '#ffffff60', fontSize: 12, display: 'block', marginBottom: 4 }}>Grade Level</label>
                <input value={editing.gradeLevel} onChange={e => setEditing({ ...editing, gradeLevel: e.target.value })} style={inputStyle} placeholder="e.g. 8th Grade" />
              </div>
              <div>
                <label style={{ color: '#ffffff60', fontSize: 12, display: 'block', marginBottom: 4 }}>Public</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff80', fontSize: 14, cursor: 'pointer', marginTop: 6 }}>
                  <input type="checkbox" checked={editing.isPublic} onChange={e => setEditing({ ...editing, isPublic: e.target.checked })} />
                  Share publicly
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ color: '#ffffff60', fontSize: 12, display: 'block', marginBottom: 4 }}>Description</label>
                <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} style={textareaStyle} placeholder="What students will learn..." />
              </div>
            </div>

            {/* Units */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 500, margin: 0 }}>Units</h3>
              <button onClick={addUnit} style={{ ...blueBtn, padding: '6px 14px', fontSize: 12 }}>+ Add Unit</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {editing.units.map((unit, idx) => (
                <div
                  key={unit.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => e.preventDefault()}
                  style={glass({ padding: 20 })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ cursor: 'grab', fontSize: 18, color: '#ffffff40' }}>&#x2630;</span>
                      <span style={{ color: '#ffffff50', fontSize: 12, fontWeight: 600 }}>UNIT {idx + 1}</span>
                    </div>
                    {editing.units.length > 1 && (
                      <button onClick={() => removeUnit(idx)} style={{ ...dangerBtn, padding: '4px 10px', fontSize: 11 }}>Remove</button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Title</label>
                      <input value={unit.title} onChange={e => updateUnit(idx, { title: e.target.value })} style={inputStyle} placeholder="Unit title" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Era Start (year)</label>
                        <input type="number" value={unit.eraStart} onChange={e => updateUnit(idx, { eraStart: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Era End (year)</label>
                        <input type="number" value={unit.eraEnd} onChange={e => updateUnit(idx, { eraEnd: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Description</label>
                      <textarea value={unit.description} onChange={e => updateUnit(idx, { description: e.target.value })} style={{ ...textareaStyle, minHeight: 50 }} placeholder="What this unit covers..." />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Learning Objectives</label>
                      {unit.learningObjectives.map((obj, oi) => (
                        <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          <input
                            value={obj}
                            onChange={e => {
                              const objs = [...unit.learningObjectives];
                              objs[oi] = e.target.value;
                              updateUnit(idx, { learningObjectives: objs });
                            }}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder={`Objective ${oi + 1}`}
                          />
                          {unit.learningObjectives.length > 1 && (
                            <button onClick={() => updateUnit(idx, { learningObjectives: unit.learningObjectives.filter((_, i) => i !== oi) })} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>x</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => updateUnit(idx, { learningObjectives: [...unit.learningObjectives, ''] })} style={{ background: 'none', border: 'none', color: '#93bbfc', cursor: 'pointer', fontSize: 12, padding: '4px 0' }}>+ Add objective</button>
                    </div>

                    {/* Narrative */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Narrative Text</label>
                      <textarea value={unit.narrative} onChange={e => updateUnit(idx, { narrative: e.target.value })} style={{ ...textareaStyle, minHeight: 60 }} placeholder="Narrative text students will read..." />
                    </div>

                    {/* Event search */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Events</label>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input
                          value={eventSearch}
                          onChange={e => { setEventSearch(e.target.value); searchEventsForUnit(e.target.value); }}
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder="Search events to add..."
                        />
                      </div>
                      {eventResults.length > 0 && (
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 6, marginBottom: 6, maxHeight: 120, overflow: 'auto' }}>
                          {eventResults.map(ev => (
                            <button
                              key={ev.id}
                              onClick={() => {
                                if (!unit.eventIds.includes(ev.id)) {
                                  updateUnit(idx, { eventIds: [...unit.eventIds, ev.id] });
                                }
                                setEventSearch('');
                                setEventResults([]);
                              }}
                              style={{ display: 'block', background: 'none', border: 'none', color: '#93bbfc', cursor: 'pointer', fontSize: 12, padding: '4px 8px', width: '100%', textAlign: 'left' }}
                            >
                              + {ev.title} ({ev.year})
                            </button>
                          ))}
                        </div>
                      )}
                      {unit.eventIds.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {unit.eventIds.map(eid => (
                            <span key={eid} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, padding: '2px 8px', color: '#93bbfc', fontSize: 11 }}>
                              {eid}
                              <button onClick={() => updateUnit(idx, { eventIds: unit.eventIds.filter(x => x !== eid) })} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', marginLeft: 4, fontSize: 11 }}>x</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Toggles */}
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff80', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={unit.quizEnabled} onChange={e => updateUnit(idx, { quizEnabled: e.target.checked })} />
                        Include quiz at end
                      </label>
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff80', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!unit.guidedTour} onChange={e => updateUnit(idx, { guidedTour: e.target.checked ? [{ year: unit.eraStart, span: unit.eraEnd - unit.eraStart, text: 'Welcome to this era.' }] : null })} />
                        Include guided tour
                      </label>
                    </div>

                    {/* Discussion prompt */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ color: '#ffffff60', fontSize: 11, display: 'block', marginBottom: 3 }}>Discussion Prompt</label>
                      <textarea value={unit.discussionPrompt} onChange={e => updateUnit(idx, { discussionPrompt: e.target.value })} style={{ ...textareaStyle, minHeight: 50 }} placeholder="A question for students to discuss..." />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Save */}
            <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => saveCurriculum(editing)} disabled={loading} style={blueBtn}>
                {loading ? 'Saving...' : 'Save Curriculum'}
              </button>
            </div>
          </div>
        )}

        {/* ════════ PREVIEW MODE ════════ */}
        {tab === 'curricula' && editing && previewing && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: 0 }}>Student Preview</h2>
              <button onClick={() => setPreviewing(false)} style={{ ...blueBtn, padding: '8px 16px', fontSize: 13 }}>Back to Editor</button>
            </div>

            <div style={glass({ padding: 24, marginBottom: 20 })}>
              <h3 style={{ color: '#fff', fontSize: 20, margin: '0 0 8px' }}>{editing.title || 'Untitled'}</h3>
              <div style={{ color: '#ffffff60', fontSize: 13 }}>{editing.subject} - {editing.gradeLevel}</div>
              <p style={{ color: '#ffffff90', fontSize: 14, marginTop: 10 }}>{editing.description}</p>

              {/* Progress bar */}
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 8, marginTop: 16, overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(90deg, #22c55e, #3b82f6)', height: '100%', width: '0%', borderRadius: 6 }} />
              </div>
              <div style={{ color: '#ffffff40', fontSize: 11, marginTop: 4 }}>0 of {editing.units.length} units completed</div>
            </div>

            {editing.units.map((unit, idx) => (
              <div key={unit.id} style={glass({ padding: 20, marginBottom: 12 })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: '#ffffff50', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>UNIT {idx + 1}</div>
                    <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{unit.title || 'Untitled Unit'}</div>
                    <p style={{ color: '#ffffff70', fontSize: 13, marginTop: 6 }}>{unit.description}</p>
                    {unit.learningObjectives.filter(Boolean).length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ color: '#ffffff50', fontSize: 11, marginBottom: 4 }}>Objectives:</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {unit.learningObjectives.filter(Boolean).map((obj, i) => (
                            <li key={i} style={{ color: '#ffffff80', fontSize: 12, marginBottom: 2 }}>{obj}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#ffffff30', fontSize: 11 }}>~15 min</div>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff30', fontSize: 14 }}>
                      ○
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════════ CLASSROOMS TAB ════════ */}
        {tab === 'classrooms' && !viewingClassroom && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 300, marginBottom: 24 }}>My Classrooms</h2>

            {/* Create classroom */}
            <div style={{ ...glass({ padding: 20, marginBottom: 24 }) }}>
              <div style={{ color: '#ffffff90', fontSize: 13, marginBottom: 10, fontWeight: 600 }}>Create a Classroom</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={classroomName}
                  onChange={e => setClassroomName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createClassroom()}
                  placeholder="Classroom name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={createClassroom} style={blueBtn}>Create</button>
              </div>
            </div>

            {classrooms.length === 0 && (
              <div style={{ color: '#ffffff40', textAlign: 'center', padding: 60, fontSize: 14 }}>
                No classrooms yet. Create one above.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {classrooms.map(cr => (
                <div key={cr.id} style={glass({ padding: '18px 22px' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{cr.name}</div>
                      <div style={{ color: '#ffffff50', fontSize: 12, marginTop: 4 }}>
                        Join Code: <span style={{ color: '#93bbfc', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}>{cr.joinCode}</span>
                        {cr.curriculumId && <> · Curriculum assigned</>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => viewProgress(cr)} style={{ ...greenBtn, padding: '6px 14px', fontSize: 12 }}>View Progress</button>
                      <select
                        value={cr.curriculumId || ''}
                        onChange={e => e.target.value && assignCurriculum(cr.id, e.target.value)}
                        style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '6px 10px' }}
                      >
                        <option value="">Assign curriculum...</option>
                        {curricula.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════ CLASSROOM PROGRESS VIEW ════════ */}
        {tab === 'classrooms' && viewingClassroom && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 300, margin: 0 }}>
                {viewingClassroom.name} — Student Progress
              </h2>
              <button onClick={() => setViewingClassroom(null)} style={{ ...blueBtn, padding: '8px 16px', fontSize: 13 }}>Back</button>
            </div>

            <div style={glass({ padding: 16, marginBottom: 16 })}>
              <div style={{ color: '#ffffff60', fontSize: 12 }}>
                Join Code: <span style={{ color: '#93bbfc', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}>{viewingClassroom.joinCode}</span>
              </div>
            </div>

            {studentRoster.length === 0 && (
              <div style={{ color: '#ffffff40', textAlign: 'center', padding: 60, fontSize: 14 }}>
                No students have joined yet.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {studentRoster.map(s => {
                const totalUnits = curricula.find(c => c.id === viewingClassroom.curriculumId)?.units.length || 1;
                const pct = Math.round((s.completedUnits.length / totalUnits) * 100);
                const avgScore = Object.values(s.quizScores).length > 0
                  ? Math.round(Object.values(s.quizScores).reduce((a, b) => a + b, 0) / Object.values(s.quizScores).length)
                  : 0;
                return (
                  <div key={s.userId} style={glass({ padding: '14px 20px' })}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{s.userName || s.userId}</div>
                        <div style={{ color: '#ffffff40', fontSize: 11 }}>Joined {new Date(s.joinedAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#6ee7a0', fontSize: 18, fontWeight: 700 }}>{pct}%</div>
                          <div style={{ color: '#ffffff40', fontSize: 10 }}>Progress</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#93bbfc', fontSize: 18, fontWeight: 700 }}>{avgScore}%</div>
                          <div style={{ color: '#ffffff40', fontSize: 10 }}>Avg Quiz</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{s.completedUnits.length}/{totalUnits}</div>
                          <div style={{ color: '#ffffff40', fontSize: 10 }}>Units</div>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 4, marginTop: 10, overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #22c55e, #3b82f6)', height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
