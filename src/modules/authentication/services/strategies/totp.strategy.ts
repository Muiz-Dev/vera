import crypto from "crypto";
import { MfaMethodType } from "../../../../generated/prisma/client";
import type { MfaStrategy, MfaSecretPayload, MfaVerificationResult } from "../../types/mfa.types";

export class TotpMfaStrategy implements MfaStrategy {
  public readonly type = MfaMethodType.TOTP;
  private readonly timeStepSeconds = 30;

  /**
   * Helper to decode Base32 into a Buffer.
   */
  private base32Decode(base32: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const cleaned = base32.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
    const length = cleaned.length;
    let bits = 0;
    let value = 0;
    let index = 0;
    const buffer = Buffer.alloc(Math.floor((length * 5) / 8));

    for (let i = 0; i < length; i++) {
      const char = cleaned[i];
      const val = alphabet.indexOf(char);
      if (val === -1) {
        throw new Error("Invalid base32 character in secret");
      }
      value = (value << 5) | val;
      bits += 5;
      if (bits >= 8) {
        buffer[index++] = (value >> (bits - 8)) & 0xff;
        bits -= 8;
      }
    }
    return buffer;
  }

  /**
   * Helper to generate a secure random Base32 secret string.
   */
  private generateBase32Secret(length = 32): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let secret = "";
    for (let i = 0; i < length; i++) {
      const randIdx = crypto.randomInt(0, alphabet.length);
      secret += alphabet[randIdx];
    }
    return secret;
  }

  /**
   * Generates a unique Base32 secret and standard otpauth provisioning URI.
   */
  public async generateSecret(identityId: string, email?: string): Promise<MfaSecretPayload> {
    const secret = this.generateBase32Secret(32);
    const label = email ? email.trim() : `user-${identityId}`;
    const issuer = "Vera";

    // URL-encode standard parameters
    const provisioningUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${this.timeStepSeconds}`;

    return { secret, provisioningUri };
  }

  /**
   * Computes standard HOTP code for a secret Buffer and specific step counter.
   */
  private computeHotp(secretBuffer: Buffer, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    // Write counter as 64-bit big-endian integer
    let temp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = temp & 0xff;
      temp = Math.floor(temp / 256);
    }

    const hmac = crypto.createHmac("sha1", secretBuffer).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return String(otp).padStart(6, "0");
  }

  /**
   * Verifies standard RFC 6238 TOTP code with time-drift tolerance and replay-attack check.
   */
  public async verifyCode(
    secret: string,
    code: string,
    lastVerifiedCounter = 0
  ): Promise<MfaVerificationResult> {
    const cleanedCode = code.trim().replace(/\s/g, "");
    if (cleanedCode.length !== 6 || !/^\d+$/.test(cleanedCode)) {
      return { success: false };
    }

    let secretBuffer: Buffer;
    try {
      secretBuffer = this.base32Decode(secret);
    } catch {
      return { success: false };
    }

    const currentCounter = Math.floor(Date.now() / 1000 / this.timeStepSeconds);
    const tolerance = 1; // +/- 1 step drift tolerance (total of 3 active windows)

    for (let i = -tolerance; i <= tolerance; i++) {
      const candidateCounter = currentCounter + i;

      // Replay defense check: Candidate window index must be strictly greater than last verified index
      if (candidateCounter <= lastVerifiedCounter) {
        continue;
      }

      const calculatedOtp = this.computeHotp(secretBuffer, candidateCounter);
      if (crypto.timingSafeEqual(Buffer.from(calculatedOtp), Buffer.from(cleanedCode))) {
        return {
          success: true,
          nextCounter: candidateCounter,
        };
      }
    }

    return { success: false };
  }
}
