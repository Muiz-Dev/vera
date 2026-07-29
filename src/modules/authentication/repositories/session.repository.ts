import { BaseRepository } from "../../../core/base/base.repository";
import { type SessionEntity, type RefreshTokenEntity } from "../entities/credential.entity";

export class SessionRepository extends BaseRepository<SessionEntity> {
  /**
   * Finds an active non-revoked session by ID.
   */
  async findById(id: string): Promise<SessionEntity | null> {
    return this.db.session.findFirst({
      where: {
        id,
        revokedAt: null,
      },
    });
  }

  /**
   * Creates a new session.
   */
  async createSession(data: {
    identityId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    expiresInDays: number;
  }): Promise<SessionEntity> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

    return this.db.session.create({
      data: {
        identityId: data.identityId,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        expiresAt,
      },
    });
  }

  /**
   * Revokes an active session by setting revokedAt.
   */
  async revokeSession(id: string): Promise<SessionEntity> {
    return this.db.session.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Revokes all active sessions for an identity (e.g. for complete logout or password change).
   */
  async revokeAllSessions(identityId: string): Promise<void> {
    await this.db.session.updateMany({
      where: {
        identityId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Updates last active timestamp.
   */
  async updateLastActive(id: string): Promise<void> {
    await this.db.session.update({
      where: { id },
      data: {
        lastActiveAt: new Date(),
      },
    });
  }

  /**
   * Creates a Refresh Token attached to a Session.
   */
  async createRefreshToken(sessionId: string, token: string, expiresInDays: number): Promise<RefreshTokenEntity> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    return this.db.refreshToken.create({
      data: {
        sessionId,
        token,
        expiresAt,
      },
    });
  }

  /**
   * Finds a non-revoked Refresh Token.
   */
  async findRefreshToken(token: string): Promise<(RefreshTokenEntity & { session: SessionEntity }) | null> {
    const record = await this.db.refreshToken.findFirst({
      where: {
        token,
        revokedAt: null,
        session: {
          revokedAt: null,
        },
      },
      include: {
        session: true,
      },
    });

    if (!record) return null;
    return record as any;
  }

  /**
   * Revokes a specific Refresh Token.
   */
  async revokeRefreshToken(id: string): Promise<RefreshTokenEntity> {
    return this.db.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Revokes all refresh tokens associated with a session.
   */
  async revokeAllRefreshTokensForSession(sessionId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: {
        sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
