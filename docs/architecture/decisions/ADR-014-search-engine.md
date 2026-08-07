# ADR-014: Search Engine Module

## Status
Approved

## Date
2026-08-07

## Context
Vera serves as an enterprise-wide developer identity platform. As the ecosystem expands, developers and autonomous agents need a centralized way to locate, rank, filter, and retrieve structured and unstructured resources (such as identities, applications, and organizations) without direct, slow relational database querying.

Traditional SQL indexes or exact-match relational filters are insufficient for natural-language discovery, fuzzy matching, dynamic facets aggregation, autocomplete query suggestions, and ranking. Therefore, we needed to design a centralized Search Engine discovery module.

## Decision
We implemented a secure, modular **Search Engine discovery platform** featuring:
- **Modular Monolith Integration:** Stored under `src/modules/search/`, completely decoupled from existing business domains.
- **Provider-Based Abstraction:** Built around a standard `SearchProvider` interface allowing the search engine to remain completely database-agnostic. The default provider is `PostgresSearchProvider` (utilizing PostgreSQL case-insensitive substring and full-text querying), while remaining seamlessly pluggable for Meilisearch, Elasticsearch, or Vector Embeddings (semantic search) in the future.
- **Event-Driven Automatic Indexing:** Subscribers listen on the in-process `EventBus` for core platform lifecycle events (like `IdentityCreated`, `IdentityUpdated`, `ApplicationCreated`, and `OrganizationCreated`) to dynamically index platform objects without direct module coupling.
- **Public Developer-Facing Indexing & Search APIs:** Exposes CRUD indexing endpoints so that external developers can index their own custom business data and use Vera as a hosted Search-as-a-Service.
- **Multi-Tenant Environment Isolation:** All indexed records, suggestions, feedback, and telemetry metrics are partitioned by `environmentId` resolved securely through `environmentResolverMiddleware` and `RequestContext`. Clients can never supply an `environmentId` directly.
- **TypeScript-Level Ranking & Similarity Pipeline:** Evaluates scores based on exact matches, prefix matches, query token matches, and metadata pushes (featured/boost/popularity values).
- **Metadata Filtering & Facets Aggregation:** Supports complex search queries with multiple recursive JSON metadata filters, producing dynamically aggregated facets.

## Alternatives Considered
1. **Direct Elasticsearch Integration:** Force immediate adoption of Elasticsearch or Meilisearch as the baseline dependency. Rejected because it introduces heavy external dependencies during early-stage modular monolith development and increases local development bootstrapping complexity.
2. **Raw Relational SQL Joins:** Write monolithic raw queries across all tables in a single SQL query. Rejected because it breaks domain isolation boundaries (e.g. Search engine querying Identity or Organization credentials directly), doesn't support complex ranking/scoring multipliers, and is hard to migrate to semantic/vector search.

## Consequences
- **Positive:**
  - Pluggable provider interface supports simple local testing (PostgreSQL/Prisma) while enabling Meilisearch or Vector Search in production with zero business logic changes.
  - Complete environment isolation protects tenant boundaries.
  - Ranking pipeline enables fine-grained query scoring control.
- **Negative:**
  - Pulling candidate records for in-memory TS scoring/metadata filtering in PostgreSQL provider is optimal for early scale but would require indexing offload (e.g., Elasticsearch provider) for databases with hundreds of millions of documents.

## Future Considerations
As the volume of documents climbs, we will implement the Meilisearch or Elasticsearch provider and offload search/bulk indexing calls to a dedicated cluster, keeping our public Express routing endpoints unchanged.
