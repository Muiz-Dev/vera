export type ErrorCode =
  | "ERR_CONFIG_INVALID"
  | "ERR_VALIDATION_FAILED"
  | "ERR_DATABASE_CONNECTION"
  | "ERR_UNAUTHORIZED"
  | "ERR_FORBIDDEN"
  | "ERR_NOT_FOUND"
  | "ERR_INTERNAL";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, any> | undefined;
  public readonly timestamp: string;
  public correlationId: string | undefined;

  constructor(
    message: string,
    code: ErrorCode = "ERR_INTERNAL",
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "ERR_VALIDATION_FAILED", 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized access") {
    super(message, "ERR_UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden access") {
    super(message, "ERR_FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, "ERR_NOT_FOUND", 404);
  }
}

export class DatabaseConnectionError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "ERR_DATABASE_CONNECTION", 500, details);
  }
}

export class ConfigurationInvalidError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "ERR_CONFIG_INVALID", 500, details);
  }
}
