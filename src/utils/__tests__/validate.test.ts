import { describe, it, expect } from 'vitest';
import { validate } from '../../../server/api/middleware/validate';
import { z } from 'zod';

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().min(0).max(150),
    email: z.string().email().optional(),
  });

  it('returns success for valid data', () => {
    const result = validate(schema, { name: 'Alice', age: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.age).toBe(30);
    }
  });

  it('returns error for missing required fields', () => {
    const result = validate(schema, { age: 30 });
    expect(result.success).toBe(false);
  });

  it('returns error for wrong types', () => {
    const result = validate(schema, { name: 123, age: 'thirty' });
    expect(result.success).toBe(false);
  });

  it('returns error for out-of-range values', () => {
    const result = validate(schema, { name: 'Bob', age: 200 });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields when missing', () => {
    const result = validate(schema, { name: 'Carol', age: 25 });
    expect(result.success).toBe(true);
  });

  it('validates optional fields when present', () => {
    const result = validate(schema, { name: 'Dan', age: 40, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('accepts valid optional fields', () => {
    const result = validate(schema, { name: 'Eve', age: 35, email: 'eve@example.com' });
    expect(result.success).toBe(true);
  });
});

describe('validate with defaults', () => {
  const schema = z.object({
    count: z.number().min(1).max(20).optional().default(10),
    query: z.string(),
  });

  it('applies defaults for missing optional fields', () => {
    const result = validate(schema, { query: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(10);
    }
  });

  it('respects provided values over defaults', () => {
    const result = validate(schema, { query: 'test', count: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(5);
    }
  });
});
