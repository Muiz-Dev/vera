import argon2 from "argon2";
import crypto from "crypto";
import Logger from "../../../core/logging/logger";

export class PasswordService {
  /**
   * Hashes a password using Argon2id.
   */
  async hash(password: string): Promise<string> {
    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
      });
    } catch (err) {
      Logger.error("Failed to hash password with Argon2id", err);
      throw err;
    }
  }

  /**
   * Verifies a password against an Argon2id hash.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (err) {
      Logger.error("Argon2 verification failed", err);
      return false;
    }
  }

  /**
   * Performs a dummy password verification to protect against timing attacks when a user is not found.
   */
  async dummyVerify(): Promise<void> {
    // Generate a fresh dummy hash and verify a mock password against it
    // This consumes approximately the same CPU cycles as a standard argon2 verify.
    const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$4mPZ8M9mO51pQv01$dummyhashplaceholder";
    await this.verify("dummy_password", dummyHash);
  }

  /**
   * Generates a cryptographically secure random token of the specified length.
   */
  generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString("hex");
  }

  /**
   * Constant-time string comparison using crypto.timingSafeEqual.
   * Protects against timing attacks on reset/verification tokens.
   */
  timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Force constant execution time using a dummy timingSafeEqual if lengths differ
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
