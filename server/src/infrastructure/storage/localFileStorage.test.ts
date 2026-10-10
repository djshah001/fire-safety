import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../core/errors/appError.js';
import { resolvePrivateFile } from './localFileStorage.js';

describe('local private file storage', () => {
  it('resolves generated storage names inside the configured root', () => {
    const resolved = resolvePrivateFile('00000000-0000-4000-8000-000000000000.pdf');

    expect(path.basename(resolved)).toBe('00000000-0000-4000-8000-000000000000.pdf');
    expect(path.basename(path.dirname(resolved))).toBe('uploads');
  });

  it('rejects traversal and client-supplied paths', () => {
    expect(() => resolvePrivateFile('../outside.pdf')).toThrow(AppError);
    expect(() => resolvePrivateFile('customer-file.pdf')).toThrow(AppError);
  });
});
