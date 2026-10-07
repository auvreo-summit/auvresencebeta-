/** Keep operational failures distinct from rejected identity, without leaking SQL. */
export class ProfileStorageError extends Error {
  constructor(cause: unknown) { super('Profile storage is unavailable.', { cause }); this.name = 'ProfileStorageError'; }
}
export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) { seen.add(current); if (typeof current.code === 'string') return current.code; current = current.cause; }
  return undefined;
}
export function databaseFailure(error: unknown) {
  const code = postgresErrorCode(error);
  if (code === '42703' || code === '42P01') return { status: 503, code: 'DATABASE_SCHEMA_OUTDATED', error: 'Event storage needs an update. Please contact the event team.' };
  if (['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','08006','57P01','53300'].includes(code || '')) return { status: 503, code: 'DATABASE_UNAVAILABLE', error: 'Event storage is temporarily unavailable. Please try again shortly.' };
  return null;
}

export class OperationError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'OperationError'; }
}
export function operationFailure(error: unknown) {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof OperationError) return { status: current.status, code: current.code, error: current.message };
    current = current.cause;
  }
  return databaseFailure(error);
}
