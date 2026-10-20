import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { bookRepository } from '../src/books/bookRepository';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };
const librarianIdentity = { ...serviceKey, 'x-user-id': '1', 'x-user-role': 'librarian' };
const memberIdentity = { ...serviceKey, 'x-user-id': '2', 'x-user-role': 'member' };

const validBook = {
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  isbn: '9780743273565',
  totalCopies: 3,
};

describe('service gate and caller identity', () => {
  beforeEach(() => {
    bookRepository.reset();
  });

  it('serves /health without a service key', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'catalog-service' });
  });

  it('rejects /books without a service key', async () => {
    const res = await request(app).get('/books');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /books with a wrong service key', async () => {
    const res = await request(app).get('/books').set('x-service-key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an unknown path without a service key', async () => {
    const res = await request(app).get('/not-a-real-path');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /internal/books without a service key', async () => {
    const res = await request(app).get('/internal/books');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /books with a valid service key but no identity headers', async () => {
    const res = await request(app).get('/books').set(serviceKey);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /books with no x-user-id', async () => {
    const res = await request(app)
      .get('/books')
      .set({ ...serviceKey, 'x-user-role': 'librarian' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects /books with no x-user-role', async () => {
    const res = await request(app).get('/books').set({ ...serviceKey, 'x-user-id': '1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an x-user-role outside the allowed values', async () => {
    const res = await request(app)
      .get('/books')
      .set({ ...serviceKey, 'x-user-id': '1', 'x-user-role': 'admin' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('lets an identified member read the book list', async () => {
    const res = await request(app).get('/books').set(memberIdentity);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('forbids POST /books for a member and creates nothing', async () => {
    const res = await request(app).post('/books').set(memberIdentity).send(validBook);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const list = await request(app).get('/books').set(librarianIdentity);
    expect(list.body).toEqual([]);
  });

  it('forbids PATCH /books/:id for a member', async () => {
    const created = await request(app).post('/books').set(librarianIdentity).send(validBook);

    const res = await request(app)
      .patch(`/books/${created.body.id}`)
      .set(memberIdentity)
      .send({ title: 'Renamed' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('forbids DELETE /books/:id for a member', async () => {
    const created = await request(app).post('/books').set(librarianIdentity).send(validBook);

    const res = await request(app).delete(`/books/${created.body.id}`).set(memberIdentity);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('lets a librarian create a book, proving the forwarded role is used', async () => {
    const res = await request(app).post('/books').set(librarianIdentity).send(validBook);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.title).toBe(validBook.title);
  });
});
