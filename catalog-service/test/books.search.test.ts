import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { bookRepository } from '../src/books/bookRepository';
import type { Book, CreateBookInput, SearchResult } from '../src/books/types';
import { config } from '../src/config';

const librarian = {
  'x-service-key': config.serviceKey,
  'x-user-id': '1',
  'x-user-role': 'librarian',
};

const seeds: CreateBookInput[] = [
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', isbn: 'isbn-1', totalCopies: 2 },
  { title: 'Brave New World', author: 'Aldous Huxley', isbn: 'isbn-2', totalCopies: 1 },
  { title: 'The Gatsby Legacy', author: 'Jordan Baker', isbn: 'isbn-3', totalCopies: 1 },
  { title: 'Clean Code', author: 'Robert Martin', isbn: 'isbn-4', totalCopies: 1 },
];

for (let index = seeds.length + 1; index <= 12; index += 1) {
  seeds.push({
    title: `Filler Book ${index}`,
    author: `Filler Author ${index}`,
    isbn: `isbn-${index}`,
    totalCopies: 1,
  });
}

function seedBooks(): void {
  for (const seed of seeds) {
    bookRepository.create(seed);
  }
}

describe('book search and pagination', () => {
  beforeEach(() => {
    bookRepository.reset();
    seedBooks();
  });

  it('defaults to page 1 and pageSize 10', async () => {
    const res = await request(app).get('/books/search').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.total).toBe(12);
    expect(body.data).toHaveLength(10);
    expect(body.data.map((book: Book) => book.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('treats a missing q as match-all inside the page window', async () => {
    const res = await request(app).get('/books/search?page=2&pageSize=5').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.total).toBe(12);
    expect(body.data.map((book: Book) => book.id)).toEqual([6, 7, 8, 9, 10]);
  });

  it('treats an empty q as match-all still paginated', async () => {
    const res = await request(app).get('/books/search?q=&page=2&pageSize=5').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.total).toBe(12);
    expect(body.data).toHaveLength(5);
    expect(body.data.map((book: Book) => book.id)).toEqual([6, 7, 8, 9, 10]);
  });

  it('matches on title case-insensitively', async () => {
    const res = await request(app).get('/books/search?q=GATSBY').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.total).toBe(2);
    expect(body.data.map((book: Book) => book.id)).toEqual([1, 3]);
  });

  it('matches on author case-insensitively', async () => {
    const res = await request(app).get('/books/search?q=fitzgerald').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.total).toBe(1);
    expect(body.data[0].title).toBe('The Great Gatsby');
  });

  it('reports the full match count rather than the page size', async () => {
    const res = await request(app).get('/books/search?q=filler&page=1&pageSize=3').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.total).toBe(8);
    expect(body.data).toHaveLength(3);
  });

  it('accepts pageSize=100', async () => {
    const res = await request(app).get('/books/search?pageSize=100').set(librarian);

    expect(res.status).toBe(200);

    const body = res.body as SearchResult;
    expect(body.data).toHaveLength(12);
    expect(body.total).toBe(12);
  });

  const invalidQueries: [string, string][] = [
    ['page=0', '?page=0'],
    ['page=-1', '?page=-1'],
    ['page=1.5', '?page=1.5'],
    ['page=abc', '?page=abc'],
    ['pageSize=0', '?pageSize=0'],
    ['pageSize=101', '?pageSize=101'],
    ['pageSize=abc', '?pageSize=abc'],
  ];

  for (const [label, query] of invalidQueries) {
    it(`rejects ${label}`, async () => {
      const res = await request(app).get(`/books/search${query}`).set(librarian);

      expect(res.status).toBe(400);
    });
  }

  it('requires caller identity on search', async () => {
    const res = await request(app)
      .get('/books/search')
      .set({ 'x-service-key': config.serviceKey });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});
