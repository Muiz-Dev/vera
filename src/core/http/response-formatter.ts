import type { Response } from "express";
import { RequestContext } from "./context/request-context";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta: {
    requestId: string;
    timestamp: string;
    [key: string]: any;
  };
}

export class ResponseFormatter {
  static success<T>(res: Response, data: T, statusCode: number = 200, meta: Record<string, any> = {}): Response {
    const requestId = RequestContext.requestId || "";

    const responseBody: ApiResponse<T> = {
      success: true,
      data,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };

    return res.status(statusCode).json(responseBody);
  }

  static error(
    res: Response,
    message: string,
    code: string = "ERR_INTERNAL",
    statusCode: number = 500,
    details?: any,
    meta: Record<string, any> = {}
  ): Response {
    const requestId = RequestContext.requestId || "";

    const responseBody: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };

    return res.status(statusCode).json(responseBody);
  }
}
