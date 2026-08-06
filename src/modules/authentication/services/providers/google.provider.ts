import type { OAuthProvider, OAuthTokens, OAuthProfile } from "../../types/oauth.types";
import { configService } from "../../../../core/config/config.service";

export class GoogleProvider implements OAuthProvider {
  public readonly name = "google";
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = configService.security.oauth.google.clientId;
    this.clientSecret = configService.security.oauth.google.clientSecret;
  }

  private isMockMode(): boolean {
    return (
      process.env.NODE_ENV === "test" ||
      this.clientId.includes("mock") ||
      this.clientSecret.includes("mock")
    );
  }

  public getAuthorizationUrl(state: string, redirectUri: string, codeChallenge?: string): string {
    const baseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state: state,
      scope: "openid profile email",
      access_type: "offline",
      prompt: "consent",
    });

    if (codeChallenge) {
      params.append("code_challenge", codeChallenge);
      params.append("code_challenge_method", "S256");
    }

    return `${baseUrl}?${params.toString()}`;
  }

  public async exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthTokens> {
    if (this.isMockMode()) {
      if (code === "invalid_code") {
        throw new Error("Invalid authorization code from Google");
      }
      return {
        accessToken: `google-mock-access-token-for-${code}`,
        refreshToken: `google-mock-refresh-token-for-${code}`,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        scopes: ["openid", "profile", "email"],
      };
    }

    const tokenUrl = "https://oauth2.googleapis.com/token";
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    if (codeVerifier) {
      body.append("code_verifier", codeVerifier);
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: data.scope ? data.scope.split(" ") : [],
    };
  }

  public async getUserProfile(accessToken: string): Promise<OAuthProfile> {
    if (this.isMockMode()) {
      if (accessToken === "google-mock-access-token-for-invalid_profile") {
        throw new Error("Failed to fetch Google profile");
      }
      // Extract code if present in the mock token
      const parts = accessToken.split("google-mock-access-token-for-");
      const suffix = parts[1] || "default";

      return {
        providerUserId: `google-user-id-${suffix}`,
        email: `${suffix}@example.com`,
        emailVerified: true,
        displayName: `Google User ${suffix}`,
        avatarUrl: `https://avatar.google.com/google-user-id-${suffix}`,
      };
    }

    const profileUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
    const response = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Google profile: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return {
      providerUserId: data.sub,
      email: data.email,
      emailVerified: data.email_verified === true,
      displayName: data.name,
      avatarUrl: data.picture,
    };
  }
}
