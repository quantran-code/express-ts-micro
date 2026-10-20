import { config } from '../config';
import { HttpError } from '../errors/httpError';

export interface LoanRecord {
  id: number;
  memberId: number;
  bookId: number;
  status: string;
  dueDate?: string;
  [key: string]: unknown;
}

export type PublicLoan = Omit<LoanRecord, 'dueDate'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function requestJson(url: string): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-service-key': config.serviceKey,
        accept: 'application/json',
      },
    });
  } catch {
    throw new HttpError(502, 'Unable to reach loan-service');
  }

  if (!response.ok) {
    throw new HttpError(502, 'Unable to reach loan-service');
  }

  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'Invalid response from loan-service');
  }
}

export async function getActiveLoanCount(memberId: number): Promise<number> {
  const url = `${config.loanServiceUrl}/internal/loans/active-count?memberId=${memberId}`;
  const body = await requestJson(url);

  if (!isRecord(body) || typeof body.count !== 'number' || !Number.isFinite(body.count)) {
    throw new HttpError(502, 'Invalid response from loan-service');
  }

  return body.count;
}

export async function getActiveLoans(memberId: number): Promise<PublicLoan[]> {
  const url = `${config.loanServiceUrl}/internal/loans?memberId=${memberId}&status=active`;
  const body = await requestJson(url);

  if (!Array.isArray(body)) {
    throw new HttpError(502, 'Invalid response from loan-service');
  }

  return body.map((entry) => {
    if (!isRecord(entry)) {
      throw new HttpError(502, 'Invalid response from loan-service');
    }

    const loan: Record<string, unknown> = { ...entry };
    delete loan.dueDate;

    return loan as LoanRecord;
  });
}
