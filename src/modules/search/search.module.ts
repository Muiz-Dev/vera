import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import Logger from "../../core/logging/logger";
import { SearchService } from "./services/search.service";
import { SearchController } from "./controllers/search.controller";
import { createSearchRouter } from "./routes/search.routes";
import { SearchSubscriber } from "./events/search.subscriber";

export class SearchModule implements IModule {
  public readonly name = "SearchModule";

  private readonly service = new SearchService();
  private readonly controller = new SearchController(this.service);
  private readonly subscriber = new SearchSubscriber();

  public register(app: Application): void {
    const router = createSearchRouter(this.controller);
    app.use("/api/v1", router);

    Logger.info("SearchModule routes registered under /api/v1");
  }

  public async initialize(): Promise<void> {
    Logger.info("Initializing SearchModule...");
    this.subscriber.register();
    Logger.info("SearchModule initialized successfully.");
  }
}
export default SearchModule;
