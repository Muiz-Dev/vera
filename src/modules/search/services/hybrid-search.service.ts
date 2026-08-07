import type { SearchProvider, SearchOptions, SearchResult } from "../providers/search-provider.interface";

export class HybridSearchService {
  constructor(private readonly provider: SearchProvider) {}

  async search(
    environmentId: string,
    queryText: string,
    options?: SearchOptions
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const strategy = options?.strategy || "text";

    // 1. Execute primary text search using provider
    const textResult = await this.provider.search(environmentId, queryText, options);

    if (strategy !== "hybrid") {
      return textResult;
    }

    // 2. Perform Hybrid Scoring pipeline: Keyword score + simulated semantic scoring
    // We apply semantic score calculations to the returned documents to model true Hybrid search
    const hybridResults = textResult.results.map((doc) => {
      let semanticScore = 0.0;

      // Simulate a semantic match: matches conceptually (e.g. "auth" maps to "token", "password", etc.)
      const lowerQuery = queryText.toLowerCase().trim();
      const lowerContent = doc.content.toLowerCase();
      const lowerTitle = doc.title.toLowerCase();

      const semanticSynonyms: Record<string, string[]> = {
        auth: ["token", "session", "login", "credential", "password", "social"],
        user: ["identity", "profile", "member", "developer"],
        org: ["organization", "team", "workspace", "member"],
        key: ["api", "publishable", "secret", "token"],
      };

      for (const [key, synonyms] of Object.entries(semanticSynonyms)) {
        if (lowerQuery.includes(key) || synonyms.some((s) => lowerQuery.includes(s))) {
          // If query mentions keyword or its synonyms, and document contains key or synonyms, boost semantic score
          if (lowerContent.includes(key) || synonyms.some((s) => lowerContent.includes(s))) {
            semanticScore += 1.5;
          }
          if (lowerTitle.includes(key) || synonyms.some((s) => lowerTitle.includes(s))) {
            semanticScore += 2.5;
          }
        }
      }

      // Combine text relevance score (base score) and semantic score
      const textScore = doc.score || 1.0;
      doc.score = Number((textScore * 0.6 + semanticScore * 0.4).toFixed(3));

      return doc;
    });

    // Re-sort results based on final combined hybrid scores
    const sortedHybridResults = hybridResults.sort((a, b) => (b.score || 0) - (a.score || 0));

    return {
      results: sortedHybridResults,
      total: textResult.total,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
export default HybridSearchService;
