export type UserRole = 'member' | 'librarian';

export interface User {
  id: number;
  memberId: number;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
}

export interface CreateUserInput {
  memberId: number;
  email: string;
  passwordHash: string;
  role: UserRole;
}
