import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { memberRepository } from '../src/members/memberRepository';
import type { Member } from '../src/members/types';
import { config } from '../src/config';

const serviceKey: { 'x-service-key': string } = { 'x-service-key': config.serviceKey };

const librarian = { ...serviceKey, 'x-user-id': '10', 'x-user-role': 'librarian' };

const adaSeed = { name: 'Ada Lovelace', email: 'ada@example.com' };

describe('internal member routes', () => {
  beforeEach(() => {
    memberRepository.reset();
  });

  it('creates a member with the service key alone', async () => {
    const res = await request(app)
      .post('/internal/members')
      .set(serviceKey)
      .send({ name: 'Grace Hopper', email: 'grace@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 1,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      active: true,
    });
  });

  it('normalises a created email to lowercase', async () => {
    const res = await request(app)
      .post('/internal/members')
      .set(serviceKey)
      .send({ name: 'Grace Hopper', email: 'Grace.Hopper@Example.COM' });

    expect(res.status).toBe(201);
    expect((res.body as Member).email).toBe('grace.hopper@example.com');
  });

  const invalidCreateBodies: [string, Record<string, unknown>][] = [
    ['a missing name', { email: 'grace@example.com' }],
    ['an empty name', { name: '', email: 'grace@example.com' }],
    ['a whitespace-only name', { name: '   ', email: 'grace@example.com' }],
    ['a missing email', { name: 'Grace Hopper' }],
    ['an invalid email', { name: 'Grace Hopper', email: 'not-an-email' }],
    ['an email without a dot in the domain', { name: 'Grace Hopper', email: 'grace@example' }],
    ['an empty email', { name: 'Grace Hopper', email: '' }],
  ];

  for (const [label, body] of invalidCreateBodies) {
    it(`rejects a create with ${label}`, async () => {
      const res = await request(app).post('/internal/members').set(serviceKey).send(body);

      expect(res.status).toBe(400);

      const list = await request(app).get('/internal/members').set(serviceKey);
      expect(list.body).toEqual([]);
    });
  }

  it('rejects a duplicate email in a different case and creates nothing', async () => {
    memberRepository.create(adaSeed);

    const res = await request(app)
      .post('/internal/members')
      .set(serviceKey)
      .send({ name: 'Ada Again', email: 'ADA@Example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'A member with this email already exists' });

    const list = await request(app).get('/internal/members').set(serviceKey);
    expect(list.body).toEqual([
      { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: true },
    ]);
  });

  it('lists every member for the service key alone', async () => {
    memberRepository.create(adaSeed);

    const created = await request(app)
      .post('/internal/members')
      .set(serviceKey)
      .send({ name: 'Grace Hopper', email: 'grace@example.com' });

    const res = await request(app).get('/internal/members').set(serviceKey);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: true },
      created.body,
    ]);
  });

  it('shares the repository with the public routes', async () => {
    const created = await request(app)
      .post('/internal/members')
      .set(serviceKey)
      .send({ name: 'Grace Hopper', email: 'grace@example.com' });

    expect(created.status).toBe(201);

    const publicList = await request(app).get('/members').set(librarian);

    expect(publicList.status).toBe(200);
    expect(publicList.body).toEqual([created.body]);
  });

  it('gets a single member by id', async () => {
    const created = memberRepository.create(adaSeed);

    const res = await request(app).get(`/internal/members/${created.id}`).set(serviceKey);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('returns 404 for an unknown member id', async () => {
    const res = await request(app).get('/internal/members/999').set(serviceKey);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
  });

  it('returns 404 for a non-numeric member id', async () => {
    const res = await request(app).get('/internal/members/abc').set(serviceKey);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
  });

  it('rejects internal creates without a service key and creates nothing', async () => {
    const res = await request(app)
      .post('/internal/members')
      .send({ name: 'Grace Hopper', email: 'grace@example.com' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });

    const list = await request(app).get('/internal/members').set(serviceKey);
    expect(list.body).toEqual([]);
  });

  it('rejects internal reads with a wrong service key', async () => {
    const res = await request(app).get('/internal/members').set('x-service-key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});
