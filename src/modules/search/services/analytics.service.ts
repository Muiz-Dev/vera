import { db } from "../../../core/database";

export class AnalyticsService {
  async recordSearch(
    environmentId: string,
    queryText: string,
    resultsCount: number,
    executionTimeMs: number,
    strategy: string,
    userId?: string
  ): Promise<void> {
    // 1. Save search query
    await db.client.searchQuery.create({
      data: {
        environmentId,
        queryText,
        resultsCount,
        executionTimeMs,
        strategy,
      },
    });

    // 2. Save search log
    await db.client.searchLog.create({
      data: {
        environmentId,
        queryText,
        resultsCount,
        executionTimeMs,
        strategy,
        userId,
      },
    });

    // 3. Update search statistics for environment
    await db.client.searchStatistic.upsert({
      where: { environmentId },
      update: {
        totalQueries: { increment: 1 },
      },
      create: {
        environmentId,
        totalQueries: 1,
        totalIndexes: 0,
      },
    });
  }

  async recordIndexAddition(environmentId: string): Promise<void> {
    await db.client.searchStatistic.upsert({
      where: { environmentId },
      update: {
        totalIndexes: { increment: 1 },
      },
      create: {
        environmentId,
        totalQueries: 0,
        totalIndexes: 1,
      },
    });
  }

  async recordIndexRemoval(environmentId: string): Promise<void> {
    const stats = await db.client.searchStatistic.findUnique({
      where: { environmentId },
    });
    if (stats && stats.totalIndexes > 0) {
      await db.client.searchStatistic.update({
        where: { environmentId },
        data: {
          totalIndexes: { decrement: 1 },
        },
      });
    }
  }

  async recordFeedback(
    environmentId: string,
    queryId: string,
    documentId: string,
    clicked: boolean,
    rating?: number
  ): Promise<any> {
    return db.client.searchFeedback.create({
      data: {
        environmentId,
        queryId,
        documentId,
        clicked,
        rating,
      },
    });
  }

  async getStatistics(environmentId: string): Promise<any> {
    let stats = await db.client.searchStatistic.findUnique({
      where: { environmentId },
    });

    if (!stats) {
      stats = await db.client.searchStatistic.create({
        data: {
          environmentId,
          totalQueries: 0,
          totalIndexes: 0,
          cacheHitCount: 0,
        },
      });
    }

    // Include recent query logs as well
    const recentQueries = await db.client.searchQuery.findMany({
      where: { environmentId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      totalQueries: stats.totalQueries,
      totalIndexes: stats.totalIndexes,
      cacheHitCount: stats.cacheHitCount,
      updatedAt: stats.updatedAt,
      recentQueries,
    };
  }

  async getSearchHistory(environmentId: string, userId?: string): Promise<any[]> {
    return db.client.searchLog.findMany({
      where: {
        environmentId,
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}
export default AnalyticsService;
