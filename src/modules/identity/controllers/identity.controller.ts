import type { Request, Response, NextFunction } from "express";
import { IdentityService } from "../services/identity.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import {
  CreateIdentitySchema,
  UpdateIdentitySchema,
  SuspendIdentitySchema,
} from "../validators/identity.validator";
import { AppError } from "../../../core/errors";

export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  private extractId(req: Request): string {
    const { id } = req.params;
    if (!id || typeof id !== "string") {
      throw new AppError("ID parameter is required and must be a string", "ERR_VALIDATION_FAILED", 400);
    }
    return id;
  }

  /**
   * GET /api/v1/identities/:id
   */
  getIdentity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const identity = await this.identityService.getIdentity(id);
      ResponseFormatter.success(res, identity, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/identities
   */
  createIdentity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Zod Validation
      const validated = CreateIdentitySchema.parse(req.body);

      const payload: {
        email?: string;
        phone?: string;
        profile?: {
          firstName?: string;
          lastName?: string;
          avatar?: string;
          displayName?: string;
          metadata?: any;
        };
      } = {};

      if (validated.email !== undefined) payload.email = validated.email;
      if (validated.phone !== undefined) payload.phone = validated.phone;
      if (validated.profile !== undefined) {
        payload.profile = {};
        if (validated.profile.firstName !== undefined) payload.profile.firstName = validated.profile.firstName;
        if (validated.profile.lastName !== undefined) payload.profile.lastName = validated.profile.lastName;
        if (validated.profile.avatar !== undefined) payload.profile.avatar = validated.profile.avatar;
        if (validated.profile.displayName !== undefined) payload.profile.displayName = validated.profile.displayName;
        if (validated.profile.metadata !== undefined) payload.profile.metadata = validated.profile.metadata;
      }

      const identity = await this.identityService.createIdentity(payload);
      ResponseFormatter.success(res, identity, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/identities/:id
   */
  updateIdentity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const validated = UpdateIdentitySchema.parse(req.body);

      const payload: {
        email?: string;
        phone?: string;
        profile?: {
          firstName?: string;
          lastName?: string;
          avatar?: string;
          displayName?: string;
          metadata?: any;
        };
      } = {};

      if (validated.email !== undefined) payload.email = validated.email;
      if (validated.phone !== undefined) payload.phone = validated.phone;
      if (validated.profile !== undefined) {
        payload.profile = {};
        if (validated.profile.firstName !== undefined) payload.profile.firstName = validated.profile.firstName;
        if (validated.profile.lastName !== undefined) payload.profile.lastName = validated.profile.lastName;
        if (validated.profile.avatar !== undefined) payload.profile.avatar = validated.profile.avatar;
        if (validated.profile.displayName !== undefined) payload.profile.displayName = validated.profile.displayName;
        if (validated.profile.metadata !== undefined) payload.profile.metadata = validated.profile.metadata;
      }

      const identity = await this.identityService.updateIdentity(id, payload);
      ResponseFormatter.success(res, identity, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/identities/:id
   */
  deleteIdentity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const identity = await this.identityService.deleteIdentity(id);
      ResponseFormatter.success(res, {
        id: identity.id,
        status: identity.status,
        deletedAt: identity.deletedAt,
      }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/identities/:id/suspend
   */
  suspendIdentity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const validated = SuspendIdentitySchema.parse(req.body || {});

      const identity = await this.identityService.suspendIdentity(id, validated?.reason);
      ResponseFormatter.success(res, {
        id: identity.id,
        status: identity.status,
      }, 200);
    } catch (error) {
      next(error);
    }
  };
}
