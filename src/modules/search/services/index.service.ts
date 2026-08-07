import type { SearchProvider } from "../providers/search-provider.interface";
import { AnalyticsService } from "./analytics.service";
import { EventBus } from "../../../core/events/event.bus";
import { SearchIndexedEvent } from "../events/search.events";

export class IndexService {
  constructor(
    private readonly provider: SearchProvider,
    private readonly analyticsService: AnalyticsService
  ) {}

  async indexDocument(
    environmentId: string,
    documentId: string,
    type: string,
    title: string,
    content: string,
    metadata: any
  ): Promise<any> {
    const indexed = await this.provider.index(
      environmentId,
      documentId,
      type,
      title,
      content,
      metadata
    );

    await this.analyticsService.recordIndexAddition(environmentId);

    // Publish event
    await EventBus.publish(
      new SearchIndexedEvent({
        environmentId,
        documentId,
        type,
        title,
      })
    );

    // Automatically store the title as a search suggestion phrase popularity starter
    if (title && title.trim().length > 2) {
      const phrase = title.trim();
      try {
        const { db } = await import("../../../core/database");
        await db.client.searchSuggestion.upsert({
          where: {
            environmentId_phrase: {
              environmentId,
              phrase,
            },
          },
          update: {
            popularity: { increment: 1 },
          },
          create: {
            environmentId,
            phrase,
            popularity: 1,
          },
        });
      } catch (err) {
        console.error("Failed to upsert searchSuggestion inside indexDocument:", err);
      }
    }

    return indexed;
  }

  async bulkIndexDocuments(
    environmentId: string,
    documents: Array<{
      documentId: string;
      type: string;
      title: string;
      content: string;
      metadata: any;
    }>
  ): Promise<{ count: number }> {
    const count = await this.provider.bulkIndex(environmentId, documents);

    for (let i = 0; i < count; i++) {
      await this.analyticsService.recordIndexAddition(environmentId);
    }

    return { count };
  }

  async deleteDocument(environmentId: string, documentId: string): Promise<boolean> {
    const deleted = await this.provider.delete(environmentId, documentId);
    if (deleted) {
      await this.analyticsService.recordIndexRemoval(environmentId);
    }
    return deleted;
  }
}
export default IndexService;
