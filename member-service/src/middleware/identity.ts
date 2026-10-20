import { RequestHandler } from 'express';
import { HttpError } from '../errors/httpError';
import { AuthenticatedUser, UserRole } from '../types/auth';

export const isUserRole = (value: string): value is UserRole =>
  value === 'librarian' || value === 'member';

function readMemberId(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

export const requireIdentity: RequestHandler = (req, res, next) => {
  const id = req.header('x-user-id');
  const role = req.header('x-user-role');

  if (!id || !role || !isUserRole(role)) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  const memberId = readMemberId(req.header('x-user-member-id'));

  if (role === 'member' && memberId === undefined) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  const user: AuthenticatedUser = { id, role, memberId };
  req.user = user;

  next();
};

export function canAccessMember(user: AuthenticatedUser, targetMemberId: number): boolean {
  if (user.role === 'librarian') {
    return true;
  }

  return user.memberId === targetMemberId;
}
