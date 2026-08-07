import express from "express";
import {
  requestContextMiddleware,
  environmentResolverMiddleware,
  errorHandlerMiddleware,
  ModuleRegistry,
  ResponseFormatter,
  db
} from "./core";
import { HealthModule } from "./core/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { AuthenticationModule } from "./modules/authentication/authentication.module";
import { AuthorizationModule } from "./modules/authorization/authorization.module";
import { DeveloperModule } from "./modules/developer/developer.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { AdministrationModule } from "./modules/administration/administration.module";
import { SearchModule } from "./modules/search/search.module";

const app = express();

app.use(express.json());

// Apply global request context (RequestId / CorrelationId propagation)
app.use(requestContextMiddleware);
app.use(environmentResolverMiddleware);

// Register Core/Platform Modules
ModuleRegistry.register(app, [
  new HealthModule(),
  new DeveloperModule(),
  new OrganizationModule(),
  new AdministrationModule(),
  new IdentityModule(),
  new SearchModule(),
  new AuthenticationModule(),
  new AuthorizationModule(),
  new NotificationModule(),
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
