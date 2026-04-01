/**
 * Moderation routes for community contributions:
 * GET  /api/moderation/queue   — list pending contributions (admin/teacher)
 * POST /api/moderation/approve — approve a contribution
 * POST /api/moderation/reject  — reject with reason
 */

import { z } from 'zod';
import { getPool } from '../../db';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const approveSchema = z.object({
  id: z.number({ message: 'id is required' }),
  reviewedBy: z.string().min(1, 'reviewedBy is required'),
});

const rejectSchema = z.object({
  id: z.number({ message: 'id is required' }),
  reviewedBy: z.string().min(1, 'reviewedBy is required'),
  reason: z.string().min(1, 'Rejection reason is required'),
});

export function registerModerationRoutes(route: RouteHandler, isDbReady: () => boolean) {
  // List pending contributions (admin only — requires ADMIN_KEY)
  route('GET', '/api/moderation/queue', null, async (_body, url, reqHeaders) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || reqHeaders?.['x-admin-key'] !== adminKey) {
      return { status: 403, data: { error: 'Admin access required' } };
    }
    if (!isDbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    const db = getPool();
    const params = new URLSearchParams(url.split('?')[1] || '');
    const status = params.get('status') || 'pending';
    const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);

    const result = await db.query(
      `SELECT * FROM moderation_queue
       WHERE status = $1
       ORDER BY submitted_at DESC
       LIMIT $2`,
      [status, limit],
    );

    return { status: 200, data: { items: result.rows } };
  });

  // Approve a contribution (admin only)
  route('POST', '/api/moderation/approve', null, async (body, _url, reqHeaders) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || reqHeaders?.['x-admin-key'] !== adminKey) {
      return { status: 403, data: { error: 'Admin access required' } };
    }
    if (!isDbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    const v = validate(approveSchema, body);
    if (!v.success) {
      return { status: 400, data: { error: v.error } };
    }

    const { id, reviewedBy } = v.data;
    const db = getPool();

    const result = await db.query(
      `UPDATE moderation_queue
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, reviewedBy],
    );

    if (result.rowCount === 0) {
      return { status: 404, data: { error: 'Item not found or already reviewed' } };
    }

    return { status: 200, data: { item: result.rows[0] } };
  });

  // Reject a contribution (admin only)
  route('POST', '/api/moderation/reject', null, async (body, _url, reqHeaders) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || reqHeaders?.['x-admin-key'] !== adminKey) {
      return { status: 403, data: { error: 'Admin access required' } };
    }
    if (!isDbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    const v = validate(rejectSchema, body);
    if (!v.success) {
      return { status: 400, data: { error: v.error } };
    }

    const { id, reviewedBy, reason } = v.data;
    const db = getPool();

    const result = await db.query(
      `UPDATE moderation_queue
       SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), reject_reason = $3
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, reviewedBy, reason],
    );

    if (result.rowCount === 0) {
      return { status: 404, data: { error: 'Item not found or already reviewed' } };
    }

    return { status: 200, data: { item: result.rows[0] } };
  });
}
