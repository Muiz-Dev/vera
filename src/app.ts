import express from "express";
import {
  requestContextMiddleware,
  errorHandlerMiddleware,
  ModuleRegistry,
  ResponseFormatter,
  db
} from "./core";
import { HealthModule } from "./core/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { AuthenticationModule } from "./modules/authentication/authentication.module";

const app = express();

app.use(express.json());

// Apply global request context (RequestId / CorrelationId propagation)
app.use(requestContextMiddleware);

// Register Core/Platform Modules
ModuleRegistry.register(app, [
  new HealthModule(),
  new IdentityModule(),
  new AuthenticationModule(),
]);

// Basic root route adhering to our standardized response envelope and versioning prep
app.get("/", async (_, res, next) => {
  try {
    const developers = await db.client.developer.count();
    ResponseFormatter.success(res, {
      name: "Vera Platform",
      version: "0.0.1",
      developers,
    });
  } catch (error) {
    next(error);
  }
});

// App-level global error handling middleware - must be registered after all routes/modules
app.use(errorHandlerMiddleware);

export default app;
export { ModuleRegistry };
