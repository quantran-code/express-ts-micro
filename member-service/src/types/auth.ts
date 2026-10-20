export type UserRole = 'librarian' | 'member';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  memberId?: number;
}
