import type { Request, Response, NextFunction } from "express";
import { OrganizationService } from "../services/organization.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import { AppError } from "../../../core/errors";
import { DeveloperRepository } from "../../developer/repositories/developer.repository";
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  InviteMemberSchema,
  TransferOwnershipSchema,
} from "../validators/organization.validator";

const developerRepository = new DeveloperRepository();

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

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
   * POST /api/v1/organizations
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const validated = CreateOrganizationSchema.parse(req.body);
      const org = await this.service.createOrganization(developerId, validated);
      ResponseFormatter.success(res, org, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations
   */
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const orgs = await this.service.listOrganizations(developerId);
      ResponseFormatter.success(res, orgs, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:id
   */
  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const org = await this.service.getOrganization(id, developerId);
      ResponseFormatter.success(res, org, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:id
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const validated = UpdateOrganizationSchema.parse(req.body);
      const org = await this.service.updateOrganization(id, developerId, validated);
      ResponseFormatter.success(res, org, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:id
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      await this.service.deleteOrganization(id, developerId);
      ResponseFormatter.success(res, { message: "Organization soft deleted successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:id/members
   */
  listMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const members = await this.service.listMembers(id, developerId);
      ResponseFormatter.success(res, members, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:id/members/:developerId
   */
  removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const memberId = this.extractParam(req, "developerId");
      await this.service.removeMember(id, actorId, memberId);
      ResponseFormatter.success(res, { message: "Member removed from organization successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:id/transfer-ownership
   */
  transferOwnership = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const validated = TransferOwnershipSchema.parse(req.body);
      await this.service.transferOwnership(id, ownerId, validated.developerId);
      ResponseFormatter.success(res, { message: "Ownership transferred successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:id/invitations
   */
  inviteMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const validated = InviteMemberSchema.parse(req.body);
      const invitation = await this.service.inviteMember(id, actorId, validated);
      ResponseFormatter.success(res, invitation, 201);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:id/invitations
   */
  listInvitations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const invitations = await this.service.listInvitations(id, developerId);
      ResponseFormatter.success(res, invitations, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/invitations/:token/accept
   */
  acceptInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const token = this.extractParam(req, "token");

      // Retrieve developer's email
      const dev = await developerRepository.findDeveloperById(developerId);
      if (!dev) {
        throw new AppError("Developer not found", "ERR_NOT_FOUND", 404);
      }

      await this.service.acceptInvitation(token, developerId, dev.email);
      ResponseFormatter.success(res, { message: "Invitation accepted and joined organization successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:id/invitations/:invitationId/revoke
   */
  revokeInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const invitationId = this.extractParam(req, "invitationId");
      await this.service.revokeInvitation(id, actorId, invitationId);
      ResponseFormatter.success(res, { message: "Invitation revoked successfully" }, 200);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:id/activities
   */
  listActivities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const developerId = this.extractDeveloperId(req);
      const id = this.extractParam(req, "id");
      const activities = await this.service.listActivities(id, developerId);
      ResponseFormatter.success(res, activities, 200);
    } catch (error) {
      next(error);
    }
  };
}
export default OrganizationController;
