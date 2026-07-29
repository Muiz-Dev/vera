# ADR-003: Response Envelope

## Status
Approved

## Date
2026-07-29

## Context
When building a production-ready enterprise platform API, consistency in response structures is essential for client integration (such as web SDKs, iOS/Android SDKs, and CLIs). If endpoints return raw databases payloads directly or use varying error JSON objects, clients must write custom, repetitive exception handling blocks for every API call. We require a uniform format for both successful transactions and error states.

## Decision
We adopted a unified **Response Envelope** standard across Vera.
Every single HTTP response returned by the platform must conform to the following JSON structure:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid-v4",
    "timestamp": "ISO-8601-string"
  }
}
```

For error responses, the standard schema is enforced globally using centralized error-handling middleware:

```json
{
  "success": false,
  "error": {
    "code": "ERR_VALIDATION_FAILED",
    "message": "Human-readable message",
    "details": {}
  },
  "meta": {
    "requestId": "uuid-v4",
    "timestamp": "ISO-8601-string",
    "correlationId": "uuid-v4"
  }
}
```

A dedicated helper utility class (`ResponseFormatter` under `src/core/http/response-formatter.ts`) is used to construct and return these structures safely from any controller.

## Alternatives Considered
- **Raw Object Returns:** Directly calling `res.json(data)` without an envelope wrapper. Rejected because it lacks standard metadata context (like `requestId`) and complicates client-side error vs success parsers.
- **Varying HTTP Status Envelopes:** Wrapping the status code inside the JSON body itself (e.g., `{"status": 200, "data": ...}`). Rejected because HTTP protocol status codes are already situated in the header; putting them inside the JSON payload is redundant and breaks caching and reverse-proxy routers.

## Consequences
- **Positive:**
  - Standardized client integration: Client SDK developers can build unified interceptors and state-machines.
  - Diagnostic traceability: Invaluable for support and observability, because `requestId` and `correlationId` are linked in the response body.
  - Predictable schema validation.
- **Negative:**
  - Introduces a small overhead of JSON nesting.

## Future Considerations
The metadata block will be enriched with:
- `duration`: The exact execution time of the request (e.g. `"14ms"`).
- `pagination`: Paginated schemas containing `page`, `pageSize`, and `total` records for collection endpoints.
