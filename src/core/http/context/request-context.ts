import { AsyncLocalStorage } from "async_hooks";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export interface RequestContextStore {
  requestId: string;
  correlationId: string;
  userId?: string;
  organizationId?: string;
  environmentId?: string;
  metadata?: Record<string, any>;
}

export class RequestContext {
  private static storage = new AsyncLocalStorage<RequestContextStore>();

  static run(store: RequestContextStore, fn: () => void) {
    this.storage.run(store, fn);
  }

  static get(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  static get requestId(): string | undefined {
    return this.get()?.requestId;
  }

  static get correlationId(): string | undefined {
    return this.get()?.correlationId;
  }

  static get userId(): string | undefined {
    return this.get()?.userId;
  }

  static get organizationId(): string | undefined {
    return this.get()?.organizationId;
  }

  static get environmentId(): string | undefined {
    return this.get()?.environmentId;
  }

  static get metadata(): Record<string, any> | undefined {
    return this.get()?.metadata;
  }

  static setMetadata(key: string, value: any) {
    const store = this.get();
    if (store) {
      if (!store.metadata) {
        store.metadata = {};
      }
      store.metadata[key] = value;
    }
  }
}

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  const correlationId = (req.headers["x-correlation-id"] as string) || requestId;

  // Set response headers
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-correlation-id", correlationId);

  const store: RequestContextStore = {
    requestId,
    correlationId,
    metadata: {},
  };

  // Run the request inside the async local storage context
  RequestContext.run(store, () => {
    // Attach store to request object for easy reference if needed
    (req as any).context = store;
    next();
  });
};
