import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app';
import { memberRepository } from '../src/members/memberRepository';
import type { Member } from '../src/members/types';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

const librarian = { ...serviceKey, 'x-user-id': '10', 'x-user-role': 'librarian' };
const memberOne = {
  ...serviceKey,
  'x-user-id': '20',
  'x-user-role': 'member',
  'x-user-member-id': '1',
};
const memberTwo = {
  ...serviceKey,
  'x-user-id': '21',
  'x-user-role': 'member',
  'x-user-member-id': '2',
};

const adaSeed = { name: 'Ada Lovelace', email: 'ada@example.com' };
const graceSeed = { name: 'Grace Hopper', email: 'grace@example.com' };

interface LoanServiceHandlers {
  activeCount?: () => Promise<unknown>;
  activeLoans?: () => Promise<unknown>;
}

function stubLoanService(handlers: LoanServiceHandlers = {}) {
  const readActiveCount = handlers.activeCount ?? (() => Promise.resolve({ count: 0 }));
  const readActiveLoans = handlers.activeLoans ?? (() => Promise.resolve([]));

  const fetchMock = vi.fn(async (url: string) => {
    const body = url.includes('/internal/loans/active-count')
      ? await readActiveCount()
      : await readActiveLoans();

    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function stubUnreachableLoanService() {
  const fetchMock = vi.fn(() => Promise.reject(new Error('loan-service is down')));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function stubFailingLoanService() {
  const fetchMock = vi.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Internal Server Error' }),
  }));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('public member routes', () => {
  beforeEach(() => {
    memberRepository.reset();
    memberRepository.create(adaSeed);
    memberRepository.create(graceSeed);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every member for a librarian', async () => {
    const res = await request(app).get('/members').set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: true },
      { id: 2, name: 'Grace Hopper', email: 'grace@example.com', active: true },
    ]);
  });

  it('forbids listing members for a member caller', async () => {
    const res = await request(app).get('/members').set(memberOne);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('gets a member by id', async () => {
    const res = await request(app).get('/members/2').set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 2,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      active: true,
    });
  });

  it('returns 404 for an unknown member id', async () => {
    const res = await request(app).get('/members/999').set(librarian);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
  });

  it('patches only the supplied field', async () => {
    const res = await request(app)
      .patch('/members/1')
      .set(librarian)
      .send({ name: 'Ada King' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, name: 'Ada King', email: 'ada@example.com', active: true });
  });

  it('normalises a patched email to lowercase', async () => {
    const res = await request(app)
      .patch('/members/1')
      .set(librarian)
      .send({ email: 'Ada.King@Example.COM' });

    expect(res.status).toBe(200);
    expect((res.body as Member).email).toBe('ada.king@example.com');
  });

  it('rejects an email taken by another member in a different case', async () => {
    const res = await request(app)
      .patch('/members/1')
      .set(librarian)
      .send({ email: 'GRACE@Example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'A member with this email already exists' });

    const stored = await request(app).get('/members').set(librarian);
    expect(stored.body).toEqual([
      { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: true },
      { id: 2, name: 'Grace Hopper', email: 'grace@example.com', active: true },
    ]);
  });

  it('accepts a member keeping its own email', async () => {
    const res = await request(app)
      .patch('/members/1')
      .set(librarian)
      .send({ email: 'ADA@example.com' });

    expect(res.status).toBe(200);
    expect((res.body as Member).email).toBe('ada@example.com');
  });

  it('rejects an invalid email on patch', async () => {
    const res = await request(app)
      .patch('/members/1')
      .set(librarian)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);

    const stored = await request(app).get('/members/1').set(librarian);
    expect(stored.body).toEqual({
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      active: true,
    });
  });

  it('returns the unchanged member for an empty patch', async () => {
    const res = await request(app).patch('/members/1').set(librarian).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      active: true,
    });
  });

  it('ignores unknown keys in a patch', async () => {
    const res = await request(app).patch('/members/1').set(librarian).send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      active: true,
    });
  });

  it('rejects an empty or whitespace-only name on patch', async () => {
    const empty = await request(app).patch('/members/1').set(librarian).send({ name: '' });
    const blank = await request(app).patch('/members/1').set(librarian).send({ name: '   ' });

    expect(empty.status).toBe(400);
    expect(blank.status).toBe(400);

    const stored = await request(app).get('/members/1').set(librarian);
    expect(stored.body).toEqual({
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      active: true,
    });
  });

  it('returns 404 when patching an unknown member id', async () => {
    const res = await request(app).patch('/members/999').set(librarian).send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
  });

  it('refuses to delete a member with active loans', async () => {
    stubLoanService({ activeCount: () => Promise.resolve({ count: 2 }) });

    const res = await request(app).delete('/members/1').set(librarian);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Cannot delete a member with active loans' });

    const list = await request(app).get('/members').set(librarian);
    expect(list.body).toHaveLength(2);

    const stored = await request(app).get('/members/1').set(librarian);
    expect(stored.status).toBe(200);
  });

  it('deletes a member with no active loans and returns 204', async () => {
    const fetchMock = stubLoanService({ activeCount: () => Promise.resolve({ count: 0 }) });

    const res = await request(app).delete('/members/1').set(librarian);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/loans/active-count?memberId=1');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'x-service-key': config.serviceKey },
    });

    const stored = await request(app).get('/members/1').set(librarian);
    expect(stored.status).toBe(404);
  });

  it('returns 404 on delete of an unknown id without calling loan-service', async () => {
    const fetchMock = stubLoanService();

    const res = await request(app).delete('/members/999').set(librarian);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 on delete when loan-service is unreachable', async () => {
    stubUnreachableLoanService();

    const res = await request(app).delete('/members/1').set(librarian);

    expect(res.status).toBe(502);

    const stored = await request(app).get('/members/1').set(librarian);
    expect(stored.status).toBe(200);
  });

  it('returns 502 on delete when loan-service answers with an error status', async () => {
    stubFailingLoanService();

    const res = await request(app).delete('/members/1').set(librarian);

    expect(res.status).toBe(502);

    const stored = await request(app).get('/members/1').set(librarian);
    expect(stored.status).toBe(200);
  });

  it('forbids deleting another member as a member caller without calling loan-service', async () => {
    const fetchMock = stubLoanService();

    const res = await request(app).delete('/members/2').set(memberOne);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a member own active loans without any dueDate field', async () => {
    const fetchMock = stubLoanService({
      activeLoans: () =>
        Promise.resolve([
          {
            id: 7,
            memberId: 1,
            bookId: 3,
            status: 'active',
            dueDate: '2025-01-15T00:00:00.000Z',
          },
        ]),
    });

    const res = await request(app).get('/members/1/loans').set(memberOne);

    expect(res.status).toBe(200);

    const loans = res.body as Record<string, unknown>[];
    expect(Array.isArray(loans)).toBe(true);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toEqual({ id: 7, memberId: 1, bookId: 3, status: 'active' });
    expect(Object.keys(loans[0])).not.toContain('dueDate');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/internal/loans?memberId=1&status=active',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'x-service-key': config.serviceKey },
    });
  });

  it('lets a librarian read another member loans', async () => {
    stubLoanService({ activeLoans: () => Promise.resolve([]) });

    const res = await request(app).get('/members/2/loans').set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lets a member read their own loans', async () => {
    stubLoanService({ activeLoans: () => Promise.resolve([]) });

    const res = await request(app).get('/members/2/loans').set(memberTwo);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('forbids reading another member loans as a member caller without calling loan-service', async () => {
    const fetchMock = stubLoanService({ activeLoans: () => Promise.resolve([]) });

    const res = await request(app).get('/members/2/loans').set(memberOne);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for loans of an unknown member without calling loan-service', async () => {
    const fetchMock = stubLoanService({ activeLoans: () => Promise.resolve([]) });

    const res = await request(app).get('/members/999/loans').set(librarian);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Member not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when loan-service is unreachable while reading loans', async () => {
    stubUnreachableLoanService();

    const res = await request(app).get('/members/1/loans').set(librarian);

    expect(res.status).toBe(502);
  });
});
