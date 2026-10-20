import request from 'supertest';
import { compare } from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app';
import { userRepository } from '../src/users/userRepository';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

const librarianCaller = { ...serviceKey, 'x-user-role': 'librarian' };

const validBody = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  password: 'Secret123!',
};

const createdMember = { id: 5, name: 'Grace Hopper', email: 'grace@example.com', active: true };

interface StubResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function stubMemberService(response: StubResponse = { ok: true, status: 201, body: createdMember }) {
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });

    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    };
  });

  vi.stubGlobal('fetch', fetchMock);

  return { fetchMock, calls };
}

function stubUnreachableMemberService() {
  const fetchMock = vi.fn(() => Promise.reject(new Error('member-service is down')));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function readSentBody(call: RecordedCall): unknown {
  return JSON.parse(String(call.init.body));
}

describe('POST /auth/register', () => {
  beforeEach(() => {
    userRepository.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a member user and returns the agreed shape', async () => {
    const { calls } = stubMemberService();

    const res = await request(app).post('/auth/register').set(serviceKey).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 2,
      memberId: 5,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'member',
      active: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${config.memberServiceUrl}/internal/members`);
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      headers: { 'x-service-key': config.serviceKey },
    });
    expect(readSentBody(calls[0])).toEqual({
      name: 'Grace Hopper',
      email: 'grace@example.com',
    });
  });

  it('stores a bcrypt hash rather than the plain password', async () => {
    stubMemberService();

    const res = await request(app).post('/auth/register').set(serviceKey).send(validBody);

    expect(res.status).toBe(201);

    const stored = userRepository.findByEmail('grace@example.com');
    expect(stored).toBeDefined();
    expect(stored?.passwordHash).not.toBe(validBody.password);
    await expect(compare(validBody.password, String(stored?.passwordHash))).resolves.toBe(true);
  });

  it('normalises the stored email to lowercase', async () => {
    stubMemberService();

    const res = await request(app)
      .post('/auth/register')
      .set(serviceKey)
      .send({ ...validBody, email: 'Grace.Hopper@Example.COM' });

    expect(res.status).toBe(201);
    expect(userRepository.findByEmail('grace.hopper@example.com')).toBeDefined();
  });

  it('accepts an explicit member role and stores it', async () => {
    stubMemberService();

    const res = await request(app)
      .post('/auth/register')
      .set(serviceKey)
      .send({ ...validBody, role: 'member' });

    expect(res.status).toBe(201);
    expect(userRepository.findByEmail('grace@example.com')?.role).toBe('member');
  });

  it('creates a librarian when the caller forwards the librarian role', async () => {
    stubMemberService();

    const res = await request(app)
      .post('/auth/register')
      .set(librarianCaller)
      .send({ ...validBody, role: 'librarian' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('librarian');
    expect(userRepository.findByEmail('grace@example.com')?.role).toBe('librarian');
  });

  it('forbids creating a librarian without a forwarded librarian role and creates nothing', async () => {
    const { fetchMock } = stubMemberService();

    const res = await request(app)
      .post('/auth/register')
      .set(serviceKey)
      .send({ ...validBody, role: 'librarian' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Only a librarian can create a librarian account' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(userRepository.findByEmail('grace@example.com')).toBeUndefined();
  });

  it('forbids creating a librarian for a member caller', async () => {
    const { fetchMock } = stubMemberService();

    const res = await request(app)
      .post('/auth/register')
      .set({ ...serviceKey, 'x-user-role': 'member' })
      .send({ ...validBody, role: 'librarian' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Only a librarian can create a librarian account' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const invalidBodies: [string, Record<string, unknown>][] = [
    ['a missing name', { email: 'grace@example.com', password: 'Secret123!' }],
    ['a blank name', { name: '   ', email: 'grace@example.com', password: 'Secret123!' }],
    ['a missing email', { name: 'Grace Hopper', password: 'Secret123!' }],
    ['an invalid email', { name: 'Grace Hopper', email: 'not-an-email', password: 'Secret123!' }],
    ['an email without a dot in the domain', { name: 'Grace Hopper', email: 'grace@example', password: 'Secret123!' }],
    ['a missing password', { name: 'Grace Hopper', email: 'grace@example.com' }],
    ['a short password', { name: 'Grace Hopper', email: 'grace@example.com', password: 'short' }],
    [
      'a role outside the allowed values',
      { name: 'Grace Hopper', email: 'grace@example.com', password: 'Secret123!', role: 'admin' },
    ],
  ];

  for (const [label, body] of invalidBodies) {
    it(`rejects a register with ${label} and calls member-service zero times`, async () => {
      const { fetchMock } = stubMemberService();

      const res = await request(app).post('/auth/register').set(serviceKey).send(body);

      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(userRepository.findByEmail('grace@example.com')).toBeUndefined();
    });
  }

  it('rejects a locally duplicate email without calling member-service', async () => {
    const { fetchMock } = stubMemberService();

    const first = await request(app).post('/auth/register').set(serviceKey).send(validBody);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/auth/register')
      .set(serviceKey)
      .send({ ...validBody, email: 'GRACE@Example.com' });

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'A member with this email already exists' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates a member-service 409 and stores no user', async () => {
    stubMemberService({
      ok: false,
      status: 409,
      body: { error: 'A member with this email already exists' },
    });

    const res = await request(app).post('/auth/register').set(serviceKey).send(validBody);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'A member with this email already exists' });
    expect(userRepository.findByEmail('grace@example.com')).toBeUndefined();

    const login = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: 'grace@example.com', password: validBody.password });

    expect(login.status).toBe(401);
    expect(login.body).toEqual({ error: 'Invalid credentials' });
  });

  it('propagates any other member-service error status verbatim', async () => {
    stubMemberService({ ok: false, status: 422, body: { error: 'member-service said no' } });

    const res = await request(app).post('/auth/register').set(serviceKey).send(validBody);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'member-service said no' });
    expect(userRepository.findByEmail('grace@example.com')).toBeUndefined();
  });

  it('returns 502 when member-service is unreachable and stores no user', async () => {
    stubUnreachableMemberService();

    const res = await request(app).post('/auth/register').set(serviceKey).send(validBody);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Unable to reach member-service' });
    expect(userRepository.findByEmail('grace@example.com')).toBeUndefined();
  });
});
