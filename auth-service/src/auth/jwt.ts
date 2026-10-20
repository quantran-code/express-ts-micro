import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import type { User, UserRole } from '../users/types';

export interface AccessTokenClaims {
  sub: number;
  role: UserRole;
  memberId: number;
  iat: number;
  exp: number;
}

export const TOKEN_TYPE = 'Bearer';

const TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' };

const isUserRole = (value: unknown): value is UserRole =>
  value === 'librarian' || value === 'member';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signSegment(data: string): string {
  return createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed access token');
  }
}

function readClaims(payload: string): AccessTokenClaims {
  const decoded = decodeSegment(payload);

  if (
    !isRecord(decoded) ||
    typeof decoded.sub !== 'number' ||
    !isUserRole(decoded.role) ||
    typeof decoded.memberId !== 'number' ||
    typeof decoded.iat !== 'number' ||
    typeof decoded.exp !== 'number'
  ) {
    throw new Error('Malformed access token');
  }

  return {
    sub: decoded.sub,
    role: decoded.role,
    memberId: decoded.memberId,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

export function signAccessToken(user: User): string {
  const issuedAt = Math.floor(Date.now() / 1000);

  const claims: AccessTokenClaims = {
    sub: user.id,
    role: user.role,
    memberId: user.memberId,
    iat: issuedAt,
    exp: issuedAt + config.accessTokenTtlSeconds,
  };

  const header = encodeSegment(TOKEN_HEADER);
  const payload = encodeSegment(claims);

  return `${header}.${payload}.${signSegment(`${header}.${payload}`)}`;
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const segments = token.split('.');

  if (segments.length !== 3) {
    throw new Error('Malformed access token');
  }

  const [header, payload, signature] = segments;
  const headerValue = decodeSegment(header);

  if (!isRecord(headerValue) || headerValue.alg !== 'HS256') {
    throw new Error('Unsupported access token algorithm');
  }

  if (!signaturesMatch(signature, signSegment(`${header}.${payload}`))) {
    throw new Error('Invalid access token signature');
  }

  const claims = readClaims(payload);

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Access token has expired');
  }

  return claims;
}
