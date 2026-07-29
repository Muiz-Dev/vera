import { PermissionResolver } from "./permission.resolver";
import { EventBus } from "../../../core/events/event.bus";
import { randomUUID } from "crypto";

export class PermissionEvaluator {
  constructor(private readonly permissionResolver: PermissionResolver) {}

  /**
   * Evaluates if an identity has a specific permission.
   */
  async evaluate(identityId: string, permissionName: string, actorId?: string, correlationId?: string): Promise<boolean> {
    const { permissions } = await this.permissionResolver.resolve(identityId);

    const decision = permissions.includes(permissionName) ? "GRANT" : "DENY";

    // Publish AuthorizationEvaluated event with metadata
    await EventBus.publish({
      eventName: "AuthorizationEvaluated",
      timestamp: new Date(),
      payload: {
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        actorId: actorId ?? identityId,
        correlationId: correlationId ?? randomUUID(),
        identityId,
        permission: permissionName,
        decision,
      },
    });

    return decision === "GRANT";
  }
}
