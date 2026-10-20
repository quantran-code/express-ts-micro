import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { memberRepository } from '../src/members/memberRepository';
import type { Member } from '../src/members/types';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

const librarian = { ...serviceKey, 'x-user-id': '10', 'x-user-role': 'librarian' };

const adaSeed = { name: 'Ada Lovelace', email: 'ada@example.com' };

const adaRecord = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: true };

describe('member active field', () => {
  beforeEach(() => {
    memberRepository.reset();
  });

  it('serves /health without a service key', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'member-service' });
  });

  it('defaults active to true on a repository create', () => {
    const created = memberRepository.create(adaSeed);

    expect(created.active).toBe(true);
  });

  it('includes active in a created member', async () => {
    const res = await request(app).post('/internal/members').set(serviceKey).send(adaSeed);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(adaRecord);
  });

  it('includes active in the public member list', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app).get('/members').set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([adaRecord]);
  });

  it('includes active when reading a single member', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app).get('/members/1').set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(adaRecord);
  });

  it('includes active in a patched member', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app).patch('/members/1').set(librarian).send({ name: 'Ada King' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...adaRecord, name: 'Ada King' });
  });

  it('includes active in the internal member list', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app).get('/internal/members').set(serviceKey);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([adaRecord]);
  });

  it('includes active when reading a single member internally', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app).get('/internal/members/1').set(serviceKey);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(adaRecord);
  });

  it('deactivates a member with the service key alone', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app)
      .patch('/internal/members/1/active')
      .set(serviceKey)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...adaRecord, active: false });

    const internal = await request(app).get('/internal/members/1').set(serviceKey);
    expect((internal.body as Member).active).toBe(false);

    const stored = memberRepository.findById(1);
    expect(stored?.active).toBe(false);
  });

  it('reflects a deactivation on the public read route', async () => {
    memberRepository.create(adaSeed);

    await request(app).patch('/internal/members/1/active').set(serviceKey).send({ active: false });

    const res = await request(app).get('/members/1').set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...adaRecord, active: false });
  });

  const invalidActiveBodies: [string, Record<string, unknown> | undefined][] = [
    ['a missing active', {}],
    ['a string active', { active: 'false' }],
    ['a null active', { active: null }],
    ['no body at all', undefined],
  ];

  for (const [label, body] of invalidActiveBodies) {
    it(`rejects a deactivation with ${label}`, async () => {
      memberRepository.create(adaSeed);

      const call = request(app).patch('/internal/members/1/active').set(serviceKey);
      const res = await (body === undefined ? call : call.send(body));

      expect(res.status).toBe(400);

      const stored = memberRepository.findById(1);
      expect(stored?.active).toBe(true);
    });
  }

  it('returns 404 when deactivating an unknown member', async () => {
    const res = await request(app)
      .patch('/internal/members/999/active')
      .set(serviceKey)
      .send({ active: false });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
  });

  it('rejects a deactivation without the service key and leaves the member active', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app).patch('/internal/members/1/active').send({ active: false });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });

    const stored = memberRepository.findById(1);
    expect(stored?.active).toBe(true);
  });
});
