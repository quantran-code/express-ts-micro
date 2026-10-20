import { RequestHandler, Router } from 'express';
import { HttpError } from '../errors/httpError';
import { isValidEmail } from '../members/email';
import { memberRepository } from '../members/memberRepository';
import { CreateMemberInput, Member } from '../members/types';

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

const createMember: RequestHandler<Record<string, never>, Member, CreateMemberInput> = (
  req,
  res,
  next,
) => {
  const input = parseCreateInput(req.body);

  if (memberRepository.findByEmail(input.email)) {
    next(new HttpError(409, 'A member with this email already exists'));
    return;
  }

  res.status(201).json(memberRepository.create(input));
};

const listMembersInternal: RequestHandler<Record<string, never>, Member[]> = (req, res) => {
  res.status(200).json(memberRepository.list());
};

const getMemberInternal: RequestHandler<{ id: string }, Member> = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const member = memberRepository.findById(id);

  if (!member) {
    next(new HttpError(404, 'Member not found'));
    return;
  }

  res.status(200).json(member);
};

export const internalMembersRouter = Router();

internalMembersRouter.post('/', createMember);
internalMembersRouter.get('/', listMembersInternal);
internalMembersRouter.get('/:id', getMemberInternal);

export default internalMembersRouter;
