export interface IndexedDocument {
  documentId: string;
  type: string;
  title: string;
  content: string;
  metadata: any;
  score?: number;
}

export interface SearchOptions {
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  strategy?: string; // "text", "semantic", "hybrid"
}

export interface SearchResult {
  results: IndexedDocument[];
  total: number;
  executionTimeMs: number;
}

export interface SearchProvider {
  name: string;

  index(
    environmentId: string,
    documentId: string,
    type: string,
    title: string,
    content: string,
    metadata: any
  ): Promise<IndexedDocument>;

  bulkIndex(
    environmentId: string,
    documents: Array<{
      documentId: string;
      type: string;
      title: string;
      content: string;
      metadata: any;
    }>
  ): Promise<number>;

  delete(environmentId: string, documentId: string): Promise<boolean>;

  search(
    environmentId: string,
    queryText: string,
    options?: SearchOptions
  ): Promise<SearchResult>;

  suggest(environmentId: string, queryText: string): Promise<string[]>;

  getFacets(
    environmentId: string,
    queryText: string,
    fields: string[]
  ): Promise<Record<string, Array<{ value: string; count: number }>>>;
}
