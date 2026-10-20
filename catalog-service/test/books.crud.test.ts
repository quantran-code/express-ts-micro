import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { bookRepository } from '../src/books/bookRepository';
import type { Book } from '../src/books/types';
import { config } from '../src/config';

const serviceKey = { 'x-service-key': config.serviceKey };
const librarian = { ...serviceKey, 'x-user-id': '1', 'x-user-role': 'librarian' };
const member = { ...serviceKey, 'x-user-id': '2', 'x-user-role': 'member' };

const validBook = {
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  isbn: '9780743273565',
  totalCopies: 5,
};

async function createBook(overrides: Record<string, unknown> = {}): Promise<Book> {
  const res = await request(app)
    .post('/books')
    .set(librarian)
    .send({ ...validBook, ...overrides });

  expect(res.status).toBe(201);

  return res.body as Book;
}

async function borrowCopy(id: number): Promise<Book> {
  const res = await request(app).post(`/internal/books/${id}/borrow`).set(serviceKey);

  expect(res.status).toBe(200);

  return res.body as Book;
}

describe('public book CRUD', () => {
  beforeEach(() => {
    bookRepository.reset();
  });

  it('lists books as a plain array', async () => {
    const created = await createBook();

    const res = await request(app).get('/books').set(librarian);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect((res.body as Book[])[0]).toEqual(created);
  });

  it('creates a book with availableCopies equal to totalCopies', async () => {
    const res = await request(app).post('/books').set(librarian).send(validBook);

    expect(res.status).toBe(201);

    const book = res.body as Book;
    expect(typeof book.id).toBe('number');
    expect(book.id).toBe(1);
    expect(book).toEqual({
      id: 1,
      title: validBook.title,
      author: validBook.author,
      isbn: validBook.isbn,
      totalCopies: 5,
      availableCopies: 5,
    });
  });

  it('increments ids by one per created book', async () => {
    const first = await createBook();
    const second = await createBook({ isbn: '9780141439518' });

    expect(second.id).toBe(first.id + 1);
  });

  it('rejects a duplicate isbn with 409 and creates nothing', async () => {
    await createBook();

    const res = await request(app).post('/books').set(librarian).send(validBook);

    expect(res.status).toBe(409);

    const list = await request(app).get('/books').set(librarian);
    expect(list.body).toHaveLength(1);
  });

  const invalidCreateBodies: [string, Record<string, unknown>][] = [
    ['missing title', { title: undefined }],
    ['empty title', { title: '' }],
    ['whitespace-only title', { title: '   ' }],
    ['missing author', { author: undefined }],
    ['empty author', { author: '' }],
    ['whitespace-only author', { author: '   ' }],
    ['missing isbn', { isbn: undefined }],
    ['empty isbn', { isbn: '' }],
    ['whitespace-only isbn', { isbn: '   ' }],
    ['zero totalCopies', { totalCopies: 0 }],
    ['negative totalCopies', { totalCopies: -1 }],
    ['fractional totalCopies', { totalCopies: 1.5 }],
    ['string totalCopies', { totalCopies: '3' }],
    ['missing totalCopies', { totalCopies: undefined }],
  ];

  for (const [label, overrides] of invalidCreateBodies) {
    it(`rejects a create with ${label}`, async () => {
      const body: Record<string, unknown> = { ...validBook, ...overrides };

      for (const key of Object.keys(overrides)) {
        if (overrides[key] === undefined) {
          delete body[key];
        }
      }

      const res = await request(app).post('/books').set(librarian).send(body);

      expect(res.status).toBe(400);

      const list = await request(app).get('/books').set(librarian);
      expect(list.body).toEqual([]);
    });
  }

  it('gets a book by id', async () => {
    const created = await createBook();

    const res = await request(app).get(`/books/${created.id}`).set(librarian);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('returns 404 for an unknown id and for a non-numeric id', async () => {
    const unknown = await request(app).get('/books/999').set(librarian);
    const nonNumeric = await request(app).get('/books/abc').set(librarian);

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'Book not found' });
    expect(nonNumeric.status).toBe(404);
    expect(nonNumeric.body).toEqual({ error: 'Book not found' });
  });

  it('patches only the supplied fields', async () => {
    const created = await createBook();

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(librarian)
      .send({ title: 'Renamed Title' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, title: 'Renamed Title' });
  });

  it('accepts the book own isbn on patch and rejects another book isbn', async () => {
    const created = await createBook();
    const other = await createBook({ isbn: '9780141439518' });

    const selfIsbn = await request(app)
      .patch(`/books/${created.id}`)
      .set(librarian)
      .send({ isbn: created.isbn });

    expect(selfIsbn.status).toBe(200);
    expect((selfIsbn.body as Book).isbn).toBe(created.isbn);

    const clash = await request(app)
      .patch(`/books/${created.id}`)
      .set(librarian)
      .send({ isbn: other.isbn });

    expect(clash.status).toBe(409);
  });

  it('keeps copies on loan constant when totalCopies changes', async () => {
    const created = await createBook();

    await borrowCopy(created.id);
    const afterBorrows = await borrowCopy(created.id);
    expect(afterBorrows.availableCopies).toBe(3);

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(librarian)
      .send({ totalCopies: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, totalCopies: 4, availableCopies: 2 });
  });

  it('rejects a totalCopies reduction below the copies on loan and leaves the book untouched', async () => {
    const created = await createBook();

    await borrowCopy(created.id);
    await borrowCopy(created.id);

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(librarian)
      .send({ totalCopies: 1 });

    expect(res.status).toBe(409);

    const stored = await request(app).get(`/books/${created.id}`).set(librarian);
    expect(stored.body).toEqual({ ...created, availableCopies: 3 });
  });

  const invalidPatchBodies: [string, Record<string, unknown>][] = [
    ['empty title', { title: '' }],
    ['whitespace-only author', { author: '   ' }],
    ['empty isbn', { isbn: '' }],
    ['zero totalCopies', { totalCopies: 0 }],
    ['fractional totalCopies', { totalCopies: 2.5 }],
    ['string totalCopies', { totalCopies: '3' }],
  ];

  for (const [label, body] of invalidPatchBodies) {
    it(`rejects a patch with ${label}`, async () => {
      const created = await createBook();

      const res = await request(app).patch(`/books/${created.id}`).set(librarian).send(body);

      expect(res.status).toBe(400);

      const stored = await request(app).get(`/books/${created.id}`).set(librarian);
      expect(stored.body).toEqual(created);
    });
  }

  it('returns 404 when patching an unknown id', async () => {
    const res = await request(app).patch('/books/999').set(librarian).send({ title: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Book not found' });
  });

  it('refuses to delete a book with copies on loan', async () => {
    const created = await createBook();

    await borrowCopy(created.id);

    const res = await request(app).delete(`/books/${created.id}`).set(librarian);

    expect(res.status).toBe(409);

    const stored = await request(app).get(`/books/${created.id}`).set(librarian);
    expect(stored.status).toBe(200);
    expect((stored.body as Book).id).toBe(created.id);
  });

  it('deletes a book with no copies on loan and returns 204', async () => {
    const created = await createBook();

    const res = await request(app).delete(`/books/${created.id}`).set(librarian);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const stored = await request(app).get(`/books/${created.id}`).set(librarian);
    expect(stored.status).toBe(404);
  });

  it('returns 404 when deleting an unknown id', async () => {
    const res = await request(app).delete('/books/999').set(librarian);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Book not found' });
  });

  it('forbids write routes for a member', async () => {
    const created = await createBook();

    const create = await request(app).post('/books').set(member).send(validBook);
    const patch = await request(app)
      .patch(`/books/${created.id}`)
      .set(member)
      .send({ title: 'Renamed' });
    const remove = await request(app).delete(`/books/${created.id}`).set(member);

    expect(create.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
  });
});
