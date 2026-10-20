import { RequestHandler, Router } from 'express';
import { HttpError } from '../errors/httpError';
import { requireRole } from '../middleware/identity';
import { bookRepository } from './bookRepository';
import { Book, CreateBookInput, SearchResult, UpdateBookInput } from './types';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

interface SearchQuery {
  q?: string;
  page?: string;
  pageSize?: string;
}

function readPositiveInt(value: string | undefined, fallback: number, max?: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, 'page and pageSize must be integers greater than or equal to 1');
  }

  if (max !== undefined && parsed > max) {
    throw new HttpError(400, `pageSize must not exceed ${max}`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRequiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} must be a non-empty string`);
  }

  return value.trim();
}

function readPositiveCopies(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new HttpError(400, 'totalCopies must be a positive integer');
  }

  return value;
}

function parseCreateInput(body: unknown): CreateBookInput {
  if (!isRecord(body)) {
    throw new HttpError(400, 'title, author, isbn and totalCopies are required');
  }

  return {
    title: readRequiredString(body, 'title'),
    author: readRequiredString(body, 'author'),
    isbn: readRequiredString(body, 'isbn'),
    totalCopies: readPositiveCopies(body.totalCopies),
  };
}

function parseUpdateInput(body: unknown): UpdateBookInput {
  if (!isRecord(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }

  const input: UpdateBookInput = {};

  if (body.title !== undefined) {
    input.title = readRequiredString(body, 'title');
  }

  if (body.author !== undefined) {
    input.author = readRequiredString(body, 'author');
  }

  if (body.isbn !== undefined) {
    input.isbn = readRequiredString(body, 'isbn');
  }

  if (body.totalCopies !== undefined) {
    input.totalCopies = readPositiveCopies(body.totalCopies);
  }

  return input;
}

const listBooks: RequestHandler<Record<string, never>, Book[]> = (req, res) => {
  res.status(200).json(bookRepository.list());
};

const searchBooks: RequestHandler<Record<string, never>, SearchResult, unknown, SearchQuery> = (
  req,
  res,
) => {
  const page = readPositiveInt(req.query.page, DEFAULT_PAGE);
  const pageSize = readPositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  res.status(200).json(bookRepository.search(req.query.q ?? '', page, pageSize));
};

const getBook: RequestHandler<{ id: string }, Book> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const book = bookRepository.findById(id);

  if (!book) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  res.status(200).json(book);
};

const createBook: RequestHandler<Record<string, never>, Book, CreateBookInput> = (req, res, next) => {
  const input = parseCreateInput(req.body);

  if (bookRepository.findByIsbn(input.isbn)) {
    next(new HttpError(409, 'A book with this isbn already exists'));
    return;
  }

  res.status(201).json(bookRepository.create(input));
};

const updateBook: RequestHandler<{ id: string }, Book, UpdateBookInput> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const book = bookRepository.findById(id);

  if (!book) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  const input = parseUpdateInput(req.body);

  if (input.isbn !== undefined && bookRepository.findByIsbn(input.isbn, book.id)) {
    next(new HttpError(409, 'A book with this isbn already exists'));
    return;
  }

  if (input.totalCopies !== undefined) {
    const copiesOnLoan = book.totalCopies - book.availableCopies;
    const newAvailableCopies = input.totalCopies - copiesOnLoan;

    if (newAvailableCopies < 0) {
      next(new HttpError(409, 'totalCopies cannot be lower than the number of copies on loan'));
      return;
    }

    input.availableCopies = newAvailableCopies;
  }

  const updated = bookRepository.update(id, input);

  if (!updated) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  res.status(200).json(updated);
};

const deleteBook: RequestHandler<{ id: string }, void> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const book = bookRepository.findById(id);

  if (!book) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  if (book.totalCopies - book.availableCopies > 0) {
    next(new HttpError(409, 'Copies of this book are currently on loan'));
    return;
  }

  bookRepository.delete(id);
  res.status(204).send();
};

export const booksRouter = Router();

booksRouter.get('/', listBooks);
booksRouter.get('/search', searchBooks);
booksRouter.get('/:id', getBook);
booksRouter.post('/', requireRole('librarian'), createBook);
booksRouter.patch('/:id', requireRole('librarian'), updateBook);
booksRouter.delete('/:id', requireRole('librarian'), deleteBook);

export default booksRouter;
