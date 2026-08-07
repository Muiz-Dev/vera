import type { SearchProvider, SearchOptions, SearchResult } from "../providers/search-provider.interface";
import { PostgresSearchProvider } from "../providers/postgres-search-provider";
import { IndexService } from "./index.service";
import { HybridSearchService } from "./hybrid-search.service";
import { SuggestionService } from "./suggestion.service";
import { AnalyticsService } from "./analytics.service";

export class SearchService {
  private readonly provider: SearchProvider;

  public readonly indexService: IndexService;
  public readonly hybridSearchService: HybridSearchService;
  public readonly suggestionService: SuggestionService;
  public readonly analyticsService: AnalyticsService;

  constructor(provider?: SearchProvider) {
    this.provider = provider || new PostgresSearchProvider();

    this.analyticsService = new AnalyticsService();
    this.indexService = new IndexService(this.provider, this.analyticsService);
    this.hybridSearchService = new HybridSearchService(this.provider);
    this.suggestionService = new SuggestionService(this.provider);
  }

  async search(
    environmentId: string,
    queryText: string,
    options?: SearchOptions,
    userId?: string
  ): Promise<SearchResult> {
    const strategy = options?.strategy || "text";

    // 1. Perform search
    const result = await this.hybridSearchService.search(environmentId, queryText, options);

    // 2. Asynchronously record query phrase for suggestion dictionary (if text search yields results)
    if (result.results.length > 0 && queryText && queryText.trim().length > 2) {
      this.suggestionService.recordSearchPhrase(environmentId, queryText).catch(() => {});
    }

    // 3. Asynchronously record query analytics
    this.analyticsService
      .recordSearch(
        environmentId,
        queryText,
        result.results.length,
        result.executionTimeMs,
        strategy,
        userId
      )
      .catch(() => {});

    return result;
  }

  async index(
    environmentId: string,
    documentId: string,
    type: string,
    title: string,
    content: string,
    metadata: any
  ): Promise<any> {
    return this.indexService.indexDocument(environmentId, documentId, type, title, content, metadata);
  }

  async bulkIndex(
    environmentId: string,
    documents: Array<{
      documentId: string;
      type: string;
      title: string;
      content: string;
      metadata: any;
    }>
  ): Promise<any> {
    return this.indexService.bulkIndexDocuments(environmentId, documents);
  }

  async delete(environmentId: string, documentId: string): Promise<boolean> {
    return this.indexService.deleteDocument(environmentId, documentId);
  }

  async suggest(environmentId: string, queryText: string): Promise<string[]> {
    return this.suggestionService.getSuggestions(environmentId, queryText);
  }

  async getFacets(
    environmentId: string,
    queryText: string,
    fields: string[]
  ): Promise<Record<string, Array<{ value: string; count: number }>>> {
    return this.provider.getFacets(environmentId, queryText, fields);
  }

  async getStatistics(environmentId: string): Promise<any> {
    return this.analyticsService.getStatistics(environmentId);
  }

  async getHistory(environmentId: string, userId?: string): Promise<any[]> {
    return this.analyticsService.getSearchHistory(environmentId, userId);
  }

  async recordFeedback(
    environmentId: string,
    queryId: string,
    documentId: string,
    clicked: boolean,
    rating?: number
  ): Promise<any> {
    return this.analyticsService.recordFeedback(environmentId, queryId, documentId, clicked, rating);
  }
}
export default SearchService;
