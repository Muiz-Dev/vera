import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { IdentityRepository } from "./repositories/identity.repository";
import { IdentityService } from "./services/identity.service";
import { IdentityController } from "./controllers/identity.controller";
import { createIdentityRouter } from "./routes/identity.routes";
import Logger from "../../core/logging/logger";

export class IdentityModule implements IModule {
  public readonly name = "IdentityModule";

  private repository!: IdentityRepository;
  private service!: IdentityService;
  private controller!: IdentityController;

  public register(app: Application): void {
    // Instantiate module components
    this.repository = new IdentityRepository();
    this.service = new IdentityService(this.repository);
    this.controller = new IdentityController(this.service);

    // Register routes under /api/v1/identities
    const router = createIdentityRouter(this.controller);
    app.use("/api/v1/identities", router);

    Logger.info("IdentityModule routes registered at /api/v1/identities");
  }

  public initialize(): void {
    Logger.info("IdentityModule initialized successfully.");
  }
}
export default IdentityModule;
