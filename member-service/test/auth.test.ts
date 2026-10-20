import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { memberRepository } from '../src/members/memberRepository';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

const librarianIdentity: {
  'x-service-key': string;
  'x-user-id': string;
  'x-user-role': 'librarian';
} = {
  ...serviceKey,
  'x-user-id': '10',
  'x-user-role': 'librarian',
};

const memberIdentity: {
  'x-service-key': string;
  'x-user-id': string;
  'x-user-role': 'member';
  'x-user-member-id': string;
} = {
  ...serviceKey,
  'x-user-id': '20',
  'x-user-role': 'member',
  'x-user-member-id': '1',
};

describe('service gate and caller identity', () => {
  beforeEach(() => {
    memberRepository.reset();
    memberRepository.create({ name: 'Ada Lovelace', email: 'ada@example.com' });
    memberRepository.create({ name: 'Grace Hopper', email: 'grace@example.com' });
  });

  it('serves /health without a service key', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'member-service' });
  });

  it('rejects /members without a service key', async () => {
    const res = await request(app).get('/members');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /members with a wrong service key', async () => {
    const res = await request(app).get('/members').set('x-service-key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an unknown path without a service key', async () => {
    const res = await request(app).get('/not-a-real-path');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /internal/members without a service key', async () => {
    const res = await request(app).get('/internal/members');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /members with a valid service key but no identity headers', async () => {
    const res = await request(app).get('/members').set(serviceKey);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /members with no x-user-id', async () => {
    const res = await request(app)
      .get('/members')
      .set({ ...serviceKey, 'x-user-role': 'librarian' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /members with no x-user-role', async () => {
    const res = await request(app).get('/members').set({ ...serviceKey, 'x-user-id': '10' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an x-user-role outside the allowed values', async () => {
    const res = await request(app)
      .get('/members')
      .set({ ...serviceKey, 'x-user-id': '10', 'x-user-role': 'admin' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a member caller with no x-user-member-id', async () => {
    const res = await request(app)
      .get('/members')
      .set({ ...serviceKey, 'x-user-id': '20', 'x-user-role': 'member' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a member caller with a non-numeric x-user-member-id', async () => {
    const res = await request(app)
      .get('/members')
      .set({ ...serviceKey, 'x-user-id': '20', 'x-user-role': 'member', 'x-user-member-id': 'abc' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('lets a librarian through the identity gate with no x-user-member-id', async () => {
    const res = await request(app).get('/members').set(librarianIdentity);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('lets a member read their own record', async () => {
    const res = await request(app).get('/members/1').set(memberIdentity);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      active: true,
    });
  });

  it('forbids a member from reading another member record', async () => {
    const res = await request(app).get('/members/2').set(memberIdentity);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('forbids a member from listing members', async () => {
    const res = await request(app).get('/members').set(memberIdentity);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('forbids a member from patching another member and leaves the record unchanged', async () => {
    const res = await request(app)
      .patch('/members/2')
      .set(memberIdentity)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const stored = await request(app).get('/members/2').set(librarianIdentity);
    expect(stored.body).toEqual({
      id: 2,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      active: true,
    });
  });

  it('forbids a member from deleting another member', async () => {
    const res = await request(app).delete('/members/2').set(memberIdentity);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const stored = await request(app).get('/members/2').set(librarianIdentity);
    expect(stored.status).toBe(200);
  });
});
