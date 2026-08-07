import { z } from "zod";

export const SearchRequestSchema = z.object({
  queryText: z.string().optional().default(""),
  filters: z.record(z.any()).optional(),
  limit: z.number().int().positive().optional().default(10),
  offset: z.number().int().nonnegative().optional().default(0),
  strategy: z.enum(["text", "semantic", "hybrid"]).optional().default("text"),
});

export const IndexDocumentSchema = z.object({
  documentId: z.string().min(1, "documentId is required"),
  type: z.string().min(1, "type is required"),
  title: z.string().min(1, "title is required"),
  content: z.string().min(1, "content is required"),
  metadata: z.record(z.any()).optional().default({}),
});

export const BulkIndexSchema = z.object({
  documents: z.array(IndexDocumentSchema).nonempty("At least one document is required"),
});

export const SuggestRequestSchema = z.object({
  queryText: z.string().min(1, "queryText is required"),
});

export const FacetsRequestSchema = z.object({
  queryText: z.string().optional().default(""),
  fields: z.array(z.string()).nonempty("At least one facet field is required"),
});

export const FeedbackRequestSchema = z.object({
  queryId: z.string().min(1, "queryId is required"),
  documentId: z.string().min(1, "documentId is required"),
  clicked: z.boolean(),
  rating: z.number().int().min(1).max(5).optional(),
});
