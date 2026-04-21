/**
 * Curriculum & Classroom API routes
 *
 * POST   /api/curriculum          — create curriculum
 * GET    /api/curriculum          — list or get curriculum by id
 * PUT    /api/curriculum          — update curriculum (owner only)
 * DELETE /api/curriculum          — delete curriculum (owner only)
 * POST   /api/curriculum/generate — AI generates curriculum from topic
 * POST   /api/classroom           — create classroom (generates join code)
 * GET    /api/classroom           — list teacher's classrooms
 * POST   /api/classroom/join      — student joins with code
 * POST   /api/classroom/assign    — assign curriculum to classroom
 * GET    /api/classroom/progress  — student progress for classroom
 * POST   /api/classroom/progress  — save student progress
 */

import { z } from 'zod';
import { getPool } from '../../db';
import { getAuth } from '../../auth';
import { getProviderForRequest } from '../../providers/index';
import { CURRICULUM_SYSTEM } from '../../../src/ai/prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const curriculumCreateSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional().default('Untitled'),
  subject: z.string().optional().default(''),
  gradeLevel: z.string().optional().default(''),
  description: z.string().optional().default(''),
  units: z.array(z.any()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
});

const curriculumUpdateSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional().default('Untitled'),
  subject: z.string().optional().default(''),
  gradeLevel: z.string().optional().default(''),
  description: z.string().optional().default(''),
  units: z.array(z.any()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
});

const curriculumGenerateSchema = z.object({
  topic: z.string().min(1, 'topic is required'),
});

const classroomCreateSchema = z.object({
  name: z.string().optional().default('My Classroom'),
});

const classroomJoinSchema = z.object({
  code: z.string().length(6, 'Invalid join code'),
});

const classroomAssignSchema = z.object({
  classroomId: z.string().min(1, 'Missing classroomId'),
  curriculumId: z.string().min(1, 'Missing curriculumId'),
});

const classroomProgressSchema = z.object({
  classroomId: z.string().min(1, 'Missing classroomId'),
  progress: z.any().optional().default({}),
});

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getSessionUser(reqHeaders: Record<string, string | string[] | undefined> | undefined) {
  const authInstance = getAuth();
  if (!authInstance) return null;
  const headers = new Headers((reqHeaders || {}) as Record<string, string>);
  const session = await authInstance.api.getSession({ headers });
  return session?.user?.id ? session.user : null;
}

export function registerCurriculumRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  // ── POST /api/curriculum — create ──
  handleRoute('POST', '/api/curriculum', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const parsed = validate(curriculumCreateSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };

    const db = getPool();
    const id = parsed.data.id || (Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    await db.query(
      `INSERT INTO curricula (id, teacher_id, title, subject, grade_level, description, units, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, user.id, parsed.data.title, parsed.data.subject, parsed.data.gradeLevel,
       parsed.data.description, JSON.stringify(parsed.data.units), parsed.data.isPublic],
    );
    return { status: 200, data: { id, ok: true } };
  });

  // ── GET /api/curriculum — list or get by id ──
  handleRoute('GET', '/api/curriculum', null, async (_body, url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const params = new URL(url, 'http://localhost').searchParams;
    const db = getPool();

    const id = params.get('id');
    if (id) {
      const result = await db.query('SELECT * FROM curricula WHERE id = $1', [id]);
      if (result.rows.length === 0) return { status: 404, data: { error: 'Not found' } };
      const row = result.rows[0];
      return {
        status: 200,
        data: {
          curriculum: {
            id: row.id, title: row.title, subject: row.subject, gradeLevel: row.grade_level,
            description: row.description, units: row.units || [], isPublic: row.is_public,
            createdAt: row.created_at, updatedAt: row.updated_at,
          },
        },
      };
    }

    // List teacher's curricula
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 200, data: { curricula: [] } };
    const result = await db.query(
      'SELECT * FROM curricula WHERE teacher_id = $1 ORDER BY updated_at DESC',
      [user.id],
    );
    return {
      status: 200,
      data: {
        curricula: result.rows.map(r => ({
          id: r.id, title: r.title, subject: r.subject, gradeLevel: r.grade_level,
          description: r.description, units: r.units || [], isPublic: r.is_public,
          createdAt: r.created_at, updatedAt: r.updated_at,
        })),
      },
    };
  });

  // ── PUT /api/curriculum — update ──
  handleRoute('PUT', '/api/curriculum', null, async (body, url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const parsedBody = validate(curriculumUpdateSchema, body);
    if (!parsedBody.success) return { status: 400, data: { error: parsedBody.error } };

    const params = new URL(url, 'http://localhost').searchParams;
    const id = params.get('id') || parsedBody.data.id;
    if (!id) return { status: 400, data: { error: 'Missing curriculum id' } };

    const db = getPool();
    const existing = await db.query('SELECT teacher_id FROM curricula WHERE id = $1', [id]);
    if (existing.rows.length === 0) return { status: 404, data: { error: 'Not found' } };
    if (existing.rows[0].teacher_id !== user.id) return { status: 403, data: { error: 'Not the owner' } };

    await db.query(
      `UPDATE curricula SET title=$1, subject=$2, grade_level=$3, description=$4, units=$5, is_public=$6, updated_at=NOW()
       WHERE id=$7`,
      [parsedBody.data.title, parsedBody.data.subject, parsedBody.data.gradeLevel,
       parsedBody.data.description, JSON.stringify(parsedBody.data.units), parsedBody.data.isPublic, id],
    );
    return { status: 200, data: { ok: true } };
  });

  // ── DELETE /api/curriculum ──
  handleRoute('DELETE', '/api/curriculum', null, async (_body, url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const params = new URL(url, 'http://localhost').searchParams;
    const id = params.get('id');
    if (!id) return { status: 400, data: { error: 'Missing id' } };

    const db = getPool();
    await db.query('DELETE FROM curricula WHERE id = $1 AND teacher_id = $2', [id, user.id]);
    return { status: 200, data: { ok: true } };
  });

  // ── POST /api/curriculum/generate — AI generates curriculum ──
  handleRoute('POST', '/api/curriculum/generate', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('curriculum-generate', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsedGen = validate(curriculumGenerateSchema, body);
    if (!parsedGen.success) return { status: 400, data: { error: parsedGen.error } };
    const { topic } = parsedGen.data;

    // Extract grade level hint from topic
    const gradeLevelMatch = topic.match(/(\d+)(?:th|st|nd|rd)\s*grade/i);
    const gradeLevel = gradeLevelMatch ? `${gradeLevelMatch[1]}th Grade` : '8th Grade';

    const ai = getProviderForRequest(reqHeaders);
    const system = CURRICULUM_SYSTEM(topic, gradeLevel);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate a comprehensive curriculum about: ${topic}` },
    ], { maxTokens: 3000 });

    const jsonMatch = resp.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return { status: 200, data: { curriculum: parsed } };
      } catch { /* fall through */ }
    }
    return { status: 500, data: { error: 'Failed to generate curriculum. Try again.' } };
  });

  // ── POST /api/classroom — create classroom ──
  handleRoute('POST', '/api/classroom', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const parsedCr = validate(classroomCreateSchema, body);
    if (!parsedCr.success) return { status: 400, data: { error: parsedCr.error } };

    const db = getPool();
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const joinCode = generateJoinCode();

    await db.query(
      'INSERT INTO classrooms (id, teacher_id, name, join_code) VALUES ($1, $2, $3, $4)',
      [id, user.id, parsedCr.data.name, joinCode],
    );
    return { status: 200, data: { id, joinCode, ok: true } };
  });

  // ── GET /api/classroom — list teacher's classrooms ──
  handleRoute('GET', '/api/classroom', null, async (_body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 200, data: { classrooms: [] } };

    const db = getPool();
    const result = await db.query(
      'SELECT * FROM classrooms WHERE teacher_id = $1 ORDER BY created_at DESC',
      [user.id],
    );
    return {
      status: 200,
      data: {
        classrooms: result.rows.map(r => ({
          id: r.id, name: r.name, joinCode: r.join_code,
          curriculumId: r.curriculum_id, createdAt: r.created_at,
        })),
      },
    };
  });

  // ── POST /api/classroom/join — student joins with code ──
  handleRoute('POST', '/api/classroom/join', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const parsedJoin = validate(classroomJoinSchema, body);
    if (!parsedJoin.success) return { status: 400, data: { error: parsedJoin.error } };
    const { code } = parsedJoin.data;

    const db = getPool();
    const cr = await db.query('SELECT * FROM classrooms WHERE join_code = $1', [code.toUpperCase()]);
    if (cr.rows.length === 0) return { status: 404, data: { error: 'Classroom not found' } };
    const classroom = cr.rows[0];

    // Get or create student enrollment
    const user = await getSessionUser(reqHeaders);
    const userId = user?.id || `anon-${getClientIP(reqHeaders || {})}`;

    await db.query(
      `INSERT INTO classroom_students (classroom_id, user_id, progress)
       VALUES ($1, $2, '{}')
       ON CONFLICT (classroom_id, user_id) DO NOTHING`,
      [classroom.id, userId],
    );

    // Get student progress
    const prog = await db.query(
      'SELECT progress FROM classroom_students WHERE classroom_id = $1 AND user_id = $2',
      [classroom.id, userId],
    );

    // Get curriculum if assigned
    let curriculum = null;
    if (classroom.curriculum_id) {
      const cur = await db.query('SELECT * FROM curricula WHERE id = $1', [classroom.curriculum_id]);
      if (cur.rows.length > 0) {
        const r = cur.rows[0];
        curriculum = {
          id: r.id, title: r.title, subject: r.subject, gradeLevel: r.grade_level,
          description: r.description, units: r.units || [],
        };
      }
    }

    return {
      status: 200,
      data: {
        classroom: {
          id: classroom.id, name: classroom.name, joinCode: classroom.join_code,
          curriculum,
        },
        progress: prog.rows[0]?.progress || { completedUnits: [], quizScores: {}, xpEarned: 0 },
      },
    };
  });

  // ── POST /api/classroom/assign — assign curriculum to classroom ──
  handleRoute('POST', '/api/classroom/assign', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const parsedAssign = validate(classroomAssignSchema, body);
    if (!parsedAssign.success) return { status: 400, data: { error: parsedAssign.error } };
    const { classroomId, curriculumId } = parsedAssign.data;

    const db = getPool();
    await db.query(
      'UPDATE classrooms SET curriculum_id = $1 WHERE id = $2 AND teacher_id = $3',
      [curriculumId, classroomId, user.id],
    );
    return { status: 200, data: { ok: true } };
  });

  // ── GET /api/classroom/progress — student progress for classroom ──
  handleRoute('GET', '/api/classroom/progress', null, async (_body, url) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const params = new URL(url, 'http://localhost').searchParams;
    const id = params.get('id');
    if (!id) return { status: 400, data: { error: 'Missing classroom id' } };

    const db = getPool();
    const result = await db.query(
      'SELECT user_id, progress, joined_at FROM classroom_students WHERE classroom_id = $1',
      [id],
    );

    return {
      status: 200,
      data: {
        students: result.rows.map(r => ({
          userId: r.user_id,
          userName: r.user_id,
          completedUnits: r.progress?.completedUnits || [],
          quizScores: r.progress?.quizScores || {},
          joinedAt: r.joined_at,
        })),
      },
    };
  });

  // ── POST /api/classroom/progress — save student progress ──
  handleRoute('POST', '/api/classroom/progress', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const parsedProg = validate(classroomProgressSchema, body);
    if (!parsedProg.success) return { status: 400, data: { error: parsedProg.error } };
    const { classroomId, progress } = parsedProg.data;

    const user = await getSessionUser(reqHeaders);
    const userId = user?.id || `anon-${getClientIP(reqHeaders || {})}`;

    const db = getPool();
    await db.query(
      `UPDATE classroom_students SET progress = $1 WHERE classroom_id = $2 AND user_id = $3`,
      [JSON.stringify(progress || {}), classroomId, userId],
    );
    return { status: 200, data: { ok: true } };
  });
}
