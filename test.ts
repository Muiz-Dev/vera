import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: fs.readFileSync("./certs/ca.pem", "utf8"),
    rejectUnauthorized: true,
  },
});

const main = async () => {
  const client = await pool.connect();
  const result = await client.query("SELECT NOW()");
  console.log(result.rows);
  client.release();
  await pool.end();
};

main().catch(console.error);