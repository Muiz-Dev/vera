import "dotenv/config";
import http from "http";
import app, { ModuleRegistry } from "./src/app";
import { db } from "./src/core";
import { EventBus } from "./src/core/events/event.bus";

// Global collector for triggered events to assert correctness
const eventsLogged: { eventName: string; payload: any }[] = [];

// Subscribe helper
function setupEventTracking() {
  EventBus.subscribe("IdentityCreated", (event) => {
    eventsLogged.push({ eventName: "IdentityCreated", payload: event.payload });
  });
  EventBus.subscribe("IdentityUpdated", (event) => {
    eventsLogged.push({ eventName: "IdentityUpdated", payload: event.payload });
  });
  EventBus.subscribe("IdentitySuspended", (event) => {
    eventsLogged.push({ eventName: "IdentitySuspended", payload: event.payload });
  });
  EventBus.subscribe("IdentityDeleted", (event) => {
    eventsLogged.push({ eventName: "IdentityDeleted", payload: event.payload });
  });
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode || 0,
              body: responseBody ? JSON.parse(responseBody) : {},
            });
          } catch {
            resolve({
              status: res.statusCode || 0,
              body: { raw: responseBody },
            });
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function runTests() {
  console.log("🚀 Initializing modules...");
  await ModuleRegistry.initialize();

  // Connect database
  console.log("🔌 Connecting to database...");
  await db.connect();

  // Clear tracked events and set up tracking
  EventBus.clearAll();
  setupEventTracking();

  // Start test server
  const server = http.createServer(app);
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
      } else {
        resolve(3001);
      }
    });
  });

  console.log(`📡 Test server running on port ${port}`);

  let testIdentityId = "";
  const randomSuffix = Math.floor(Math.random() * 1000000);
  const testEmail = `test-${randomSuffix}@example.com`;
  const testPhone = `+1${randomSuffix}`;

  try {
    // Test Case 1: Validation failure - create without email and phone
    console.log("\n--- Test Case 1: Validation failure ---");
    const res1 = await request(port, "POST", "/api/v1/identities", {
      profile: { firstName: "Test" },
    });
    console.log("Status:", res1.status);
    console.log("Body:", JSON.stringify(res1.body, null, 2));
    if (res1.status !== 400 || res1.body.success !== false) {
      throw new Error("Test Case 1 failed: Expected 400 Bad Request");
    }

    // Test Case 2: Success - Create Identity with Profile
    console.log("\n--- Test Case 2: Create Identity with Profile ---");
    const createPayload = {
      email: testEmail,
      phone: testPhone,
      profile: {
        firstName: "Jules",
        lastName: "Verne",
        displayName: `jules-${randomSuffix}`,
        avatar: "https://example.com/avatar.png",
        metadata: { role: "author" },
      },
    };
    const res2 = await request(port, "POST", "/api/v1/identities", createPayload);
    console.log("Status:", res2.status);
    console.log("Body:", JSON.stringify(res2.body, null, 2));
    if (res2.status !== 201 || !res2.body.success) {
      throw new Error("Test Case 2 failed: Expected 201 Created");
    }

    testIdentityId = res2.body.data.id;
    if (!testIdentityId) {
      throw new Error("Test Case 2 failed: ID not returned");
    }
    if (res2.body.data.status !== "PENDING") {
      throw new Error("Test Case 2 failed: Expected status PENDING");
    }
    if (res2.body.data.profile.firstName !== "Jules" || res2.body.data.profile.metadata.role !== "author") {
      throw new Error("Test Case 2 failed: Profile/metadata incorrect");
    }

    // Assert Event IdentityCreated fired
    const createdEvent = eventsLogged.find((e) => e.eventName === "IdentityCreated");
    if (!createdEvent) {
      throw new Error("Test Case 2 failed: IdentityCreated event not dispatched");
    }
    console.log("Verified IdentityCreated Event:", createdEvent);

    // Test Case 3: Get Identity
    console.log("\n--- Test Case 3: Get Identity ---");
    const res3 = await request(port, "GET", `/api/v1/identities/${testIdentityId}`);
    console.log("Status:", res3.status);
    if (res3.status !== 200 || !res3.body.success || res3.body.data.id !== testIdentityId) {
      throw new Error("Test Case 3 failed: Expected 200 OK with correct identity");
    }

    // Test Case 4: Duplicate Email Violation
    console.log("\n--- Test Case 4: Duplicate Email Violation ---");
    const res4 = await request(port, "POST", "/api/v1/identities", {
      email: testEmail,
    });
    console.log("Status:", res4.status);
    if (res4.status !== 400 || res4.body.error.message.indexOf("already exists") === -1) {
      throw new Error("Test Case 4 failed: Expected 400 validation error for duplicate email");
    }

    // Test Case 5: Update Identity
    console.log("\n--- Test Case 5: Update Identity ---");
    const updatePayload = {
      profile: {
        firstName: "Jules Updated",
        displayName: `jules-updated-${randomSuffix}`,
      },
    };
    const res5 = await request(port, "PATCH", `/api/v1/identities/${testIdentityId}`, updatePayload);
    console.log("Status:", res5.status);
    console.log("Body:", JSON.stringify(res5.body, null, 2));
    if (res5.status !== 200 || !res5.body.success) {
      throw new Error("Test Case 5 failed: Expected 200 OK");
    }
    if (res5.body.data.profile.firstName !== "Jules Updated" || res5.body.data.profile.metadata.role !== "author") {
      throw new Error("Test Case 5 failed: Updated fields or preserved fields are incorrect");
    }

    // Assert Event IdentityUpdated fired
    const updatedEvent = eventsLogged.find((e) => e.eventName === "IdentityUpdated");
    if (!updatedEvent) {
      throw new Error("Test Case 5 failed: IdentityUpdated event not dispatched");
    }
    console.log("Verified IdentityUpdated Event:", updatedEvent);

    // Test Case 6: Suspend Identity
    console.log("\n--- Test Case 6: Suspend Identity ---");
    const suspendPayload = { reason: "Suspicious activities detected" };
    const res6 = await request(port, "POST", `/api/v1/identities/${testIdentityId}/suspend`, suspendPayload);
    console.log("Status:", res6.status);
    console.log("Body:", JSON.stringify(res6.body, null, 2));
    if (res6.status !== 200 || !res6.body.success) {
      throw new Error("Test Case 6 failed: Expected 200 OK");
    }
    if (res6.body.data.status !== "SUSPENDED") {
      throw new Error("Test Case 6 failed: Status should be SUSPENDED");
    }

    // Assert Event IdentitySuspended fired
    const suspendedEvent = eventsLogged.find((e) => e.eventName === "IdentitySuspended");
    if (!suspendedEvent) {
      throw new Error("Test Case 6 failed: IdentitySuspended event not dispatched");
    }
    if (suspendedEvent.payload.reason !== "Suspicious activities detected") {
      throw new Error("Test Case 6 failed: Suspended event reason incorrect");
    }
    console.log("Verified IdentitySuspended Event:", suspendedEvent);

    // Test Case 7: Suspend Already Suspended Identity
    console.log("\n--- Test Case 7: Double Suspend (Validation Error) ---");
    const res7 = await request(port, "POST", `/api/v1/identities/${testIdentityId}/suspend`, suspendPayload);
    console.log("Status:", res7.status);
    if (res7.status !== 400) {
      throw new Error("Test Case 7 failed: Expected 400 Bad Request");
    }

    // Test Case 8: Soft Delete Identity
    console.log("\n--- Test Case 8: Soft Delete Identity ---");
    const res8 = await request(port, "DELETE", `/api/v1/identities/${testIdentityId}`);
    console.log("Status:", res8.status);
    console.log("Body:", JSON.stringify(res8.body, null, 2));
    if (res8.status !== 200 || !res8.body.success) {
      throw new Error("Test Case 8 failed: Expected 200 OK");
    }
    if (res8.body.data.status !== "DEACTIVATED" || !res8.body.data.deletedAt) {
      throw new Error("Test Case 8 failed: Soft-delete values incorrect");
    }

    // Assert Event IdentityDeleted fired
    const deletedEvent = eventsLogged.find((e) => e.eventName === "IdentityDeleted");
    if (!deletedEvent) {
      throw new Error("Test Case 8 failed: IdentityDeleted event not dispatched");
    }
    console.log("Verified IdentityDeleted Event:", deletedEvent);

    // Test Case 9: Retrieve Soft Deleted Record (should fail with 404)
    console.log("\n--- Test Case 9: Retrieve Soft-Deleted Record (404) ---");
    const res9 = await request(port, "GET", `/api/v1/identities/${testIdentityId}`);
    console.log("Status:", res9.status);
    if (res9.status !== 404 || res9.body.success !== false) {
      throw new Error("Test Case 9 failed: Expected 404 Not Found for soft-deleted identity");
    }

    console.log("\n✅ All integration tests passed successfully!");
  } finally {
    // Cleanup
    server.close();
    await db.disconnect();
    console.log("⏹️ Cleanup completed.");
  }
}

runTests().catch((err) => {
  console.error("❌ Test runner failed with error:", err);
  process.exit(1);
});
