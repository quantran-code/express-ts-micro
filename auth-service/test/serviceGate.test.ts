import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { userRepository } from '../src/users/userRepository';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

describe('service gate', () => {
  beforeEach(() => {
    userRepository.reset();
  });

  it('serves /health without a service key', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth-service' });
  });

  it('rejects /auth/register without a service key', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Grace Hopper', email: 'grace@example.com', password: 'Secret123!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /auth/register with a wrong service key', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('x-service-key', 'wrong-key')
      .send({ name: 'Grace Hopper', email: 'grace@example.com', password: 'Secret123!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /auth/login without a service key', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'librarian@library.test', password: 'Librarian123!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /auth/login with a wrong service key', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('x-service-key', 'wrong-key')
      .send({ email: 'librarian@library.test', password: 'Librarian123!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /auth/members/:id/deactivate without a service key', async () => {
    const res = await request(app)
      .post('/auth/members/1/deactivate')
      .set({ 'x-user-role': 'librarian' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /auth/members/:id/deactivate with a wrong service key', async () => {
    const res = await request(app)
      .post('/auth/members/1/deactivate')
      .set({ 'x-service-key': 'wrong-key', 'x-user-role': 'librarian' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an unknown path without a service key', async () => {
    const res = await request(app).get('/not-a-real-path');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('lets a valid service key through to the login route', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: 'nobody@example.com', password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('returns 404 with a valid service key on an unknown path', async () => {
    const res = await request(app).get('/not-a-real-path').set(serviceKey);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});
