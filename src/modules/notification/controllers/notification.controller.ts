import type { Request, Response, NextFunction } from "express";
import { NotificationService } from "../services/notification.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  SendTestNotificationSchema,
} from "../validators/notification.validator";
import { AppError } from "../../../core/errors";

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  private extractParam(req: Request, name: string): string {
    const val = req.params[name];
    if (!val || typeof val !== "string") {
      throw new AppError(`Parameter '${name}' is required`, "ERR_VALIDATION_FAILED", 400);
    }
    return val;
  }

  listNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = {
        status: req.query["status"] as string,
        recipient: req.query["recipient"] as string,
        developerId: req.query["developerId"] as string,
        identityId: req.query["identityId"] as string,
        organizationId: req.query["organizationId"] as string,
      };
      const notifications = await this.service.listNotifications(filters);
      ResponseFormatter.success(res, notifications, 200);
    } catch (error) {
      next(error);
    }
  };

  getNotificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractParam(req, "id");
      const notification = await this.service.getNotificationById(id);
      ResponseFormatter.success(res, notification, 200);
    } catch (error) {
      next(error);
    }
  };

  listTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templates = await this.service.listTemplates();
      ResponseFormatter.success(res, templates, 200);
    } catch (error) {
      next(error);
    }
  };

  createTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = CreateTemplateSchema.parse(req.body);
      const template = await this.service.createTemplate(validated);
      ResponseFormatter.success(res, template, 201);
    } catch (error) {
      next(error);
    }
  };

  updateTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractParam(req, "id");
      const validated = UpdateTemplateSchema.parse(req.body);
      const template = await this.service.updateTemplate(id, validated);
      ResponseFormatter.success(res, template, 200);
    } catch (error) {
      next(error);
    }
  };

  deleteTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractParam(req, "id");
      await this.service.deleteTemplate(id);
      ResponseFormatter.success(res, { success: true }, 200);
    } catch (error) {
      next(error);
    }
  };

  sendTestNotification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = SendTestNotificationSchema.parse(req.body);
      const notification = await this.service.sendTestNotification(validated);
      ResponseFormatter.success(res, notification, 201);
    } catch (error) {
      next(error);
    }
  };
}
export default NotificationController;
