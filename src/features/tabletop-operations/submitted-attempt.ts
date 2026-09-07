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
