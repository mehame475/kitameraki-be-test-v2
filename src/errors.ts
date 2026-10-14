export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: string[]) {
    super(400, 'validation_error', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Task not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The task was modified by someone else. Reload and try again.') {
    super(409, 'conflict', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this organization') {
    super(403, 'forbidden', message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Content-Type must be application/json') {
    super(415, 'unsupported_media_type', message);
  }
}
