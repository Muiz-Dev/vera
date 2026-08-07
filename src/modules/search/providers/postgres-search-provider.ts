import { db } from "../../../core/database";
import type { SearchProvider, SearchOptions, SearchResult, IndexedDocument } from "./search-provider.interface";

export class PostgresSearchProvider implements SearchProvider {
  public readonly name = "postgres";

  async index(
    environmentId: string,
    documentId: string,
    type: string,
    title: string,
    content: string,
    metadata: any
  ): Promise<IndexedDocument> {
    const record = await db.client.searchIndex.upsert({
      where: {
        environmentId_documentId: {
          environmentId,
          documentId,
        },
      },
      update: {
        type,
        title,
        content,
        metadata: metadata || {},
        updatedAt: new Date(),
      },
      create: {
        environmentId,
        documentId,
        type,
        title,
        content,
        metadata: metadata || {},
      },
    });

    return {
      documentId: record.documentId,
      type: record.type,
      title: record.title,
      content: record.content,
      metadata: record.metadata,
    };
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
  ): Promise<number> {
    let count = 0;
    for (const doc of documents) {
      await this.index(
        environmentId,
        doc.documentId,
        doc.type,
        doc.title,
        doc.content,
        doc.metadata
      );
      count++;
    }
    return count;
  }

  async delete(environmentId: string, documentId: string): Promise<boolean> {
    try {
      await db.client.searchIndex.delete({
        where: {
          environmentId_documentId: {
            environmentId,
            documentId,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async search(
    environmentId: string,
    queryText: string,
    options?: SearchOptions
  ): Promise<SearchResult> {
    const startTime = Date.now();

    // 1. Build Prisma query filters
    const where: any = {
      environmentId,
    };

    // Retrieve all candidates for this environment.
    // Metadata filtering is done programmatically in TypeScript below to support partial field matching.
    let candidates = await db.client.searchIndex.findMany({
      where,
    });

    // 2. Perform deep metadata filtering in TypeScript for full arbitrary JSON structure support
    if (options?.filters && Object.keys(options.filters).length > 0) {
      candidates = candidates.filter((doc) => {
        const docMeta = (doc.metadata as Record<string, any>) || {};
        for (const [key, val] of Object.entries(options.filters!)) {
          if (Array.isArray(val)) {
            // Check if arrays overlap or contain values
            const docVal = docMeta[key];
            if (Array.isArray(docVal)) {
              if (!val.some((v) => docVal.includes(v))) return false;
            } else if (!val.includes(docVal)) {
              return false;
            }
          } else if (docMeta[key] !== val) {
            return false;
          }
        }
        return true;
      });
    }

    // 3. Score and rank candidates using a ranking pipeline if queryText exists
    let results: IndexedDocument[] = candidates.map((doc) => ({
      documentId: doc.documentId,
      type: doc.type,
      title: doc.title,
      content: doc.content,
      metadata: doc.metadata,
      score: 1.0, // base score
    }));

    if (queryText && queryText.trim()) {
      const normalizedQuery = queryText.toLowerCase().trim();
      const { RankingService } = await import("../services/ranking.service");
      const rankingService = new RankingService();

      results = rankingService.rank(results, normalizedQuery);
      // Filter out records that have 0 score (i.e. completely unrelated to query)
      results = results.filter((r) => (r.score || 0) > 0);
    }

    const total = results.length;

    // Apply pagination (limit & offset)
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;
    results = results.slice(offset, offset + limit);

    return {
      results,
      total,
      executionTimeMs: Date.now() - startTime,
    };
  }

  async suggest(environmentId: string, queryText: string): Promise<string[]> {
    if (!queryText || !queryText.trim()) return [];
    const normalized = queryText.toLowerCase().trim();

    // Query popular suggestions and match indexes in this environment
    const matchedIndexes = await db.client.searchIndex.findMany({
      where: {
        environmentId,
        OR: [
          { title: { contains: normalized, mode: "insensitive" } },
          { content: { contains: normalized, mode: "insensitive" } },
        ],
      },
      take: 10,
    });

    const suggestionsSet = new Set<string>();

    for (const doc of matchedIndexes) {
      if (doc.title.toLowerCase().includes(normalized)) {
        suggestionsSet.add(doc.title);
      } else {
        // Extract matching phrase/word from content
        const words = doc.content.split(/\s+/);
        const matchIdx = words.findIndex((w) => w.toLowerCase().includes(normalized));
        if (matchIdx !== -1) {
          const phrase = words.slice(matchIdx, matchIdx + 3).join(" ");
          suggestionsSet.add(phrase.replace(/[^\w\s-]/g, ""));
        }
      }
    }

    return Array.from(suggestionsSet).slice(0, 5);
  }

  async getFacets(
    environmentId: string,
    queryText: string,
    fields: string[]
  ): Promise<Record<string, Array<{ value: string; count: number }>>> {
    // 1. Fetch matching search results for this query (without pagination limit)
    const allResults = await this.search(environmentId, queryText, {
      limit: 10000,
    });

    const facets: Record<string, Record<string, number>> = {};
    for (const field of fields) {
      facets[field] = {};
    }

    for (const doc of allResults.results) {
      const meta = (doc.metadata as Record<string, any>) || {};
      for (const field of fields) {
        const val = meta[field];
        if (val !== undefined && val !== null) {
          const strVal = String(val);
          facets[field][strVal] = (facets[field][strVal] || 0) + 1;
        }
      }
    }

    const formattedFacets: Record<string, Array<{ value: string; count: number }>> = {};
    for (const field of fields) {
      formattedFacets[field] = Object.entries(facets[field])
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }

    return formattedFacets;
  }
}
export default PostgresSearchProvider;
