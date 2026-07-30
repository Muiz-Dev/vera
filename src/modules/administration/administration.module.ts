import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { AdministrationService } from "./services/administration.service";
import { AdministrationController } from "./controllers/administration.controller";
import { createAdministrationRouter } from "./routes/administration.routes";
import Logger from "../../core/logging/logger";

export class AdministrationModule implements IModule {
  public readonly name = "AdministrationModule";

  private service!: AdministrationService;
  private controller!: AdministrationController;

  public register(app: Application): void {
    this.service = new AdministrationService();
    this.controller = new AdministrationController(this.service);

    const router = createAdministrationRouter(this.controller);
    // Mount endpoints under /api/v1/administration
    app.use("/api/v1/administration", router);

    Logger.info("AdministrationModule routes registered under /api/v1/administration");
  }

  public async initialize(): Promise<void> {
    Logger.info("AdministrationModule initialized successfully.");
  }
}
export default AdministrationModule;
