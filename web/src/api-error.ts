import type { ZodType } from 'zod';

/**
 * Thrown when a backend response doesn't match the Zod schema we expect.
 *
 * This is *not* a user-facing error like ``ApiError`` (a 4xx/5xx with a
 * ``detail`` body). It means the client and server are out of contract —
 * typically a backend schema change that wasn't mirrored on the client.
 * Failing loudly here prevents silent data corruption downstream.
 */
export class ApiContractError extends Error {
  readonly endpoint: string;
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(
    endpoint: string,
    issues: ReadonlyArray<{ path: string; message: string }>,
  ) {
    const summary = issues
      .slice(0, 3)
      .map((i) => `${i.path || '<root>'}: ${i.message}`)
      .join('; ');
    super(
      `API contract violation at ${endpoint} (${issues.length} issue${
        issues.length === 1 ? '' : 's'
      }): ${summary}`,
    );
    this.name = 'ApiContractError';
    this.endpoint = endpoint;
    this.issues = issues;
  }
}

/**
 * Parse ``data`` against ``schema``. On success returns the parsed value.
 * On failure throws an ``ApiContractError`` carrying the endpoint and a
 * flattened list of Zod issues. Use at every API fetch boundary so a
 * backend drift fails at the edge, not deep in a component render.
 */
export const parseOrThrow = <T>(
  schema: ZodType<T>,
  data: unknown,
  endpoint: string,
): T => {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
  throw new ApiContractError(endpoint, issues);
};

/**
 * Type guard for ApiContractError in error boundaries / React Query onError.
 */
export const isApiContractError = (error: unknown): error is ApiContractError => {
  return error instanceof ApiContractError;
};
