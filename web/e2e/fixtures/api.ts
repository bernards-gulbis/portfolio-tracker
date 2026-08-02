import type { APIRequestContext, APIResponse } from '@playwright/test';
import * as fs from 'node:fs';

// Single base URL for every e2e entry point, matching how the app itself
// reaches the API: through the Vite dev proxy, which strips /api before
// forwarding to uvicorn on :8000.
//
// Must be localhost, not 127.0.0.1: the pt_auth cookie is scoped to the host
// 'localhost' (set by the browser during UI login in global-setup). Cookies
// ignore the port, so :3000 and :8000 both receive it — but a different host
// does not, and the request fixture would then 401 on every call.
export const API = 'http://localhost:3000/api';

export interface Portfolio {
  id: number;
  name: string;
}

async function ensureOk(resp: APIResponse, target: string): Promise<APIResponse> {
  if (resp.ok()) return resp;
  const body = await resp.text().catch(() => '');
  throw new Error(`${target} -> ${resp.status()} ${resp.statusText()}: ${body}`);
}

export async function createPortfolio(
  request: APIRequestContext,
  name = 'Test Portfolio',
): Promise<Portfolio> {
  const resp = await ensureOk(
    await request.post(`${API}/portfolios/`, { data: { name } }),
    'POST /portfolios/',
  );
  return resp.json();
}

export async function createTransaction(
  request: APIRequestContext,
  portfolioId: number,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await ensureOk(
    await request.post(`${API}/portfolios/${portfolioId}/transactions/`, { data }),
    `POST /portfolios/${portfolioId}/transactions/`,
  );
  return resp.json();
}

export async function importCSV(
  request: APIRequestContext,
  portfolioId: number,
  csvPath: string,
): Promise<void> {
  const buffer = fs.readFileSync(csvPath);
  await ensureOk(
    await request.post(`${API}/portfolios/${portfolioId}/transactions/import`, {
      multipart: { file: { name: 'transactions.csv', mimeType: 'text/csv', buffer } },
      params: { dry_run: 'false' },
    }),
    `POST /portfolios/${portfolioId}/transactions/import`,
  );
}
