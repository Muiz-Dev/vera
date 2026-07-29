import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { DeveloperRepository } from "./repositories/developer.repository";
import { DeveloperService } from "./services/developer.service";
import { DeveloperController } from "./controllers/developer.controller";
import { createDeveloperRouter } from "./routes/developer.routes";
import Logger from "../../core/logging/logger";

export class DeveloperModule implements IModule {
  public readonly name = "DeveloperModule";

  private repository!: DeveloperRepository;
  private service!: DeveloperService;
  private controller!: DeveloperController;

  public register(app: Application): void {
    this.repository = new DeveloperRepository();
    this.service = new DeveloperService(this.repository);
    this.controller = new DeveloperController(this.service);

    const router = createDeveloperRouter(this.controller);
    // Mount endpoints at /api/v1
    app.use("/api/v1", router);

    Logger.info("DeveloperModule routes registered under /api/v1");
  }

  public initialize(): void {
    Logger.info("DeveloperModule initialized successfully.");
  }
}
export default DeveloperModule;
