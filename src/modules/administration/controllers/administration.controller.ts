import type { Request, Response, NextFunction } from "express";
import { AdministrationService } from "../services/administration.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import { AppError } from "../../../core/errors";
import {
  DeveloperQuerySchema,
  ApplicationQuerySchema,
  OrganizationQuerySchema,
  NotificationQuerySchema,
  OrgActivityQuerySchema,
  NotificationLogQuerySchema,
  UpdateSettingsSchema,
} from "../validators/administration.validator";

export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}

  private extractDeveloperId(req: Request): string {
    const devId = req.headers["x-developer-id"];
    if (!devId || typeof devId !== "string") {
      throw new AppError("Developer ID is required in headers (x-developer-id)", "ERR_UNAUTHORIZED", 401);
    }
    return devId;
  }

  private extractParam(req: Request, name: string): string {
    const val = req.params[name];
    if (!val || typeof val !== "string") {
      throw new AppError(`Parameter '${name}' is required and must be a string`, "ERR_VALIDATION_FAILED", 400);
    }
    return val;
  }

  /**
   * GET /api/v1/administration/statistics
   */
  getStatistics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const stats = await this.service.getStatistics(developerId);
      ResponseFormatter.success(res, stats, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/developers
   */
  listDevelopers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validatedQuery = DeveloperQuerySchema.parse(req.query);
      const result = await this.service.listDevelopers(developerId, validatedQuery);
      ResponseFormatter.success(res, result.data, 200, { pagination: result.meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/applications
   */
  listApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validatedQuery = ApplicationQuerySchema.parse(req.query);
      const result = await this.service.listApplications(developerId, validatedQuery);
      ResponseFormatter.success(res, result.data, 200, { pagination: result.meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/organizations
   */
  listOrganizations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validatedQuery = OrganizationQuerySchema.parse(req.query);
      const result = await this.service.listOrganizations(developerId, validatedQuery);
      ResponseFormatter.success(res, result.data, 200, { pagination: result.meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/notifications
   */
  listNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validatedQuery = NotificationQuerySchema.parse(req.query);
      const result = await this.service.listNotifications(developerId, validatedQuery);
      ResponseFormatter.success(res, result.data, 200, { pagination: result.meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/audit-logs/organization-activities
   */
  listOrganizationActivities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validatedQuery = OrgActivityQuerySchema.parse(req.query);
      const result = await this.service.listOrganizationActivities(developerId, validatedQuery);
      ResponseFormatter.success(res, result.data, 200, { pagination: result.meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/audit-logs/notification-logs
   */
  listNotificationLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validatedQuery = NotificationLogQuerySchema.parse(req.query);
      const result = await this.service.listNotificationLogs(developerId, validatedQuery);
      ResponseFormatter.success(res, result.data, 200, { pagination: result.meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/administration/settings/:environmentId
   */
  getEnvironmentSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const settings = await this.service.getEnvironmentSettings(developerId, environmentId);
      ResponseFormatter.success(res, settings, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/administration/settings/:environmentId
   */
  updateEnvironmentSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const validatedBody = UpdateSettingsSchema.parse(req.body);
      const settings = await this.service.updateEnvironmentSettings(developerId, environmentId, validatedBody);
      ResponseFormatter.success(res, settings, 200);
    } catch (error) {
      next(error);
    }
  };
}
export default AdministrationController;
