import crypto from "crypto";
import { configService } from "../config/config.service";

export class EncryptionService {
  private readonly algorithm = "aes-256-gcm";
  private readonly key: Buffer;

  constructor() {
    const rawKey = configService.security.oauthTokenEncryptionKey;
    // Ensure the key is exactly 32 bytes (256 bits)
    this.key = Buffer.alloc(32);
    const keyBuf = Buffer.from(rawKey, "utf8");
    keyBuf.copy(this.key, 0, 0, Math.min(keyBuf.length, 32));
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a string in the format "iv:ciphertext:tag" encoded in hex.
   */
  public encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${encrypted}:${tag}`;
  }

  /**
   * Decrypts an encrypted string in the format "iv:ciphertext:tag" using AES-256-GCM.
   */
  public decrypt(encryptedString: string): string {
    const parts = encryptedString.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted format. Expected 'iv:ciphertext:tag'.");
    }

    const [ivHex, ciphertextHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}

export const encryptionService = new EncryptionService();
