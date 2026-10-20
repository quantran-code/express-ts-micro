import request from 'supertest';
import { compare } from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app';
import { DUMMY_PASSWORD_HASH } from '../src/auth/authRouter';
import { verifyAccessToken } from '../src/auth/jwt';
import { config } from '../src/config';
import {
  SEEDED_LIBRARIAN_EMAIL,
  SEEDED_LIBRARIAN_MEMBER_ID,
  SEEDED_LIBRARIAN_PASSWORD,
  userRepository,
} from '../src/users/userRepository';

const serviceKey = { 'x-service-key': config.serviceKey };

interface LoginResponseBody {
  accessToken: string;
  tokenType: string;
  role: string;
}

function deactivateSeededLibrarian(): void {
  const seeded = userRepository.findByEmail(SEEDED_LIBRARIAN_EMAIL);

  expect(seeded).toBeDefined();
  userRepository.setActive(seeded!.id, false);
}

describe('POST /auth/login', () => {
  beforeEach(() => {
    userRepository.reset();
  });

  it('issues a bearer token for the seeded librarian', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: SEEDED_LIBRARIAN_EMAIL, password: SEEDED_LIBRARIAN_PASSWORD });

    expect(res.status).toBe(200);

    const body = res.body as LoginResponseBody;
    expect(body.tokenType).toBe('Bearer');
    expect(body.role).toBe('librarian');
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.split('.')).toHaveLength(3);
  });

  it('signs claims a verifier accepts with the configured TTL', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: SEEDED_LIBRARIAN_EMAIL, password: SEEDED_LIBRARIAN_PASSWORD });

    expect(res.status).toBe(200);

    const claims = verifyAccessToken((res.body as LoginResponseBody).accessToken);

    expect(claims.sub).toBe(1);
    expect(claims.role).toBe('librarian');
    expect(claims.memberId).toBe(SEEDED_LIBRARIAN_MEMBER_ID);
    expect(claims.iat).toBeGreaterThan(0);
    expect(claims.exp - claims.iat).toBe(config.accessTokenTtlSeconds);
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it('matches the seeded email case-insensitively', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: 'LIBRARIAN@Library.test', password: SEEDED_LIBRARIAN_PASSWORD });

    expect(res.status).toBe(200);
    expect((res.body as LoginResponseBody).role).toBe('librarian');
  });

  it('rejects a wrong password without issuing a token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: SEEDED_LIBRARIAN_EMAIL, password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const unknown = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: 'nobody@example.com', password: 'WrongPassword1!' });

    const wrongPassword = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: SEEDED_LIBRARIAN_EMAIL, password: 'WrongPassword1!' });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body).toEqual({ error: 'Invalid credentials' });
    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(wrongPassword.body));
    expect(unknown.body).not.toHaveProperty('accessToken');
  });

  it('keeps a dummy hash ready for the unknown email path', async () => {
    await expect(compare('dummy-password-for-timing', DUMMY_PASSWORD_HASH)).resolves.toBe(true);
    await expect(compare('WrongPassword1!', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });

  it('rejects a deactivated user with the deactivated message', async () => {
    deactivateSeededLibrarian();

    const res = await request(app)
      .post('/auth/login')
      .set(serviceKey)
      .send({ email: SEEDED_LIBRARIAN_EMAIL, password: SEEDED_LIBRARIAN_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Account is deactivated' });
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('rejects a missing body with invalid credentials', async () => {
    const res = await request(app).post('/auth/login').set(serviceKey).send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });
});
