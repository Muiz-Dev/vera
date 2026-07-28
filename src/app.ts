import express from "express";
import prisma from "./lib/prisma";

const app = express();

app.use(express.json());

app.get("/", async (_, res) => {
  const developers = await prisma.developer.count();

  res.json({
    name: "Vera",
    version: "0.0.1",
    developers,
  });
});

export default app;