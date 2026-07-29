import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";

const runner = new TestRunner("Health Module Integration Suite");
let server: http.Server;
let port: number;

runner
  .beforeAll(async () => {
    await ModuleRegistry.initialize();
    await db.connect();

    server = http.createServer(app);
    port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          resolve(3001);
        }
      });
    });
  })
  .afterAll(async () => {
    server.close();
    await db.disconnect();
  })
  .test("GET /health/live returns HTTP 200, success=true, UP status", async () => {
    const res = await request(port, "GET", "/health/live");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "UP");
    assert.equal(res.body.data.message, "Process is running");
  })
  .test("GET /health/ready returns HTTP 200, success=true, UP database connected and ready", async () => {
    const res = await request(port, "GET", "/health/ready");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "UP");
    assert.equal(res.body.data.message, "Database connected and ready");
  })
  .test("GET /health returns HTTP 200, success=true, detailed services check with database UP", async () => {
    const res = await request(port, "GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "UP");
    assert.equal(res.body.data.services.database.status, "UP");
    assert.equal(res.body.data.services.database.message, "Connected");
  });

export { runner };
