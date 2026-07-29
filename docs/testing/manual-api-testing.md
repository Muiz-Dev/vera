# Vera Platform Manual API Verification Guide

This document describes all the active endpoints exposed by the Vera Platform and provides sample requests and expected responses. Developers can verify the platform using only curl, Postman, Bruno, or Insomnia.

---

## 1. Health Endpoints

### Get Process Status (Liveness Check)
Returns a 200 immediately to verify that the Express app process is alive.

* **Endpoint:** `GET /health/live`
* **Request Example:**
  ```bash
  curl -i -X GET http://localhost:3000/health/live
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "status": "UP",
        "message": "Process is running"
      }
    }
    ```

### Get Database Readiness Status (Readiness Check)
Checks core system dependencies, specifically the PostgreSQL database connection.

* **Endpoint:** `GET /health/ready`
* **Request Example:**
  ```bash
  curl -i -X GET http://localhost:3000/health/ready
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "status": "UP",
        "message": "Database connected and ready"
      }
    }
    ```

### Detailed Health Checks
Returns comprehensive system information, including database statuses and application version attributes.

* **Endpoint:** `GET /health`
* **Request Example:**
  ```bash
  curl -i -X GET http://localhost:3000/health
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "status": "UP",
        "timestamp": "2026-07-29T07:20:51.710Z",
        "version": "0.0.1",
        "services": {
          "database": {
            "status": "UP",
            "message": "Connected"
          }
        }
      }
    }
    ```

---

## 2. Identity Engine Endpoints

### Create Identity
Creates a new Identity profile record. At least one of `email` or `phone` must be supplied.

* **Endpoint:** `POST /api/v1/identities`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/identities \
    -H "Content-Type: application/json" \
    -d '{
      "email": "manually-created@example.com",
      "phone": "+1995550100",
      "profile": {
        "firstName": "Arronax",
        "lastName": "Professor",
        "displayName": "arronax",
        "avatar": "https://example.com/arronax.png",
        "metadata": { "grade": "academic" }
      }
    }'
  ```
* **Expected Response:**
  - **HTTP Status:** `201 Created`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "id": "cms5r9s6b000035j66yo20kyr",
        "email": "manually-created@example.com",
        "phone": "+1995550100",
        "status": "PENDING",
        "createdAt": "2026-07-29T07:20:52.451Z",
        "updatedAt": "2026-07-29T07:20:52.451Z",
        "deletedAt": null,
        "profile": {
          "id": "cms5r9s9d000135j6zz433dor",
          "identityId": "cms5r9s6b000035j66yo20kyr",
          "firstName": "Arronax",
          "lastName": "Professor",
          "displayName": "arronax",
          "avatar": "https://example.com/arronax.png",
          "metadata": {
            "grade": "academic"
          },
          "createdAt": "2026-07-29T07:20:52.561Z",
          "updatedAt": "2026-07-29T07:20:52.561Z"
        }
      }
    }
    ```

### Retrieve Identity
Retrieves a single Identity profile by its unique ID. If soft deleted, returns `404 Not Found`.

* **Endpoint:** `GET /api/v1/identities/{id}`
* **Request Example:**
  ```bash
  curl -i -X GET http://localhost:3000/api/v1/identities/cms5r9s6b000035j66yo20kyr
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "id": "cms5r9s6b000035j66yo20kyr",
        "email": "manually-created@example.com",
        "phone": "+1995550100",
        "status": "PENDING",
        "profile": {
          "firstName": "Arronax",
          "lastName": "Professor",
          "displayName": "arronax"
        }
      }
    }
    ```

### Update Identity Profile
Updates an identity's base profile attributes.

* **Endpoint:** `PATCH /api/v1/identities/{id}`
* **Request Example:**
  ```bash
  curl -i -X PATCH http://localhost:3000/api/v1/identities/cms5r9s6b000035j66yo20kyr \
    -H "Content-Type: application/json" \
    -d '{
      "profile": {
        "firstName": "Arronax Updated"
      }
    }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "id": "cms5r9s6b000035j66yo20kyr",
        "profile": {
          "firstName": "Arronax Updated"
        }
      }
    }
    ```

### Suspend Identity
Suspends an identity's active or pending record status. Applies default reason `"Suspended by administrator"` if body is empty or omitted.

* **Endpoint:** `POST /api/v1/identities/{id}/suspend`
* **Request Example (with body):**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/identities/cms5r9s6b000035j66yo20kyr/suspend \
    -H "Content-Type: application/json" \
    -d '{ "reason": "Suspicious login attempts" }'
  ```
* **Request Example (empty body):**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/identities/cms5r9s6b000035j66yo20kyr/suspend \
    -H "Content-Type: application/json" \
    -d '{}'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "id": "cms5r9s6b000035j66yo20kyr",
        "status": "SUSPENDED"
      }
    }
    ```

### Soft Delete Identity
Sets the soft-deletion timestamp (`deletedAt`) and changes status to `DEACTIVATED`. The database record is retained, but all subsequent profile retrieval operations will return a 404.

* **Endpoint:** `DELETE /api/v1/identities/{id}`
* **Request Example:**
  ```bash
  curl -i -X DELETE http://localhost:3000/api/v1/identities/cms5r9s6b000035j66yo20kyr
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "id": "cms5r9s6b000035j66yo20kyr",
        "status": "DEACTIVATED",
        "deletedAt": "2026-07-29T07:20:57.217Z"
      }
    }
    ```

---

## 3. Authentication Engine Endpoints

### Register Account
Registers a new credentials identity profile.

* **Endpoint:** `POST /api/v1/auth/register`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "email": "manual-auth-user@example.com",
      "password": "Password123!",
      "profile": {
        "firstName": "Nemo",
        "lastName": "Captain",
        "displayName": "captainnemo"
      }
    }'
  ```
* **Expected Response:**
  - **HTTP Status:** `201 Created`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "id": "cms5ra0ty0000buj6c5eckn32",
        "email": "manual-auth-user@example.com",
        "status": "PENDING"
      }
    }
    ```

### User Login
Authenticates credentials, initializes a secure HTTP session, and issues Access (JWT) & Refresh tokens.

* **Endpoint:** `POST /api/v1/auth/login`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "manual-auth-user@example.com",
      "password": "Password123!"
    }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "accessToken": "eyJhbGciOiJIUzI1...o",
        "expiresIn": 900,
        "refreshToken": "07625530b8fc...978b",
        "user": {
          "id": "cms5ra0ty0000buj6c5eckn32",
          "email": "manual-auth-user@example.com"
        }
      }
    }
    ```

### Token Refresh (Token Rotation)
Exchanges an active refresh token for a brand new Access and Refresh Token set. Once rotated, the old token becomes completely invalid.

* **Endpoint:** `POST /api/v1/auth/refresh`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/refresh \
    -H "Content-Type: application/json" \
    -d '{ "refreshToken": "07625530b8fc...978b" }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "accessToken": "eyJhbGciOiJIUzI1...6",
        "expiresIn": 900,
        "refreshToken": "3af23c3a05b5...192a"
      }
    }
    ```

### Revoke Session (Logout)
Immediately revokes the session and all associated refresh tokens.

* **Endpoint:** `POST /api/v1/auth/logout`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/logout \
    -H "Content-Type: application/json" \
    -d '{ "refreshToken": "3af23c3a05b5...192a" }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "message": "Logged out successfully"
      }
    }
    ```

### Forgot Password
Requests a password reset link. Always returns a generic success message to prevent user enumeration attacks.

* **Endpoint:** `POST /api/v1/auth/forgot-password`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{ "email": "manual-auth-user@example.com" }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "message": "If this email exists, a password reset link has been dispatched."
      }
    }
    ```

### Reset Password
Updates the user's password using a valid password reset token, and immediately revokes all active user sessions for security.

* **Endpoint:** `POST /api/v1/auth/reset-password`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/reset-password \
    -H "Content-Type: application/json" \
    -d '{
      "token": "8df06febca1f...06e1",
      "password": "BrandNewPassword123!"
    }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "message": "Password has been successfully reset"
      }
    }
    ```

### Email Verification
Verifies the user's email address and transitions their identity record status from `PENDING` to `ACTIVE`.

* **Endpoint:** `POST /api/v1/auth/verify-email`
* **Request Example:**
  ```bash
  curl -i -X POST http://localhost:3000/api/v1/auth/verify-email \
    -H "Content-Type: application/json" \
    -d '{ "token": "faa45a176a4c...7c43" }'
  ```
* **Expected Response:**
  - **HTTP Status:** `200 OK`
  - **Body (JSON):**
    ```json
    {
      "success": true,
      "data": {
        "message": "Email has been successfully verified"
      }
    }
    ```
