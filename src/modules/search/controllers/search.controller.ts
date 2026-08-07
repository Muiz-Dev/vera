import type { Request, Response, NextFunction } from "express";
import { SearchService } from "../services/search.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import { AppError } from "../../../core/errors";
import { RequestContext } from "../../../core/http/context/request-context";
import {
  SearchRequestSchema,
  IndexDocumentSchema,
  BulkIndexSchema,
  SuggestRequestSchema,
  FacetsRequestSchema,
  FeedbackRequestSchema,
} from "../validators/search.validator";

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  private getEnvironmentId(req: Request): string {
    const envId = req.environmentId || RequestContext.environmentId;
    if (!envId) {
      throw new AppError(
        "Environment context is missing. Please provide a valid API key, JWT, or x-environment-id header.",
        "ERR_VALIDATION_FAILED",
        400
      );
    }
    return envId;
  }

  private getUserId(req: Request): string | undefined {
    // If bearer authentication populated req.auth or standard auth claims, extract subject
    const auth = (req as any).auth;
    return auth?.sub || undefined;
  }

  /**
   * POST /api/v1/search
   */
  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const validated = SearchRequestSchema.parse(req.body);
      const userId = this.getUserId(req);

      const result = await this.searchService.search(
        envId,
        validated.queryText || "",
        {
          filters: validated.filters,
          limit: validated.limit,
          offset: validated.offset,
          strategy: validated.strategy,
        },
        userId
      );

      ResponseFormatter.success(res, result.results, 200, {
        total: result.total,
        executionTimeMs: result.executionTimeMs,
        strategy: validated.strategy,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/search/index
   */
  index = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const validated = IndexDocumentSchema.parse(req.body);

      const result = await this.searchService.index(
        envId,
        validated.documentId,
        validated.type,
        validated.title,
        validated.content,
        validated.metadata
      );

      ResponseFormatter.success(res, result, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/search/bulk
   */
  bulk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const validated = BulkIndexSchema.parse(req.body);

      const result = await this.searchService.bulkIndex(envId, validated.documents);
      ResponseFormatter.success(res, result, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/search/hybrid
   */
  hybrid = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const validated = SearchRequestSchema.parse(req.body);
      const userId = this.getUserId(req);

      const result = await this.searchService.search(
        envId,
        validated.queryText || "",
        {
          filters: validated.filters,
          limit: validated.limit,
          offset: validated.offset,
          strategy: "hybrid",
        },
        userId
      );

      ResponseFormatter.success(res, result.results, 200, {
        total: result.total,
        executionTimeMs: result.executionTimeMs,
        strategy: "hybrid",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/search/suggest
   */
  suggest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const validated = SuggestRequestSchema.parse(req.body);

      const result = await this.searchService.suggest(envId, validated.queryText);
      ResponseFormatter.success(res, result, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/search/:documentId
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const documentId = req.params.documentId;
      if (!documentId) {
        throw new AppError("documentId parameter is required", "ERR_VALIDATION_FAILED", 400);
      }

      const success = await this.searchService.delete(envId, documentId);
      if (!success) {
        throw new AppError("Document not found or could not be deleted", "ERR_NOT_FOUND", 404);
      }

      ResponseFormatter.success(res, { success: true }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/search/history
   */
  history = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const userId = this.getUserId(req);

      const history = await this.searchService.getHistory(envId, userId);
      ResponseFormatter.success(res, history, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/search/statistics
   */
  statistics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);

      const stats = await this.searchService.getStatistics(envId);
      ResponseFormatter.success(res, stats, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/search/facets
   */
  facets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);

      // Fields can be parsed from query parameters
      const fieldsParam = req.query.fields;
      let fields: string[] = [];
      if (typeof fieldsParam === "string") {
        fields = fieldsParam.split(",").map((f) => f.trim());
      } else if (Array.isArray(fieldsParam)) {
        fields = fieldsParam.map((f) => String(f).trim());
      }

      if (fields.length === 0) {
        throw new AppError("At least one facet field is required in 'fields' query parameter", "ERR_VALIDATION_FAILED", 400);
      }

      const queryText = typeof req.query.queryText === "string" ? req.query.queryText : "";

      const facets = await this.searchService.getFacets(envId, queryText, fields);
      ResponseFormatter.success(res, facets, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/search/feedback
   */
  feedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const envId = this.getEnvironmentId(req);
      const validated = FeedbackRequestSchema.parse(req.body);

      const result = await this.searchService.recordFeedback(
        envId,
        validated.queryId,
        validated.documentId,
        validated.clicked,
        validated.rating
      );

      ResponseFormatter.success(res, result, 201);
    } catch (error) {
      next(error);
    }
  };
}
export default SearchController;
