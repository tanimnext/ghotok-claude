/** An error with an HTTP status and a stable machine-readable code for clients. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code = 'BAD_REQUEST', message, details) => new ApiError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Please log in to continue.') => new ApiError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have permission to do this.') => new ApiError(403, code, message);
export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (code = 'CONFLICT', message) => new ApiError(409, code, message);
