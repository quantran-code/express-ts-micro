export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
}

export interface CreateBookInput {
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
}

export interface UpdateBookInput {
  title?: string;
  author?: string;
  isbn?: string;
  totalCopies?: number;
  availableCopies?: number;
}

export interface SearchResult {
  data: Book[];
  total: number;
}
