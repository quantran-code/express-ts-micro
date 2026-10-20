import { hashSync } from 'bcrypt';
import { normalizeEmail } from '../auth/email';
import type { CreateUserInput, User } from './types';

export const SEEDED_LIBRARIAN_EMAIL = 'librarian@library.test';
export const SEEDED_LIBRARIAN_PASSWORD = 'Librarian123!';
export const SEEDED_LIBRARIAN_MEMBER_ID = 0;

const BCRYPT_ROUNDS = 10;

export class UserRepository {
  private users: User[] = [];

  private nextId: number = 1;

  constructor() {
    this.seedLibrarian();
  }

  list(): User[] {
    return this.users.slice();
  }

  findById(id: number): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  findByEmail(email: string): User | undefined {
    const needle = normalizeEmail(email);

    return this.users.find((user) => user.email === needle);
  }

  findByMemberId(memberId: number): User | undefined {
    return this.users.find((user) => user.memberId === memberId);
  }

  create(input: CreateUserInput): User {
    const user: User = {
      id: this.nextId,
      memberId: input.memberId,
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      role: input.role,
      active: true,
    };

    this.nextId += 1;
    this.users.push(user);

    return user;
  }

  setActive(id: number, active: boolean): User | undefined {
    const user = this.findById(id);

    if (!user) {
      return undefined;
    }

    user.active = active;

    return user;
  }

  reset(): void {
    this.users = [];
    this.nextId = 1;
    this.seedLibrarian();
  }

  private seedLibrarian(): void {
    this.create({
      memberId: SEEDED_LIBRARIAN_MEMBER_ID,
      email: SEEDED_LIBRARIAN_EMAIL,
      passwordHash: hashSync(SEEDED_LIBRARIAN_PASSWORD, BCRYPT_ROUNDS),
      role: 'librarian',
    });
  }
}

export const userRepository = new UserRepository();
