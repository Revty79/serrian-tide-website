export type SubmittedAttempt<T> = Readonly<{
  idempotencyKey: string;
  operation: string;
  payload: T;
}>;

function validKey(value: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9]{32}$/.test(normalized)) throw new Error("Submission identity is invalid.");
  return normalized;
}

function operationLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) throw new Error("Submission operation is invalid.");
  return normalized;
}

export function captureSubmittedAttempt<T>(
  idempotencyKey: string,
  operation: string,
  payload: T,
): SubmittedAttempt<T> {
  return {
    idempotencyKey: validKey(idempotencyKey),
    operation: operationLabel(operation),
    payload: structuredClone(payload),
  };
}

export function retrySubmittedAttempt<T>(attempt: SubmittedAttempt<T>): SubmittedAttempt<T> {
  return attempt;
}

export function isUncertainSubmissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  if (error instanceof TypeError) return true;
  const message = error.message.toLocaleLowerCase();
  return [
    "failed to fetch",
    "network error",
    "network request failed",
    "load failed",
    "connection",
    "timeout",
    "failed to find server action",
    "could not be completed",
  ].some((fragment) => message.includes(fragment));
}
