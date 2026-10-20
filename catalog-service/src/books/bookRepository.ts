import { Book, CreateBookInput, SearchResult, UpdateBookInput } from './types';

export class BookRepository {
  private books: Book[] = [];

  private nextId: number = 1;

  list(): Book[] {
    return this.books.slice();
  }

  findById(id: number): Book | undefined {
    return this.books.find((book) => book.id === id);
  }

  findByIsbn(isbn: string, excludeId?: number): Book | undefined {
    return this.books.find((book) => book.isbn === isbn && book.id !== excludeId);
  }

  create(input: CreateBookInput): Book {
    const book: Book = {
      id: this.nextId,
      title: input.title,
      author: input.author,
      isbn: input.isbn,
      totalCopies: input.totalCopies,
      availableCopies: input.totalCopies,
    };

    this.nextId += 1;
    this.books.push(book);

    return book;
  }

  update(id: number, input: UpdateBookInput): Book | undefined {
    const book = this.findById(id);

    if (!book) {
      return undefined;
    }

    if (input.title !== undefined) {
      book.title = input.title;
    }

    if (input.author !== undefined) {
      book.author = input.author;
    }

    if (input.isbn !== undefined) {
      book.isbn = input.isbn;
    }

    if (input.totalCopies !== undefined) {
      book.totalCopies = input.totalCopies;
    }

    if (input.availableCopies !== undefined) {
      book.availableCopies = input.availableCopies;
    }

    return book;
  }

  delete(id: number): boolean {
    const index = this.books.findIndex((book) => book.id === id);

    if (index === -1) {
      return false;
    }

    this.books.splice(index, 1);

    return true;
  }

  // The caller is responsible for checking that a copy is available first.
  borrow(id: number): Book | undefined {
    const book = this.findById(id);

    if (!book) {
      return undefined;
    }

    book.availableCopies -= 1;

    return book;
  }

  returnCopy(id: number): Book | undefined {
    const book = this.findById(id);

    if (!book) {
      return undefined;
    }

    book.availableCopies = Math.min(book.availableCopies + 1, book.totalCopies);

    return book;
  }

  search(q: string, page: number, pageSize: number): SearchResult {
    const needle = q.trim().toLowerCase();

    const matches =
      needle === ''
        ? this.books
        : this.books.filter(
            (book) =>
              book.title.toLowerCase().includes(needle) ||
              book.author.toLowerCase().includes(needle),
          );

    const start = (page - 1) * pageSize;

    return {
      data: matches.slice(start, start + pageSize),
      total: matches.length,
    };
  }

  reset(): void {
    this.books = [];
    this.nextId = 1;
  }
}

export const bookRepository = new BookRepository();
