import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { bookRepository } from '../src/books/bookRepository';
import type { Book, CreateBookInput } from '../src/books/types';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };

const seed: CreateBookInput = {
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  isbn: '9780743273565',
  totalCopies: 2,
};

async function borrow(id: number) {
  return request(app).post(`/internal/books/${id}/borrow`).set(serviceKey);
}

async function returnBook(id: number) {
  return request(app).post(`/internal/books/${id}/return`).set(serviceKey);
}

describe('internal book routes', () => {
  beforeEach(() => {
    bookRepository.reset();
  });

  it('lists books with the service key alone', async () => {
    const created = bookRepository.create(seed);

    const res = await request(app).get('/internal/books').set(serviceKey);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([created]);
  });

  it('rejects internal routes without a service key', async () => {
    const res = await request(app).get('/internal/books');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects internal routes with a wrong service key', async () => {
    const res = await request(app).get('/internal/books').set('x-service-key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('gets a single book by id', async () => {
    const created = bookRepository.create(seed);

    const res = await request(app).get(`/internal/books/${created.id}`).set(serviceKey);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('returns 404 for an unknown book id', async () => {
    const res = await request(app).get('/internal/books/999').set(serviceKey);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Book not found' });
  });

  it('decrements availableCopies on borrow', async () => {
    const created = bookRepository.create(seed);

    const res = await borrow(created.id);

    expect(res.status).toBe(200);
    expect((res.body as Book).availableCopies).toBe(created.totalCopies - 1);
  });

  it('refuses a borrow when no copies are available and leaves the count at zero', async () => {
    const created = bookRepository.create({ ...seed, totalCopies: 1 });

    const first = await borrow(created.id);
    expect(first.status).toBe(200);
    expect((first.body as Book).availableCopies).toBe(0);

    const second = await borrow(created.id);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'No copies available' });

    const stored = await request(app).get(`/internal/books/${created.id}`).set(serviceKey);
    expect((stored.body as Book).availableCopies).toBe(0);
  });

  it('increments availableCopies on return', async () => {
    const created = bookRepository.create(seed);

    await borrow(created.id);

    const res = await returnBook(created.id);

    expect(res.status).toBe(200);
    expect((res.body as Book).availableCopies).toBe(created.totalCopies);
  });

  it('caps availableCopies at totalCopies on return', async () => {
    const created = bookRepository.create(seed);

    const res = await returnBook(created.id);

    expect(res.status).toBe(200);
    expect((res.body as Book).availableCopies).toBe(created.totalCopies);

    const again = await returnBook(created.id);

    expect(again.status).toBe(200);
    expect((again.body as Book).availableCopies).toBe(created.totalCopies);
  });

  it('returns 404 when borrowing or returning an unknown book', async () => {
    const borrowed = await borrow(999);
    const returned = await returnBook(999);

    expect(borrowed.status).toBe(404);
    expect(borrowed.body).toEqual({ error: 'Book not found' });
    expect(returned.status).toBe(404);
    expect(returned.body).toEqual({ error: 'Book not found' });
  });
});
