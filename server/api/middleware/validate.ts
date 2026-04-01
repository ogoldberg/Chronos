/**
 * Zod validation helper for route handlers.
 */

import type { z } from 'zod';

export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const message = result.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  return { success: false, error: message };
}
