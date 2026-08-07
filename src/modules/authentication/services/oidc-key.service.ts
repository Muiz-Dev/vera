import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../../../core/database";
import { encryptionService } from "../../../core/security/encryption.service";
import Logger from "../../../core/logging/logger";
import { AppError } from "../../../core/errors";

export class OidcKeyService {
  /**
   * Retrieves the active signing key for the given environment or generates one if it doesn't exist.
   */
  async getOrCreateActiveKey(environmentId: string): Promise<{ kid: string; privateKeyPem: string; publicKeyPem: string }> {
    // Attempt to find an active key in database
    const existingKey = await db.client.oAuthSigningKey.findFirst({
      where: {
        environmentId,
        isActive: true,
      },
    });

    if (existingKey) {
      try {
        const decryptedPrivateKey = encryptionService.decrypt(existingKey.privateKeyPem);
        return {
          kid: existingKey.kid,
          publicKeyPem: existingKey.publicKeyPem,
          privateKeyPem: decryptedPrivateKey,
        };
      } catch (err) {
        Logger.error(`Failed to decrypt private key for environment ${environmentId}:`, err);
        throw new AppError("Secure key decryption failure", "ERR_INTERNAL", 500);
      }
    }

    // No active key found, let's generate a 4096-bit RSA keypair
    Logger.info(`No active RSA signing key found for environment: ${environmentId}. Generating a 4096-bit RSA keypair...`);

    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: "spki",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
        },
      });

      const kid = `kid_${crypto.randomBytes(16).toString("hex")}`;
      const encryptedPrivateKey = encryptionService.encrypt(privateKey);

      const savedKey = await db.client.oAuthSigningKey.create({
        data: {
          environmentId,
          kid,
          publicKeyPem: publicKey,
          privateKeyPem: encryptedPrivateKey,
          isActive: true,
        },
      });

      return {
        kid: savedKey.kid,
        publicKeyPem: savedKey.publicKeyPem,
        privateKeyPem: privateKey,
      };
    } catch (err) {
      Logger.error(`Error generating/saving RSA keypair for environment ${environmentId}:`, err);
      throw new AppError("Failed to generate and store environment signing key", "ERR_INTERNAL", 500);
    }
  }

  /**
   * Returns standard JWKS format public keys for an environment.
   */
  async getActivePublicKeys(environmentId: string): Promise<any[]> {
    // Trigger lazy generation/retrieval of key
    await this.getOrCreateActiveKey(environmentId);

    const keys = await db.client.oAuthSigningKey.findMany({
      where: {
        environmentId,
        isActive: true,
      },
    });

    const jwks: any[] = [];

    for (const key of keys) {
      try {
        const pubKeyObject = crypto.createPublicKey(key.publicKeyPem);
        const jwk = pubKeyObject.export({ format: "jwk" }) as any;
        jwks.push({
          kty: jwk.kty,
          alg: "RS256",
          use: "sig",
          kid: key.kid,
          n: jwk.n,
          e: jwk.e,
        });
      } catch (err) {
        Logger.error(`Error converting public key ${key.kid} to JWK format:`, err);
      }
    }

    return jwks;
  }

  /**
   * Signs a JWT using the active RSA private key of the given environment.
   */
  async signJwt(environmentId: string, payload: any, options: { expiresIn?: string | number } = {}): Promise<string> {
    const { kid, privateKeyPem } = await this.getOrCreateActiveKey(environmentId);

    try {
      const signOptions: any = {
        algorithm: "RS256",
        keyid: kid,
      };

      // Only set expiresIn if 'exp' is not explicitly present in the payload
      if (payload.exp === undefined) {
        signOptions.expiresIn = options.expiresIn || "1h";
      }

      // Use standard algorithm: RS256 with keyId (kid) header parameter
      return jwt.sign(payload, privateKeyPem, signOptions);
    } catch (err) {
      Logger.error(`Error signing JWT with RSA key ${kid}:`, err);
      throw new AppError("Failed to sign token", "ERR_INTERNAL", 500);
    }
  }
}
