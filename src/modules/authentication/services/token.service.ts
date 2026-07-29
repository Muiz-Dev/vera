import jwt from "jsonwebtoken";
import configService from "../../../core/config/config.service";
import Logger from "../../../core/logging/logger";
import { type JWTPayload } from "../types/authentication.types";
import { AppError } from "../../../core/errors";

export class TokenService {
  private readonly secret: string;

  constructor() {
    this.secret = configService.security.jwtSecret;
  }

  /**
   * Signs an access token containing the custom payload.
   * Short-lived (e.g., 15 minutes / 900 seconds).
   */
  signAccessToken(payload: JWTPayload): string {
    try {
      return jwt.sign(payload, this.secret, {
        expiresIn: "15m",
      });
    } catch (err) {
      Logger.error("Error signing JWT access token", err);
      throw new AppError("Failed to generate access token", "ERR_INTERNAL", 500);
    }
  }

  /**
   * Verifies the given access token and returns its decoded payload.
   * Throws if the token is expired, has an invalid signature, or is corrupt.
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.secret) as JWTPayload;
    } catch (err: any) {
      Logger.warn(`JWT verification failed: ${err.message}`);
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError("Access token has expired", "ERR_UNAUTHORIZED", 401);
      }
      throw new AppError("Invalid access token", "ERR_UNAUTHORIZED", 401);
    }
  }
}
