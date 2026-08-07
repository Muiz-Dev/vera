import http from "http";
import express from "express";
import app, { ModuleRegistry } from "../../src/app";
import { db, ResponseFormatter, requestContextMiddleware, errorHandlerMiddleware } from "../../src/core";
import { RequestContext } from "../../src/core/http/context/request-context";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";

const runner = new TestRunner("Search Engine Module Integration Suite");
let server: http.Server;
let port: number;
let tenant1: { environmentId: string; developerId: string };
let tenant2: { environmentId: string; developerId: string };

// Local helper to automatically inject tenant context into HTTP requests
async function tenantRequest(tenant: { environmentId: string }, method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  return request(port, method, path, body, {
    "x-environment-id": tenant.environmentId,
    ...headers,
  });
}

runner
  .beforeAll(async () => {
    await db.connect();

    // Clean any prior test data to ensure clean stats and indexes
    await db.client.searchFeedback.deleteMany({});
    await db.client.searchLog.deleteMany({});
    await db.client.searchSuggestion.deleteMany({});
    await db.client.searchQuery.deleteMany({});
    await db.client.searchStatistic.deleteMany({});
    await db.client.searchProfile.deleteMany({});
    await db.client.searchIndex.deleteMany({});

    // Force re-initialize ModuleRegistry to pick up SearchModule and subscribers cleanly
    EventBus.clearAll();
    await ModuleRegistry.initialize(true);

    // Spawn 2 completely isolated test tenants
    tenant1 = await DbHelper.setupTestTenant();
    tenant2 = await DbHelper.setupTestTenant();

    const testApp = express();
    testApp.use(express.json());
    testApp.use(requestContextMiddleware);

    const { environmentResolverMiddleware } = await import("../../src/core/middleware/environment.middleware");
    testApp.use(environmentResolverMiddleware);

    // Mount core routing
    testApp.use(app);
    testApp.use(errorHandlerMiddleware);

    server = http.createServer(testApp);
    port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          resolve(3009);
        }
      });
    });
  })
  .afterAll(async () => {
    // Cleanup search records and test tenants
    await db.client.searchFeedback.deleteMany({});
    await db.client.searchLog.deleteMany({});
    await db.client.searchSuggestion.deleteMany({});
    await db.client.searchQuery.deleteMany({});
    await db.client.searchStatistic.deleteMany({});
    await db.client.searchProfile.deleteMany({});
    await db.client.searchIndex.deleteMany({});

    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("Event-Driven: Creating an Identity automatically indexes it in search", async () => {
    let identityId = "";
    const testEmail = `search-test-user-${Date.now()}@example.com`;

    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "search-event-ctx",
        correlationId: "search-event-correlation",
        environmentId: tenant1.environmentId,
      }, async () => {
        try {
          const identity = await db.client.identity.create({
            data: {
              environmentId: tenant1.environmentId,
              email: testEmail,
              status: "ACTIVE",
            },
          });
          identityId = identity.id;

          // Publish event
          await EventBus.publish({
            eventName: "IdentityCreated",
            timestamp: new Date(),
            payload: {
              id: identity.id,
              email: testEmail,
              phone: null,
              status: "ACTIVE",
            },
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // Wait slightly for asynchronous indexing to resolve
    await new Promise((r) => setTimeout(r, 200));

    // Retrieve search index directly from database
    const indexed = await db.client.searchIndex.findUnique({
      where: {
        environmentId_documentId: {
          environmentId: tenant1.environmentId,
          documentId: identityId,
        },
      },
    });

    assert.ok(indexed);
    assert.equal(indexed!.type, "identity");
    assert.ok(indexed!.title.includes(testEmail));
  })
  .test("API: POST /api/v1/search/index indexes custom document successfully", async () => {
    const payload = {
      documentId: "doc_policy_101",
      type: "policy",
      title: "Vera Session Token Validation Policy",
      content: "This document describes the security policies surrounding jwt access tokens, refresh token rotation and multi session tracking.",
      metadata: { category: "security", tier: "internal", status: "published" },
    };

    const res = await tenantRequest(tenant1, "POST", "/api/v1/search/index", payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.documentId, "doc_policy_101");
    assert.equal(res.body.data.title, "Vera Session Token Validation Policy");
  })
  .test("API: POST /api/v1/search/bulk indexes multiple documents in bulk", async () => {
    const payload = {
      documents: [
        {
          documentId: "doc_policy_102",
          type: "policy",
          title: "Enterprise Multi-Factor Authentication Requirements",
          content: "This document outlines requirements for standard rfc 6238 totp mfa and mandatory backup recovery codes.",
          metadata: { category: "security", tier: "internal", isFeatured: true },
        },
        {
          documentId: "doc_faq_201",
          type: "faq",
          title: "How to rotate API keys?",
          content: "To rotate secret keys, execute a key rotation action in the dashboard or trigger the public API rotate key endpoint.",
          metadata: { category: "developer", tier: "public", isFeatured: false },
        },
      ],
    };

    const res = await tenantRequest(tenant1, "POST", "/api/v1/search/bulk", payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.count, 2);
  })
  .test("API: POST /api/v1/search performs full-text query & filters by type/metadata", async () => {
    const payload = {
      queryText: "validation policy",
      filters: { category: "security", tier: "internal" },
    };

    const res = await tenantRequest(tenant1, "POST", "/api/v1/search", payload);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].documentId, "doc_policy_101");
  })
  .test("Multi-Tenant Isolation: Tenant 2 cannot see Tenant 1's indexes", async () => {
    // 1. Tenant 1 searches for policies -> returns results
    const res1 = await tenantRequest(tenant1, "POST", "/api/v1/search", { queryText: "policy" });
    assert.ok(res1.body.data.length >= 1);

    // 2. Tenant 2 searches for policies -> returns 0 results because Tenant 2 has a clean slate
    const res2 = await tenantRequest(tenant2, "POST", "/api/v1/search", { queryText: "policy" });
    assert.equal(res2.body.data.length, 0);

    // 3. Tenant 2 indexes a custom document
    await tenantRequest(tenant2, "POST", "/api/v1/search/index", {
      documentId: "doc_t2_index",
      type: "custom",
      title: "Tenant Two Private Data",
      content: "Secret details only visible to tenant 2 environment context.",
      metadata: { private: true },
    });

    // 4. Tenant 1 searches for Tenant 2 private terms -> 0 results
    const res3 = await tenantRequest(tenant1, "POST", "/api/v1/search", { queryText: "Tenant Two Private Data" });
    assert.equal(res3.body.data.length, 0);
  })
  .test("Ranking Pipeline: Exact and Prefix matches rank higher", async () => {
    // Index specific testing titles
    await tenantRequest(tenant1, "POST", "/api/v1/search/index", {
      documentId: "rank_exact",
      type: "policy",
      title: "rank-term",
      content: "Document about rank-term requirements.",
      metadata: { popularity: 1 },
    });

    await tenantRequest(tenant1, "POST", "/api/v1/search/index", {
      documentId: "rank_prefix",
      type: "policy",
      title: "rank-term configuration guide",
      content: "How to configure rank-term requirements.",
      metadata: { popularity: 1 },
    });

    await tenantRequest(tenant1, "POST", "/api/v1/search/index", {
      documentId: "rank_substring",
      type: "policy",
      title: "securing the portal",
      content: "This guide contains token authentication instructions including rank-term rules.",
      metadata: { popularity: 1 },
    });

    // Search for "rank-term"
    const res = await tenantRequest(tenant1, "POST", "/api/v1/search", { queryText: "rank-term" });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 3);

    // Exact match must be first
    assert.equal(res.body.data[0].documentId, "rank_exact");
    // Prefix match must be second
    assert.equal(res.body.data[1].documentId, "rank_prefix");
    // Substring/Content token match must be third
    assert.equal(res.body.data[2].documentId, "rank_substring");
  })
  .test("API: POST /api/v1/search/hybrid computes conceptual synonym scoring boosts", async () => {
    // "auth" conceptually maps to synonyms ["token", "session", "login", etc.]
    const payload = {
      queryText: "auth",
      strategy: "hybrid",
    };

    const res = await tenantRequest(tenant1, "POST", "/api/v1/search/hybrid", payload);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);

    // Verify that the document with jwt access tokens is boosted and scored
    const topResult = res.body.data[0];
    assert.ok(topResult.score > 0);
  })
  .test("API: POST /api/v1/search/suggest returns autocomplete query terms", async () => {
    const res = await tenantRequest(tenant1, "POST", "/api/v1/search/suggest", { queryText: "validation" });

    console.log("SUGGEST TEST OUTPUT:", res.body);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data[0].toLowerCase().includes("validation"));
  })
  .test("API: GET /api/v1/search/facets retrieves accurate aggregated metadata facets", async () => {
    const res = await tenantRequest(tenant1, "GET", "/api/v1/search/facets?fields=category,tier");

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.category.length >= 2);

    const categories = res.body.data.category.map((c: any) => c.value);
    assert.ok(categories.includes("security"));
    assert.ok(categories.includes("developer"));
  })
  .test("API: GET /api/v1/search/statistics retrieves telemetry metrics", async () => {
    const res = await tenantRequest(tenant1, "GET", "/api/v1/search/statistics");

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.totalQueries >= 1);
    assert.ok(res.body.data.totalIndexes >= 3);
  })
  .test("API: GET /api/v1/search/history retrieves query log of environment", async () => {
    const res = await tenantRequest(tenant1, "GET", "/api/v1/search/history");

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data[0].queryText !== "");
  })
  .test("API: POST /api/v1/search/feedback records clicked events and ratings", async () => {
    const payload = {
      queryId: "query_abc_777",
      documentId: "doc_policy_101",
      clicked: true,
      rating: 5,
    };

    const res = await tenantRequest(tenant1, "POST", "/api/v1/search/feedback", payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.queryId, "query_abc_777");
    assert.equal(res.body.data.clicked, true);
    assert.equal(res.body.data.rating, 5);
  })
  .test("API: DELETE /api/v1/search/:documentId removes indexed item and decrements telemetry", async () => {
    // 1. Get initial total indexes count
    const statsBefore = await db.client.searchStatistic.findUnique({
      where: { environmentId: tenant1.environmentId },
    });
    const beforeCount = statsBefore?.totalIndexes || 0;

    // 2. Delete document
    const res = await tenantRequest(tenant1, "DELETE", "/api/v1/search/doc_faq_201");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // 3. Verify statistics decremented
    const statsAfter = await db.client.searchStatistic.findUnique({
      where: { environmentId: tenant1.environmentId },
    });
    const afterCount = statsAfter?.totalIndexes || 0;

    assert.equal(afterCount, beforeCount - 1);

    // 4. Verify search no longer returns it
    const searchRes = await tenantRequest(tenant1, "POST", "/api/v1/search", { queryText: "rotate API keys" });
    assert.equal(searchRes.body.data.length, 0);
  });

export { runner };
