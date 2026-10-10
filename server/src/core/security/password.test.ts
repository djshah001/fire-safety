import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a different password', async () => {
    const hash = await hashPassword('Correct horse battery staple 123!');

    await expect(verifyPassword('Correct horse battery staple 123!', hash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', hash)).resolves.toBe(false);
  });

  it('rejects unknown or malformed hash formats', async () => {
    await expect(verifyPassword('password', 'bcrypt$not-supported')).resolves.toBe(false);
  });
});
