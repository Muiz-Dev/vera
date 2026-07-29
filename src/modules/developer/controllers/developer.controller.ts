import type { Request, Response, NextFunction } from "express";
import { DeveloperService } from "../services/developer.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import {
  RegisterDeveloperSchema,
  LoginDeveloperSchema,
  CreateApplicationSchema,
  UpdateApplicationSchema,
  AddAllowedOriginSchema,
  UpdateSettingsSchema,
} from "../validators/developer.validator";
import { AppError } from "../../../core/errors";

export class DeveloperController {
  constructor(private readonly service: DeveloperService) {}

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
   * POST /api/v1/developers/register
   */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = RegisterDeveloperSchema.parse(req.body);
      const developer = await this.service.registerDeveloper(validated);
      ResponseFormatter.success(res, developer, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/developers/login
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = LoginDeveloperSchema.parse(req.body);
      const developer = await this.service.loginDeveloper(validated);
      ResponseFormatter.success(res, developer, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/applications
   */
  createApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validated = CreateApplicationSchema.parse(req.body);
      const app = await this.service.createApplication(developerId, validated);
      ResponseFormatter.success(res, app, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/applications/:id
   */
  getApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const app = await this.service.getApplication(developerId, id);
      ResponseFormatter.success(res, app, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/applications
   */
  listApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const apps = await this.service.listApplications(developerId);
      ResponseFormatter.success(res, apps, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/applications/:id
   */
  updateApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const validated = UpdateApplicationSchema.parse(req.body);
      const app = await this.service.updateApplication(developerId, id, validated);
      ResponseFormatter.success(res, app, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/applications/:id
   */
  deleteApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      await this.service.deleteApplication(developerId, id);
      ResponseFormatter.success(res, { message: "Application soft deleted successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/environments/:environmentId/keys/rotate
   */
  rotateKeys = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const keys = await this.service.rotateKeys(developerId, environmentId);
      ResponseFormatter.success(res, keys, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/environments/:environmentId/settings
   */
  getSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const settings = await this.service.getSettings(developerId, environmentId);
      ResponseFormatter.success(res, settings, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/environments/:environmentId/settings
   */
  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const validated = UpdateSettingsSchema.parse(req.body);
      const settings = await this.service.updateSettings(developerId, environmentId, validated);
      ResponseFormatter.success(res, settings, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/environments/:environmentId/origins
   */
  addAllowedOrigin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const validated = AddAllowedOriginSchema.parse(req.body);
      const origin = await this.service.addAllowedOrigin(developerId, environmentId, validated.origin);
      ResponseFormatter.success(res, origin, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/environments/:environmentId/origins/:id
   */
  removeAllowedOrigin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const id = this.extractParam(req, "id");
      await this.service.removeAllowedOrigin(developerId, environmentId, id);
      ResponseFormatter.success(res, { message: "Allowed origin removed successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/environments/:environmentId/origins
   */
  listAllowedOrigins = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const environmentId = this.extractParam(req, "environmentId");
      const origins = await this.service.listAllowedOrigins(developerId, environmentId);
      ResponseFormatter.success(res, origins, 200);
    } catch (error) {
      next(error);
    }
  };
}
export default DeveloperController;
