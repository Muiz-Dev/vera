import { db } from "../../../core/database";
import type { SearchProvider } from "../providers/search-provider.interface";

export class SuggestionService {
  constructor(private readonly provider: SearchProvider) {}

  async getSuggestions(environmentId: string, queryText: string): Promise<string[]> {
    if (!queryText || !queryText.trim()) return [];

    // 1. Query registered matching phrase suggestions from search suggestions table
    const suggestions = await db.client.searchSuggestion.findMany({
      where: {
        environmentId,
        phrase: {
          contains: queryText,
          mode: "insensitive",
        },
      },
      orderBy: {
        popularity: "desc",
      },
      take: 5,
    });

    const list = suggestions.map((s) => s.phrase);

    // 2. Fallback to provider-level text matching if DB lookup is thin
    if (list.length < 3) {
      const fallback = await this.provider.suggest(environmentId, queryText);
      for (const phrase of fallback) {
        if (!list.includes(phrase)) {
          list.push(phrase);
        }
      }
    }

    return list.slice(0, 5);
  }

  async recordSearchPhrase(environmentId: string, phrase: string): Promise<void> {
    if (!phrase || phrase.trim().length < 3) return;
    const cleanPhrase = phrase.toLowerCase().trim();

    try {
      await db.client.searchSuggestion.upsert({
        where: {
          environmentId_phrase: {
            environmentId,
            phrase: cleanPhrase,
          },
        },
        update: {
          popularity: { increment: 1 },
          updatedAt: new Date(),
        },
        create: {
          environmentId,
          phrase: cleanPhrase,
          popularity: 1,
        },
      });
    } catch {
      // Safe collision bypass
    }
  }
}
export default SuggestionService;
