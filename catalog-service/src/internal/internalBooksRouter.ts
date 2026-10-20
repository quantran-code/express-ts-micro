import { RequestHandler, Router } from 'express';
import { bookRepository } from '../books/bookRepository';
import { Book } from '../books/types';
import { HttpError } from '../errors/httpError';

const listBooks: RequestHandler<Record<string, never>, Book[]> = (req, res) => {
  res.status(200).json(bookRepository.list());
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

const borrowBook: RequestHandler<{ id: string }, Book> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const book = bookRepository.findById(id);

  if (!book) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  if (book.availableCopies === 0) {
    next(new HttpError(409, 'No copies available'));
    return;
  }

  const updated = bookRepository.borrow(id);

  if (!updated) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  res.status(200).json(updated);
};

const returnBook: RequestHandler<{ id: string }, Book> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const updated = bookRepository.returnCopy(id);

  if (!updated) {
    next(new HttpError(404, 'Book not found'));
    return;
  }

  res.status(200).json(updated);
};

export const internalBooksRouter = Router();

internalBooksRouter.get('/', listBooks);
internalBooksRouter.get('/:id', getBook);
internalBooksRouter.post('/:id/borrow', borrowBook);
internalBooksRouter.post('/:id/return', returnBook);

export default internalBooksRouter;
