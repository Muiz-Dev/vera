import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import { Logger } from "../logging/logger";
import { ResponseFormatter } from "../http/response-formatter";
import { RequestContext } from "../http/context/request-context";
import { ZodError } from "zod";

export const errorHandlerMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const correlationId = RequestContext.correlationId || "";
  const requestId = RequestContext.requestId || "";

  // 1. Check if error is custom AppError
  if (err instanceof AppError) {
    err.correlationId = correlationId;

    // Log the error
    if (err.statusCode >= 500) {
      Logger.error(`AppError [${err.code}]: ${err.message}`, err, { correlationId, requestId });
    } else {
      Logger.warn(`AppError [${err.code}]: ${err.message}`, { correlationId, requestId, code: err.code, statusCode: err.statusCode });
    }

    return ResponseFormatter.error(
      res,
      err.message,
      err.code,
      err.statusCode,
      err.details,
      { correlationId }
    );
  }

  // 2. Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.issues.reduce((acc: Record<string, any>, curr) => {
      const field = curr.path.join(".");
      acc[field] = curr.message;
      return acc;
    }, {});

    Logger.warn(`Validation failed: ${err.message}`, { correlationId, requestId, details });

    return ResponseFormatter.error(
      res,
      "Validation failed",
      "ERR_VALIDATION_FAILED",
      400,
      details,
      { correlationId }
    );
  }

  // 3. Fallback: Generic unhandled errors
  Logger.error(`Unhandled Exception: ${err.message || err}`, err, { correlationId, requestId });

  const isProduction = process.env.NODE_ENV === "production";
  const message = isProduction ? "An internal server error occurred" : err.message || "Internal Server Error";
  const details = isProduction ? undefined : { stack: err.stack };

  return ResponseFormatter.error(
    res,
    message,
    "ERR_INTERNAL",
    500,
    details,
    { correlationId }
  );
};
