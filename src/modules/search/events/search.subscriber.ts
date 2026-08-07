import { EventBus } from "../../../core/events/event.bus";
import { db } from "../../../core/database";
import Logger from "../../../core/logging/logger";
import { SearchService } from "../services/search.service";

export class SearchSubscriber {
  private readonly searchService: SearchService;

  constructor() {
    this.searchService = new SearchService();
  }

  public register(): void {
    Logger.info("Registering Search Engine EventBus subscribers...");

    // 1. IdentityCreated
    EventBus.subscribe("IdentityCreated", async (event) => {
      const payload = event.payload;
      try {
        // Query identity's environmentId
        const identity = await db.client.identity.findUnique({
          where: { id: payload.id },
        });

        if (identity) {
          await this.searchService.index(
            identity.environmentId,
            payload.id,
            "identity",
            `Identity: ${payload.email || payload.phone || payload.id}`,
            `Status: ${payload.status || "UNKNOWN"}, Email: ${payload.email || "N/A"}, Phone: ${payload.phone || "N/A"}`,
            { email: payload.email, phone: payload.phone, status: payload.status }
          );
        }
      } catch (err) {
        Logger.error("SearchSubscriber failed to index IdentityCreated:", err);
      }
    });

    // 2. IdentityUpdated
    EventBus.subscribe("IdentityUpdated", async (event) => {
      const payload = event.payload;
      try {
        const identity = await db.client.identity.findUnique({
          where: { id: payload.id },
        });

        if (identity) {
          await this.searchService.index(
            identity.environmentId,
            payload.id,
            "identity",
            `Identity: ${payload.email || payload.phone || payload.id}`,
            `Status: ${payload.status || "UNKNOWN"}, Email: ${payload.email || "N/A"}, Phone: ${payload.phone || "N/A"}`,
            { email: payload.email, phone: payload.phone, status: payload.status }
          );
        }
      } catch (err) {
        Logger.error("SearchSubscriber failed to index IdentityUpdated:", err);
      }
    });

    // 3. ApplicationCreated
    EventBus.subscribe("ApplicationCreated", async (event) => {
      const payload = event.payload;
      try {
        // Query environments created for this application
        const environments = await db.client.environment.findMany({
          where: { applicationId: payload.id },
        });

        for (const env of environments) {
          await this.searchService.index(
            env.id,
            payload.id,
            "application",
            `Application: ${payload.name}`,
            `Slug: ${payload.slug}, DeveloperId: ${payload.developerId}`,
            { slug: payload.slug, developerId: payload.developerId }
          );
        }
      } catch (err) {
        Logger.error("SearchSubscriber failed to index ApplicationCreated:", err);
      }
    });

    // 4. OrganizationCreated
    EventBus.subscribe("OrganizationCreated", async (event) => {
      const payload = event.payload;
      try {
        // Query any environments associated with this owner's applications
        const environments = await db.client.environment.findMany({
          where: {
            application: {
              developerId: payload.ownerId,
            },
          },
        });

        for (const env of environments) {
          await this.searchService.index(
            env.id,
            payload.id,
            "organization",
            `Organization: ${payload.name}`,
            `Slug: ${payload.slug}, OwnerId: ${payload.ownerId}`,
            { slug: payload.slug, ownerId: payload.ownerId }
          );
        }
      } catch (err) {
        Logger.error("SearchSubscriber failed to index OrganizationCreated:", err);
      }
    });
  }
}
export default SearchSubscriber;
