import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("Vera API is running");
});

export default app;