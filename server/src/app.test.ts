import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('foundation API', () => {
  it('returns a request-scoped liveness envelope', async () => {
    const response = await request(createApp({ checkReadiness: async () => undefined }))
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'foundation-test');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('foundation-test');
    expect(response.body).toMatchObject({
      data: { service: 'fire-safety-api', status: 'ok' },
      requestId: 'foundation-test',
    });
  });

  it('reports readiness failure without leaking the database error', async () => {
    const response = await request(createApp({
      checkReadiness: async () => {
        throw new Error('database secret detail');
      },
    })).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'NOT_READY',
      message: 'The API is not ready to serve database-backed requests.',
    });
    expect(JSON.stringify(response.body)).not.toContain('database secret detail');
  });

  it('rejects cross-origin mutation requests', async () => {
    const response = await request(createApp({ checkReadiness: async () => undefined }))
      .post('/api/v1/not-a-route')
      .set('Origin', 'https://attacker.example');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('does not expose the private upload directory as static content', async () => {
    const response = await request(createApp({ checkReadiness: async () => undefined }))
      .get('/uploads/00000000-0000-4000-8000-000000000000.pdf');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects unauthenticated access to employee administration', async () => {
    const response = await request(createApp({ checkReadiness: async () => undefined }))
      .get('/api/v1/admin/users');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validates login input before accessing identity records', async () => {
    const response = await request(createApp({ checkReadiness: async () => undefined }))
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
