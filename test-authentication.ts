import "dotenv/config";
import http from "http";
import app, { ModuleRegistry } from "./src/app";
import { db } from "./src/core";
import { EventBus } from "./src/core/events/event.bus";

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  const events = [
    "AuthenticationRegistered",
    "AuthenticationLoggedIn",
    "AuthenticationLoggedOut",
    "PasswordChanged",
    "PasswordResetRequested",
    "PasswordResetCompleted",
    "EmailVerificationRequested",
    "EmailVerified",
    "RefreshTokenRotated",
    "SessionRevoked",
  ];

  for (const name of events) {
    EventBus.subscribe(name, (event) => {
      eventsLogged.push({ eventName: name, payload: event.payload });
    });
  }
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

  console.log("🔌 Connecting to database...");
  await db.connect();

  EventBus.clearAll();
  setupEventTracking();

  const server = http.createServer(app);
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
      } else {
        resolve(3002);
      }
    });
  });

  console.log(`📡 Authentication Test server running on port ${port}`);

  const randomSuffix = Math.floor(Math.random() * 1000000);
  const testEmail = `auth-test-${randomSuffix}@example.com`;
  const securePassword = `Password123!_AuthTest_${randomSuffix}`;

  try {
    // Test Case 1: Validation failure - invalid email and simple password
    console.log("\n--- Test Case 1: Registration Validation failure ---");
    const res1 = await request(port, "POST", "/api/v1/auth/register", {
      email: "invalid-email",
      password: "123",
    });
    console.log("Status:", res1.status);
    if (res1.status !== 400 || res1.body.success !== false) {
      throw new Error("Test Case 1 failed: Expected 400 Bad Request");
    }

    // Test Case 2: Registration success
    console.log("\n--- Test Case 2: Registration Success ---");
    const res2 = await request(port, "POST", "/api/v1/auth/register", {
      email: testEmail,
      password: securePassword,
      profile: {
        firstName: "Auth",
        lastName: "Tester",
        displayName: `authtester-${randomSuffix}`,
      },
    });
    console.log("Status:", res2.status);
    console.log("Body:", JSON.stringify(res2.body, null, 2));
    if (res2.status !== 201 || !res2.body.success) {
      throw new Error("Test Case 2 failed: Expected 201 Created");
    }

    // Assert Domain Events: AuthenticationRegistered, EmailVerificationRequested
    const regEvent = eventsLogged.find((e) => e.eventName === "AuthenticationRegistered");
    const verifReqEvent = eventsLogged.find((e) => e.eventName === "EmailVerificationRequested");
    if (!regEvent || !verifReqEvent) {
      throw new Error("Test Case 2 failed: AuthenticationRegistered or EmailVerificationRequested events not dispatched");
    }
    console.log("Verified Registered Event:", regEvent);
    console.log("Verified Email Verification Requested Event:", verifReqEvent);

    const verificationToken = verifReqEvent.payload.token;

    // Test Case 3: Duplicate Registration Violation
    console.log("\n--- Test Case 3: Duplicate Registration Violation ---");
    const res3 = await request(port, "POST", "/api/v1/auth/register", {
      email: testEmail,
      password: securePassword,
    });
    console.log("Status:", res3.status);
    if (res3.status !== 400 || !res3.body.error.message.includes("already exists")) {
      throw new Error("Test Case 3 failed: Expected 400 for duplicate email");
    }

    // Test Case 4: Login with correct password
    console.log("\n--- Test Case 4: Login Success ---");
    const res4 = await request(port, "POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    console.log("Status:", res4.status);
    console.log("Body:", JSON.stringify(res4.body, null, 2));
    if (res4.status !== 200 || !res4.body.success) {
      throw new Error("Test Case 4 failed: Expected 200 OK");
    }

    const { accessToken, refreshToken } = res4.body.data;
    if (!accessToken || !refreshToken) {
      throw new Error("Test Case 4 failed: Missing tokens in response");
    }

    const loginEvent = eventsLogged.find((e) => e.eventName === "AuthenticationLoggedIn");
    if (!loginEvent) {
      throw new Error("Test Case 4 failed: AuthenticationLoggedIn event not dispatched");
    }
    console.log("Verified Logged In Event:", loginEvent);

    // Test Case 5: Login with incorrect password
    console.log("\n--- Test Case 5: Login Invalid Password ---");
    const res5 = await request(port, "POST", "/api/v1/auth/login", {
      email: testEmail,
      password: "WrongPassword!",
    });
    console.log("Status:", res5.status);
    if (res5.status !== 401 || !res5.body.error.message.includes("Invalid email or password")) {
      throw new Error("Test Case 5 failed: Expected 401 Unauthorized");
    }

    // Test Case 6: Token Rotation (Refresh success)
    console.log("\n--- Test Case 6: Refresh Token Rotation ---");
    const res6 = await request(port, "POST", "/api/v1/auth/refresh", {
      refreshToken: refreshToken,
    });
    console.log("Status:", res6.status);
    console.log("Body:", JSON.stringify(res6.body, null, 2));
    if (res6.status !== 200 || !res6.body.success) {
      throw new Error("Test Case 6 failed: Expected 200 OK");
    }

    const newAccessToken = res6.body.data.accessToken;
    const newRefreshToken = res6.body.data.refreshToken;
    if (!newAccessToken || !newRefreshToken || newRefreshToken === refreshToken) {
      throw new Error("Test Case 6 failed: Refresh token rotation did not issue unique rotated token");
    }

    const rotateEvent = eventsLogged.find((e) => e.eventName === "RefreshTokenRotated");
    if (!rotateEvent) {
      throw new Error("Test Case 6 failed: RefreshTokenRotated event not dispatched");
    }
    console.log("Verified Rotated Event:", rotateEvent);

    // Test Case 7: Token Replay / Theft Attack Prevention (using the old, rotated token again)
    console.log("\n--- Test Case 7: Token Theft Replay Attack Revocation ---");
    const res7 = await request(port, "POST", "/api/v1/auth/refresh", {
      refreshToken: refreshToken, // Old token
    });
    console.log("Status:", res7.status);
    if (res7.status !== 401 || !res7.body.error.message.includes("Session compromised")) {
      throw new Error("Test Case 7 failed: Expected 401 Unauthorized block for rotated token");
    }

    const sessionRevokedEvent = eventsLogged.find((e) => e.eventName === "SessionRevoked");
    if (!sessionRevokedEvent) {
      throw new Error("Test Case 7 failed: SessionRevoked event not dispatched during replay attack");
    }
    console.log("Verified SessionRevoked Event:", sessionRevokedEvent);

    // Test Case 8: Confirm rotated refresh token fails because complete session has been revoked
    console.log("\n--- Test Case 8: Verify Complete Session Revoked ---");
    const res8 = await request(port, "POST", "/api/v1/auth/refresh", {
      refreshToken: newRefreshToken,
    });
    console.log("Status:", res8.status);
    if (res8.status !== 401) {
      throw new Error("Test Case 8 failed: New refresh token should be rejected as entire session was revoked");
    }

    // Login again to get a fresh session
    console.log("\n--- Performing Login 2 for email verify / reset tests ---");
    const relogin = await request(port, "POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    const freshRefreshToken = relogin.body.data.refreshToken;

    // Test Case 9: Verify Email with valid token
    console.log("\n--- Test Case 9: Email Verification ---");
    const res9 = await request(port, "POST", "/api/v1/auth/verify-email", {
      token: verificationToken,
    });
    console.log("Status:", res9.status);
    console.log("Body:", JSON.stringify(res9.body, null, 2));
    if (res9.status !== 200 || !res9.body.success) {
      throw new Error("Test Case 9 failed: Expected 200 OK");
    }

    const emailVerifiedEvent = eventsLogged.find((e) => e.eventName === "EmailVerified");
    if (!emailVerifiedEvent) {
      throw new Error("Test Case 9 failed: EmailVerified event not dispatched");
    }
    console.log("Verified EmailVerified Event:", emailVerifiedEvent);

    // Test Case 10: Forgot password (Request reset)
    console.log("\n--- Test Case 10: Forgot Password Request ---");
    const res10 = await request(port, "POST", "/api/v1/auth/forgot-password", {
      email: testEmail,
    });
    console.log("Status:", res10.status);
    if (res10.status !== 200 || !res10.body.success) {
      throw new Error("Test Case 10 failed: Expected 200 OK");
    }

    const resetRequestedEvent = eventsLogged.find((e) => e.eventName === "PasswordResetRequested");
    if (!resetRequestedEvent) {
      throw new Error("Test Case 10 failed: PasswordResetRequested event not dispatched");
    }
    console.log("Verified PasswordResetRequested Event:", resetRequestedEvent);

    const resetToken = resetRequestedEvent.payload.token;

    // Test Case 11: Reset password using token
    console.log("\n--- Test Case 11: Reset Password Confirmation ---");
    const newPassword = `NewSecurePassword123!_${randomSuffix}`;
    const res11 = await request(port, "POST", "/api/v1/auth/reset-password", {
      token: resetToken,
      password: newPassword,
    });
    console.log("Status:", res11.status);
    console.log("Body:", JSON.stringify(res11.body, null, 2));
    if (res11.status !== 200 || !res11.body.success) {
      throw new Error("Test Case 11 failed: Expected 200 OK");
    }

    const passwordChangedEvent = eventsLogged.find((e) => e.eventName === "PasswordChanged");
    const passwordResetCompletedEvent = eventsLogged.find((e) => e.eventName === "PasswordResetCompleted");
    if (!passwordChangedEvent || !passwordResetCompletedEvent) {
      throw new Error("Test Case 11 failed: Password reset completion events not dispatched");
    }
    console.log("Verified Password reset completion events:", passwordChangedEvent, passwordResetCompletedEvent);

    // Test Case 12: Logout with valid session
    console.log("\n--- Test Case 12: Logout Successful session ---");
    // Get fresh token after password change
    const login3 = await request(port, "POST", "/api/v1/auth/login", {
      email: testEmail,
      password: newPassword,
    });
    const login3RefreshToken = login3.body.data.refreshToken;

    const res12 = await request(port, "POST", "/api/v1/auth/logout", {
      refreshToken: login3RefreshToken,
    });
    console.log("Status:", res12.status);
    if (res12.status !== 200 || !res12.body.success) {
      throw new Error("Test Case 12 failed: Expected 200 OK logout");
    }

    const logoutEvent = eventsLogged.find((e) => e.eventName === "AuthenticationLoggedOut");
    if (!logoutEvent) {
      throw new Error("Test Case 12 failed: AuthenticationLoggedOut event not dispatched");
    }
    console.log("Verified AuthenticationLoggedOut Event:", logoutEvent);

    console.log("\n✅ All integration authentication tests passed successfully!");
  } finally {
    server.close();
    await db.disconnect();
    console.log("⏹️ Cleanup completed.");
  }
}

runTests().catch((err) => {
  console.error("❌ Test runner failed with error:", err);
  process.exit(1);
});
