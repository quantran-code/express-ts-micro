import { RequestHandler, Router } from 'express';
import { compare, hash, hashSync } from 'bcrypt';
import { HttpError } from '../errors/httpError';
import { userRepository } from '../users/userRepository';
import type { User, UserRole } from '../users/types';
import { isValidEmail, normalizeEmail } from './email';
import { signAccessToken, TOKEN_TYPE } from './jwt';
import { createMember, setMemberActive } from './memberClient';

const BCRYPT_ROUNDS = 10;

export const DUMMY_PASSWORD_HASH = hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export interface RegisterBody {
  name: unknown;
  email: unknown;
  password: unknown;
  role?: unknown;
}

export interface RegisterResponse {
  id: number;
  memberId: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  role: UserRole;
}

export interface DeactivatedUserResponse {
  id: number;
  memberId: number;
  email: string;
  role: UserRole;
  active: boolean;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface LoginInput {
  email: string;
  password: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRole(value: unknown): UserRole {
  if (value === undefined) {
    return 'member';
  }

  if (value === 'member' || value === 'librarian') {
    return value;
  }

  throw new HttpError(400, 'role must be either member or librarian');
}

function parseRegisterInput(body: unknown): RegisterInput {
  if (!isRecord(body)) {
    throw new HttpError(400, 'name, email and password are required');
  }

  const name = body.name;

  if (typeof name !== 'string' || name.trim() === '') {
    throw new HttpError(400, 'name must be a non-empty string');
  }

  const email = body.email;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    throw new HttpError(400, 'email must be a valid email address');
  }

  const password = body.password;

  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'password must be at least 8 characters long');
  }

  return {
    name: name.trim(),
    email: normalizeEmail(email),
    password,
    role: parseRole(body.role),
  };
}

function parseLoginInput(body: unknown): LoginInput {
  if (!isRecord(body)) {
    return { email: '', password: '' };
  }

  return {
    email: typeof body.email === 'string' ? normalizeEmail(body.email) : '',
    password: typeof body.password === 'string' ? body.password : '',
  };
}

function toLoginResponse(user: User): LoginResponse {
  return {
    accessToken: signAccessToken(user),
    tokenType: TOKEN_TYPE,
    role: user.role,
  };
}

const registerUser: RequestHandler<Record<string, never>, RegisterResponse, RegisterBody> = async (
  req,
  res,
  next,
) => {
  try {
    const input = parseRegisterInput(req.body);

    if (input.role === 'librarian' && req.header('x-user-role') !== 'librarian') {
      next(new HttpError(403, 'Only a librarian can create a librarian account'));
      return;
    }

    if (userRepository.findByEmail(input.email)) {
      next(new HttpError(409, 'A member with this email already exists'));
      return;
    }

    const member = await createMember({ name: input.name, email: input.email });
    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    const user = userRepository.create({
      memberId: member.id,
      email: input.email,
      passwordHash,
      role: input.role,
    });

    res.status(201).json({
      id: user.id,
      memberId: user.memberId,
      name: input.name,
      email: user.email,
      role: user.role,
      active: user.active,
    });
  } catch (error) {
    next(error);
  }
};

const login: RequestHandler<Record<string, never>, LoginResponse, LoginBody> = async (
  req,
  res,
  next,
) => {
  try {
    const input = parseLoginInput(req.body);
    const user = userRepository.findByEmail(input.email);
    const passwordHash = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
    const passwordMatches = await compare(input.password, passwordHash);

    if (!user || !passwordMatches) {
      next(new HttpError(401, 'Invalid credentials'));
      return;
    }

    if (!user.active) {
      next(new HttpError(401, 'Account is deactivated'));
      return;
    }

    res.status(200).json(toLoginResponse(user));
  } catch (error) {
    next(error);
  }
};

const deactivateMember: RequestHandler<{ id: string }, DeactivatedUserResponse> = async (
  req,
  res,
  next,
) => {
  try {
    if (req.header('x-user-role') !== 'librarian') {
      next(new HttpError(403, 'Only a librarian can deactivate an account'));
      return;
    }

    const memberId = Number.parseInt(req.params.id, 10);
    const user = userRepository.findByMemberId(memberId);

    if (!user) {
      next(new HttpError(404, 'Member not found'));
      return;
    }

    await setMemberActive(memberId, false);
    const updated = userRepository.setActive(user.id, false);

    if (!updated) {
      next(new HttpError(404, 'Member not found'));
      return;
    }

    res.status(200).json({
      id: updated.id,
      memberId: updated.memberId,
      email: updated.email,
      role: updated.role,
      active: updated.active,
    });
  } catch (error) {
    next(error);
  }
};

export const authRouter = Router();

authRouter.post('/register', registerUser);
authRouter.post('/login', login);
authRouter.post('/members/:id/deactivate', deactivateMember);

export default authRouter;
