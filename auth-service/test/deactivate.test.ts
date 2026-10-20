import request from 'supertest';
import { hashSync } from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app';
import { userRepository } from '../src/users/userRepository';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

const librarianCaller = { ...serviceKey, 'x-user-role': 'librarian' };
const memberCaller = { ...serviceKey, 'x-user-role': 'member' };

const memberPassword = 'Member123!';
const memberPasswordHash = hashSync(memberPassword, 10);

function seedMemberUser() {
  return userRepository.create({
    memberId: 5,
    email: 'grace@example.com',
    passwordHash: memberPasswordHash,
    role: 'member',
  });
}

interface StubResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

const deactivatedMember = { id: 5, name: 'Grace Hopper', email: 'grace@example.com', active: false };

function stubMemberService(response: StubResponse = { ok: true, status: 200, body: deactivatedMember }) {
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

describe('POST /auth/members/:id/deactivate', () => {
  beforeEach(() => {
    userRepository.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deactivates the member locally and in member-service', async () => {
    const user = seedMemberUser();
    const { calls } = stubMemberService();

    const res = await request(app).post('/auth/members/5/deactivate').set(librarianCaller);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.id,
      memberId: 5,
      email: 'grace@example.com',
      role: 'member',
      active: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${config.memberServiceUrl}/internal/members/5/active`);
    expect(calls[0].init).toMatchObject({
      method: 'PATCH',
      headers: { 'x-service-key': config.serviceKey },
    });
    expect(readSentBody(calls[0])).toEqual({ active: false });

    expect(userRepository.findByMemberId(5)?.active).toBe(false);
  });

  it('blocks a deactivated user from logging in afterwards', async () => {
    seedMemberUser();
    stubMemberService();

    const deactivated = await request(app).post('/auth/members/5/deactivate').set(librarianCaller);
    expect(deactivated.status).toBe(200);

    const login = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: 'grace@example.com', password: memberPassword });

    expect(login.status).toBe(401);
    expect(login.body).toEqual({ error: 'Account is deactivated' });
    expect(login.body).not.toHaveProperty('accessToken');
  });

  it('forbids a caller with no forwarded role and calls member-service zero times', async () => {
    seedMemberUser();
    const { fetchMock } = stubMemberService();

    const res = await request(app).post('/auth/members/5/deactivate').set(serviceKey);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Only a librarian can deactivate an account' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(userRepository.findByMemberId(5)?.active).toBe(true);
  });

  it('forbids a member caller and calls member-service zero times', async () => {
    seedMemberUser();
    const { fetchMock } = stubMemberService();

    const res = await request(app).post('/auth/members/5/deactivate').set(memberCaller);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Only a librarian can deactivate an account' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(userRepository.findByMemberId(5)?.active).toBe(true);
  });

  it('returns 404 for a memberId with no local user and does not call member-service', async () => {
    const { fetchMock } = stubMemberService();

    const res = await request(app).post('/auth/members/999/deactivate').set(librarianCaller);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a member-service 404 and keeps the local user active', async () => {
    seedMemberUser();
    stubMemberService({ ok: false, status: 404, body: { error: 'Member not found' } });

    const res = await request(app).post('/auth/members/5/deactivate').set(librarianCaller);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
    expect(userRepository.findByMemberId(5)?.active).toBe(true);
  });

  it('returns 502 when member-service is unreachable and keeps the local user active', async () => {
    seedMemberUser();
    stubUnreachableMemberService();

    const res = await request(app).post('/auth/members/5/deactivate').set(librarianCaller);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Unable to reach member-service' });
    expect(userRepository.findByMemberId(5)?.active).toBe(true);
  });

  it('treats a non-numeric memberId as an unknown member', async () => {
    const { fetchMock } = stubMemberService();

    const res = await request(app).post('/auth/members/abc/deactivate').set(librarianCaller);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
