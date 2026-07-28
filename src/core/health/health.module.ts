import { Router } from "express";
import type { Request, Response } from "express";
import type { IModule } from "../base/module.interface";
import { ResponseFormatter } from "../http/response-formatter";
import { db } from "../database";
import Logger from "../logging/logger";

export class HealthModule implements IModule {
  public readonly name = "HealthModule";

  public register(app: any): void {
    const router = Router();

    // Liveness probe - returns 200 immediately to signify the process is alive
    router.get("/live", (req: Request, res: Response) => {
      ResponseFormatter.success(res, { status: "UP", message: "Process is running" });
    });

    // Readiness probe - checks core dependencies like the database
    router.get("/ready", async (req: Request, res: Response) => {
      try {
        await db.client.$queryRaw`SELECT 1`;
        ResponseFormatter.success(res, { status: "UP", message: "Database connected and ready" });
      } catch (error) {
        Logger.error("Readiness check failed: Database connection down.", error);
        ResponseFormatter.error(
          res,
          "Database connection unavailable",
          "ERR_DATABASE_CONNECTION",
          503
        );
      }
    });

    // Detailed health status
    router.get("/", async (req: Request, res: Response) => {
      let dbStatus = "UP";
      let statusCode = 200;
      let dbMessage = "Connected";

      try {
        await db.client.$queryRaw`SELECT 1`;
      } catch (error) {
        dbStatus = "DOWN";
        statusCode = 503;
        dbMessage = error instanceof Error ? error.message : "Database connection lost";
      }

      const healthDetails = {
        status: dbStatus === "UP" ? "UP" : "DOWN",
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || "0.0.1",
        services: {
          database: {
            status: dbStatus,
            message: dbMessage,
          },
        },
      };

      if (dbStatus === "UP") {
        ResponseFormatter.success(res, healthDetails, statusCode);
      } else {
        ResponseFormatter.error(
          res,
          "Platform service is unhealthy",
          "ERR_INTERNAL",
          statusCode,
          healthDetails
        );
      }
    });

    app.use("/health", router);
  }

  public initialize(): void {
    Logger.info("HealthModule initialized.");
  }
}
