import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import configService from "../config/config.service";
import Logger from "../logging/logger";

class PrismaService {
  private _client: PrismaClient;
  private _pool: Pool;

  constructor() {
    Logger.info("Initializing PrismaService and connection pool...");
    const databaseUrl = configService.database.url;

    const isAivenOrSSL = databaseUrl.includes("aivencloud.com") || databaseUrl.includes("sslmode=");

    let sslOptions: any = undefined;

    const caPath = path.join(process.cwd(), "certs", "ca.pem");
    if (fs.existsSync(caPath)) {
      try {
        sslOptions = {
          ca: fs.readFileSync(caPath, "utf8"),
          rejectUnauthorized: true,
        };
      } catch (err) {
        Logger.warn("Failed to load CA file for SSL, connecting without custom CA.", { err });
      }
    }

    if (!sslOptions && isAivenOrSSL) {
      sslOptions = {
        rejectUnauthorized: false,
      };
    }

    // Strip query parameters if they specify SSL modes to prevent pg-connection-string
    // from overriding our secure explicit sslOptions.
    let cleanConnectionString = databaseUrl;
    if (isAivenOrSSL) {
      cleanConnectionString = databaseUrl.split("?")[0] || databaseUrl;
    }

    this._pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: sslOptions,
    });

    const adapter = new PrismaPg(this._pool);

    this._client = new PrismaClient({
      adapter,
    });
  }

  get client(): PrismaClient {
    return this._client;
  }

  async connect(): Promise<void> {
    try {
      // Test the pool connection
      const client = await this._pool.connect();
      await client.query("SELECT 1");
      client.release();
      Logger.info("Database connection successfully established.");
    } catch (error) {
      Logger.error("Failed to connect to the database.", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    Logger.info("Disconnecting PrismaService and connection pool...");
    await this._client.$disconnect();
    await this._pool.end();
    Logger.info("Database disconnected successfully.");
  }
}

export const prismaService = new PrismaService();
export default prismaService;
