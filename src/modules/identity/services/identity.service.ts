import { BaseService } from "../../../core/base/base.service";
import { IdentityRepository } from "../repositories/identity.repository";
import { type IdentityEntity } from "../entities/identity.entity";
import { IdentityStatus } from "../../../generated/prisma/client";
import { AppError, NotFoundError } from "../../../core/errors";
import { EventBus } from "../../../core/events/event.bus";
import {
  IdentityCreatedEvent,
  IdentityUpdatedEvent,
  IdentityDeletedEvent,
  IdentitySuspendedEvent,
} from "../events/identity.events";

export class IdentityService extends BaseService {
  constructor(private readonly identityRepository: IdentityRepository) {
    super();
  }

  /**
   * Retrieves an identity by ID.
   */
  async getIdentity(id: string): Promise<IdentityEntity> {
    const identity = await this.identityRepository.findById(id);
    if (!identity) {
      throw new NotFoundError(`Identity with ID '${id}' not found`);
    }
    return identity;
  }

  /**
   * Creates a new Identity with an optional Profile.
   */
  async createIdentity(data: {
    email?: string;
    phone?: string;
    status?: IdentityStatus;
    profile?: {
      firstName?: string;
      lastName?: string;
      avatar?: string;
      displayName?: string;
      metadata?: any;
    };
  }): Promise<IdentityEntity> {
    // Check if unique email already exists
    if (data.email) {
      const existing = await this.identityRepository.findByEmail(data.email);
      if (existing) {
        throw new AppError("An identity with this email already exists", "ERR_VALIDATION_FAILED", 400);
      }
    }

    // Check if unique phone already exists
    if (data.phone) {
      const existing = await this.identityRepository.findByPhone(data.phone);
      if (existing) {
        throw new AppError("An identity with this phone already exists", "ERR_VALIDATION_FAILED", 400);
      }
    }

    // Safe unpack for exactOptionalPropertyTypes
    const repoPayload: {
      email?: string;
      phone?: string;
      status: IdentityStatus;
      profile?: {
        firstName?: string;
        lastName?: string;
        avatar?: string;
        displayName?: string;
        metadata?: any;
      };
    } = {
      status: data.status || IdentityStatus.PENDING,
    };

    if (data.email !== undefined) repoPayload.email = data.email;
    if (data.phone !== undefined) repoPayload.phone = data.phone;
    if (data.profile !== undefined) {
      repoPayload.profile = {};
      if (data.profile.firstName !== undefined) repoPayload.profile.firstName = data.profile.firstName;
      if (data.profile.lastName !== undefined) repoPayload.profile.lastName = data.profile.lastName;
      if (data.profile.avatar !== undefined) repoPayload.profile.avatar = data.profile.avatar;
      if (data.profile.displayName !== undefined) repoPayload.profile.displayName = data.profile.displayName;
      if (data.profile.metadata !== undefined) repoPayload.profile.metadata = data.profile.metadata;
    }

    const identity = await this.identityRepository.create(repoPayload);

    this.logger.info(`Identity successfully created: ${identity.id}`);

    // Publish IdentityCreatedEvent
    await EventBus.publish(
      new IdentityCreatedEvent({
        id: identity.id,
        email: identity.email ?? null,
        phone: identity.phone ?? null,
        status: identity.status,
      })
    );

    return identity;
  }

  /**
   * Updates an existing identity.
   */
  async updateIdentity(
    id: string,
    data: {
      email?: string;
      phone?: string;
      profile?: {
        firstName?: string;
        lastName?: string;
        avatar?: string;
        displayName?: string;
        metadata?: any;
      };
    }
  ): Promise<IdentityEntity> {
    const existing = await this.getIdentity(id);

    // Validate email uniqueness if email is changed
    if (data.email && data.email !== existing.email) {
      const duplicate = await this.identityRepository.findByEmail(data.email);
      if (duplicate) {
        throw new AppError("An identity with this email already exists", "ERR_VALIDATION_FAILED", 400);
      }
    }

    // Validate phone uniqueness if phone is changed
    if (data.phone && data.phone !== existing.phone) {
      const duplicate = await this.identityRepository.findByPhone(data.phone);
      if (duplicate) {
        throw new AppError("An identity with this phone already exists", "ERR_VALIDATION_FAILED", 400);
      }
    }

    // Safe unpack for exactOptionalPropertyTypes
    const repoPayload: {
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

    if (data.email !== undefined) repoPayload.email = data.email;
    if (data.phone !== undefined) repoPayload.phone = data.phone;
    if (data.profile !== undefined) {
      repoPayload.profile = {};
      if (data.profile.firstName !== undefined) repoPayload.profile.firstName = data.profile.firstName;
      if (data.profile.lastName !== undefined) repoPayload.profile.lastName = data.profile.lastName;
      if (data.profile.avatar !== undefined) repoPayload.profile.avatar = data.profile.avatar;
      if (data.profile.displayName !== undefined) repoPayload.profile.displayName = data.profile.displayName;
      if (data.profile.metadata !== undefined) repoPayload.profile.metadata = data.profile.metadata;
    }

    const updated = await this.identityRepository.update(id, repoPayload);

    this.logger.info(`Identity successfully updated: ${id}`);

    // Publish IdentityUpdatedEvent
    await EventBus.publish(
      new IdentityUpdatedEvent({
        id: updated.id,
        email: updated.email ?? null,
        phone: updated.phone ?? null,
        status: updated.status,
      })
    );

    return updated;
  }

  /**
   * Soft-deletes an identity (sets deletedAt and updates status to DEACTIVATED).
   */
  async deleteIdentity(id: string): Promise<IdentityEntity> {
    const existing = await this.getIdentity(id);

    const deleted = await this.identityRepository.update(id, {
      status: IdentityStatus.DEACTIVATED,
      deletedAt: new Date(),
    });

    this.logger.info(`Identity soft-deleted successfully: ${id}`);

    // Publish IdentityDeletedEvent
    await EventBus.publish(
      new IdentityDeletedEvent({
        id: deleted.id,
        deletedAt: deleted.deletedAt!,
      })
    );

    return deleted;
  }

  /**
   * Suspends an active/pending identity.
   */
  async suspendIdentity(id: string, reason?: string): Promise<IdentityEntity> {
    const existing = await this.getIdentity(id);

    if (existing.status === IdentityStatus.SUSPENDED) {
      throw new AppError("Identity is already suspended", "ERR_VALIDATION_FAILED", 400);
    }

    const finalReason = reason || "Suspended by administrator";

    const suspended = await this.identityRepository.update(id, {
      status: IdentityStatus.SUSPENDED,
    });

    this.logger.info(`Identity suspended successfully: ${id}. Reason: ${finalReason}`);

    // Publish IdentitySuspendedEvent
    await EventBus.publish(
      new IdentitySuspendedEvent({
        id: suspended.id,
        reason: finalReason,
        suspendedAt: new Date(),
      })
    );

    return suspended;
  }
}
