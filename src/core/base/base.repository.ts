import { db } from "../database";
import { PrismaClient } from "../../generated/prisma/client";

export abstract class BaseRepository<T> {
  protected get db(): PrismaClient {
    return db.client;
  }
}
