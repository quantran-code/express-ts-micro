import express, { Request, Response, NextFunction } from 'express';
import { booksRouter } from './books/booksRouter';
import { HttpError } from './errors/httpError';
import { internalBooksRouter } from './internal/internalBooksRouter';
import { requireIdentity } from './middleware/identity';
import { requireServiceKey } from './middleware/serviceKey';

const app = express();

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'catalog-service' });
});

app.use(requireServiceKey);

app.use('/books', requireIdentity, booksRouter);
app.use('/internal/books', internalBooksRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

export default app;
