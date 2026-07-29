import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { RoleRepository } from "./repositories/role.repository";
import { PermissionRepository } from "./repositories/permission.repository";
import { RolePermissionRepository } from "./repositories/role-permission.repository";
import { IdentityRoleRepository } from "./repositories/identity-role.repository";
import { MemoryCacheService } from "../../core/cache";
import { AuthorizationService } from "./services/authorization.service";
import { AuthorizationController } from "./controllers/authorization.controller";
import { createAuthorizationRouter } from "./routes/authorization.routes";
import { AuthorizationBootstrap } from "./bootstrap/authorization.bootstrap";
import { authorizationService } from "./middleware/authorization.middleware";
import { db } from "../../core";
import Logger from "../../core/logging/logger";

export class AuthorizationModule implements IModule {
  public readonly name = "AuthorizationModule";

  private service!: AuthorizationService;
  private controller!: AuthorizationController;
  private bootstrap!: AuthorizationBootstrap;

  public register(app: Application): void {
    // Use shared singleton repositories and services from middleware layer
    const roleRepository = new RoleRepository();
    const permissionRepository = new PermissionRepository();

    this.service = authorizationService;

    this.controller = new AuthorizationController(
      this.service,
      roleRepository,
      permissionRepository
    );

    this.bootstrap = new AuthorizationBootstrap(
      this.service,
      roleRepository,
      permissionRepository
    );

    // Register router mounted at /api/v1
    const router = createAuthorizationRouter(this.controller);
    app.use("/api/v1", router);

    Logger.info("AuthorizationModule registered successfully under /api/v1");
  }

  public async initialize(): Promise<void> {
    // Trigger idempotent system seed on module startup
    await this.bootstrap.seed();
    Logger.info("AuthorizationModule initialized and system roles/permissions seeded successfully.");
  }
}

export default AuthorizationModule;
