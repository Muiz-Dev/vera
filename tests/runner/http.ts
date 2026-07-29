import http from "http";

export interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export async function request(
  port: number,
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const mergedHeaders = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      ...headers,
    };

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: mergedHeaders,
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
              headers: res.headers,
              body: responseBody ? JSON.parse(responseBody) : {},
            });
          } catch {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
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
