import { RequestHandler, Router } from 'express';
import { HttpError } from '../errors/httpError';
import { canAccessMember } from '../middleware/identity';
import { isValidEmail } from './email';
import { getActiveLoanCount, getActiveLoans, PublicLoan } from './loanClient';
import { memberRepository } from './memberRepository';
import { CreateMemberInput, Member, UpdateMemberInput } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRequiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} must be a non-empty string`);
  }

  return value.trim();
}

function readEmail(value: unknown): string {
  if (typeof value !== 'string' || !isValidEmail(value)) {
    throw new HttpError(400, 'email must be a valid email address');
  }

  return value.trim();
}

function parseCreateInput(body: unknown): CreateMemberInput {
  if (!isRecord(body)) {
    throw new HttpError(400, 'name and email are required');
  }

  return {
    name: readRequiredString(body, 'name'),
    email: readEmail(body.email),
  };
}

function parseUpdateInput(body: unknown): UpdateMemberInput {
  if (!isRecord(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }

  const input: UpdateMemberInput = {};

  if (body.name !== undefined) {
    input.name = readRequiredString(body, 'name');
  }

  if (body.email !== undefined) {
    input.email = readEmail(body.email);
  }

  return input;
}

const listMembers: RequestHandler<Record<string, never>, Member[]> = (req, res, next) => {
  if (!req.user) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  if (req.user.role !== 'librarian') {
    next(new HttpError(403, 'Forbidden'));
    return;
  }

  res.status(200).json(memberRepository.list());
};

const getMember: RequestHandler<{ id: string }, Member> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const member = memberRepository.findById(id);

  if (!member) {
    next(new HttpError(404, 'Member not found'));
    return;
  }

  if (!req.user) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  if (!canAccessMember(req.user, member.id)) {
    next(new HttpError(403, 'Forbidden'));
    return;
  }

  res.status(200).json(member);
};

const updateMemberHandler: RequestHandler<{ id: string }, Member, UpdateMemberInput> = (
  req,
  res,
  next,
) => {
  const id = Number.parseInt(req.params.id, 10);
  const member = memberRepository.findById(id);

  if (!member) {
    next(new HttpError(404, 'Member not found'));
    return;
  }

  if (!req.user) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  if (!canAccessMember(req.user, member.id)) {
    next(new HttpError(403, 'Forbidden'));
    return;
  }

  const input = parseUpdateInput(req.body);

  if (input.email !== undefined && memberRepository.findByEmail(input.email, member.id)) {
    next(new HttpError(409, 'A member with this email already exists'));
    return;
  }

  const updated = memberRepository.update(id, input);

  if (!updated) {
    next(new HttpError(404, 'Member not found'));
    return;
  }

  res.status(200).json(updated);
};

const deleteMember: RequestHandler<{ id: string }, void> = async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const member = memberRepository.findById(id);

  if (!member) {
    next(new HttpError(404, 'Member not found'));
    return;
  }

  if (!req.user) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  if (!canAccessMember(req.user, member.id)) {
    next(new HttpError(403, 'Forbidden'));
    return;
  }

  try {
    const activeLoanCount = await getActiveLoanCount(member.id);

    if (activeLoanCount > 0) {
      next(new HttpError(409, 'Cannot delete a member with active loans'));
      return;
    }
  } catch (error) {
    next(error);
    return;
  }

  memberRepository.delete(member.id);
  res.status(204).send();
};

const getMemberLoans: RequestHandler<{ id: string }, PublicLoan[]> = async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const member = memberRepository.findById(id);

  if (!member) {
    next(new HttpError(404, 'Member not found'));
    return;
  }

  if (!req.user) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }

  if (!canAccessMember(req.user, member.id)) {
    next(new HttpError(403, 'Forbidden'));
    return;
  }

  try {
    const loans = await getActiveLoans(member.id);
    res.status(200).json(loans);
  } catch (error) {
    next(error);
  }
};

export const membersRouter = Router();

membersRouter.get('/', listMembers);
membersRouter.get('/:id/loans', getMemberLoans);
membersRouter.get('/:id', getMember);
membersRouter.patch('/:id', updateMemberHandler);
membersRouter.delete('/:id', deleteMember);

export default membersRouter;
