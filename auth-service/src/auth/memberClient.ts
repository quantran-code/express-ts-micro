import { config } from '../config';
import { HttpError } from '../errors/httpError';

export interface MemberRecord {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorMessage(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.error === 'string' && body.error !== '') {
    return body.error;
  }

  return undefined;
}

function parseMemberRecord(body: unknown): MemberRecord {
  if (
    !isRecord(body) ||
    typeof body.id !== 'number' ||
    typeof body.name !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.active !== 'boolean'
  ) {
    throw new HttpError(502, 'Invalid response from member-service');
  }

  return {
    id: body.id,
    name: body.name,
    email: body.email,
    active: body.active,
  };
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new HttpError(502, 'Unable to reach member-service');
  }

  if (!response.ok) {
    let errorBody: unknown;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = undefined;
    }

    throw new HttpError(
      response.status,
      readErrorMessage(errorBody) ?? 'member-service rejected the request',
    );
  }

  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'Invalid response from member-service');
  }
}

export async function createMember(input: { name: string; email: string }): Promise<MemberRecord> {
  const url = `${config.memberServiceUrl}/internal/members`;
  const body = await requestJson(url, {
    method: 'POST',
    headers: {
      'x-service-key': config.serviceKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ name: input.name, email: input.email }),
  });

  return parseMemberRecord(body);
}

export async function setMemberActive(memberId: number, active: boolean): Promise<MemberRecord> {
  const url = `${config.memberServiceUrl}/internal/members/${memberId}/active`;
  const body = await requestJson(url, {
    method: 'PATCH',
    headers: {
      'x-service-key': config.serviceKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ active }),
  });

  return parseMemberRecord(body);
}
