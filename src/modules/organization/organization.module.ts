import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { OrganizationRepository } from "./repositories/organization.repository";
import { OrganizationService } from "./services/organization.service";
import { OrganizationController } from "./controllers/organization.controller";
import { createOrganizationRouter } from "./routes/organization.routes";
import Logger from "../../core/logging/logger";

export class OrganizationModule implements IModule {
  public readonly name = "OrganizationModule";

  private repository!: OrganizationRepository;
  private service!: OrganizationService;
  private controller!: OrganizationController;

  public register(app: Application): void {
    this.repository = new OrganizationRepository();
    this.service = new OrganizationService(this.repository);
    this.controller = new OrganizationController(this.service);

    const router = createOrganizationRouter(this.controller);
    // Mount endpoints at /api/v1
    app.use("/api/v1", router);

    Logger.info("OrganizationModule routes registered under /api/v1");
  }

  public initialize(): void {
    Logger.info("OrganizationModule initialized successfully.");
  }
}
export default OrganizationModule;
