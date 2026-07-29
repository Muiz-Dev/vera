import { db } from "../database";
import { PrismaClient } from "../../generated/prisma/client";

export abstract class BaseService {
  protected get logger() {
    return Logger;
  }

  protected get db(): PrismaClient {
    return db.client;
  }
}
import Logger from "../logging/logger";
