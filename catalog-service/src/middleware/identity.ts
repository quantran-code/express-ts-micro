import { RequestHandler } from 'express';
import { HttpError } from '../errors/httpError';
import { AuthenticatedUser, UserRole } from '../types/auth';

const isUserRole = (value: string): value is UserRole =>
  value === 'librarian' || value === 'member';

export const requireIdentity: RequestHandler = (req, res, next) => {
  const id = req.header('x-user-id');
  const role = req.header('x-user-role');

  if (!id || !role || !isUserRole(role)) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  const user: AuthenticatedUser = { id, role };
  req.user = user;

  next();
};

export function requireRole(role: UserRole): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Unauthorized'));
      return;
    }

    if (req.user.role !== role) {
      next(new HttpError(403, 'Forbidden'));
      return;
    }

    next();
  };
}
