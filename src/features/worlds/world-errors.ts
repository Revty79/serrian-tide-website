export class WorldError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export const worldUnavailable = () => new WorldError("This World or resource is unavailable.", 404);

