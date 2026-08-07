import type { IndexedDocument } from "../providers/search-provider.interface";

export class RankingService {
  /**
   * Evaluates and scores candidates based on the query string.
   */
  public rank(candidates: IndexedDocument[], query: string): IndexedDocument[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return candidates;

    const scored = candidates.map((doc) => {
      let score = 0;
      const titleLower = doc.title.toLowerCase();
      const contentLower = doc.content.toLowerCase();

      // 1. Exact Match Check
      let matchesQuery = false;
      if (titleLower === normalizedQuery) {
        score += 100;
        matchesQuery = true;
      } else if (contentLower === normalizedQuery) {
        score += 50;
        matchesQuery = true;
      }

      // 2. Prefix Match Check
      if (titleLower.startsWith(normalizedQuery)) {
        score += 30;
        matchesQuery = true;
      }

      // 3. Substring / Token Match Check
      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
      let tokenMatches = 0;
      for (const token of queryTokens) {
        if (titleLower.includes(token)) {
          score += 15;
          tokenMatches++;
          matchesQuery = true;
        }
        if (contentLower.includes(token)) {
          score += 5;
          tokenMatches++;
          matchesQuery = true;
        }
      }

      // If query is specified but there is absolutely no match, score remains 0
      if (!matchesQuery) {
        doc.score = 0;
        return doc;
      }

      // 4. Metadata Boost
      const meta = doc.metadata || {};
      if (meta.isFeatured === true || meta.featured === true) {
        score += 10;
      }
      if (typeof meta.boost === "number") {
        score += meta.boost;
      }

      // 5. Popularity/Click Boost
      if (typeof meta.popularity === "number") {
        score += meta.popularity * 0.1;
      }

      doc.score = score;
      return doc;
    });

    // Sort by score descending
    return scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  }
}
export default RankingService;
