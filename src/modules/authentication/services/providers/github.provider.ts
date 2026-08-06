import type { OAuthProvider, OAuthTokens, OAuthProfile } from "../../types/oauth.types";
import { configService } from "../../../../core/config/config.service";

export class GitHubProvider implements OAuthProvider {
  public readonly name = "github";
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = configService.security.oauth.github.clientId;
    this.clientSecret = configService.security.oauth.github.clientSecret;
  }

  private isMockMode(): boolean {
    return (
      process.env.NODE_ENV === "test" ||
      this.clientId.includes("mock") ||
      this.clientSecret.includes("mock")
    );
  }

  public getAuthorizationUrl(state: string, redirectUri: string, codeChallenge?: string): string {
    const baseUrl = "https://github.com/login/oauth/authorize";
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state: state,
      scope: "read:user user:email",
    });

    return `${baseUrl}?${params.toString()}`;
  }

  public async exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthTokens> {
    if (this.isMockMode()) {
      if (code === "invalid_code") {
        throw new Error("Invalid authorization code from GitHub");
      }
      return {
        accessToken: `github-mock-access-token-for-${code}`,
        expiresAt: undefined, // GitHub access tokens do not expire by default
        scopes: ["read:user", "user:email"],
      };
    }

    const tokenUrl = "https://github.com/login/oauth/access_token";
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    if (data.error) {
      throw new Error(`GitHub token exchange failed: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      expiresAt: undefined,
      scopes: data.scope ? data.scope.split(",") : [],
    };
  }

  public async getUserProfile(accessToken: string): Promise<OAuthProfile> {
    if (this.isMockMode()) {
      if (accessToken === "github-mock-access-token-for-invalid_profile") {
        throw new Error("Failed to fetch GitHub profile");
      }
      // Extract code if present in the mock token
      const parts = accessToken.split("github-mock-access-token-for-");
      const suffix = parts[1] || "default";

      return {
        providerUserId: `github-user-id-${suffix}`,
        email: `${suffix}@example.com`,
        emailVerified: true,
        displayName: `GitHub User ${suffix}`,
        avatarUrl: `https://avatars.githubusercontent.com/u/${suffix}`,
      };
    }

    // 1. Fetch user profile info
    const profileUrl = "https://api.github.com/user";
    const profileResponse = await fetch(profileUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Vera-Platform-Engine",
      },
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      throw new Error(`Failed to fetch GitHub profile: ${profileResponse.status} - ${errorText}`);
    }

    const profileData = await profileResponse.json() as any;

    // 2. Fetch user email list to get the verified primary email address
    const emailsUrl = "https://api.github.com/user/emails";
    const emailsResponse = await fetch(emailsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Vera-Platform-Engine",
      },
    });

    let primaryEmail: string | undefined;
    let emailVerified = false;

    if (emailsResponse.ok) {
      const emailsList = await emailsResponse.json() as any[];
      const primaryRecord = emailsList.find((e) => e.primary) || emailsList[0];
      if (primaryRecord) {
        primaryEmail = primaryRecord.email;
        emailVerified = primaryRecord.verified === true;
      }
    } else {
      // Fallback to email on profile if emails endpoint failed or returned unauthorized
      primaryEmail = profileData.email;
    }

    return {
      providerUserId: String(profileData.id),
      email: primaryEmail,
      emailVerified,
      displayName: profileData.name || profileData.login,
      avatarUrl: profileData.avatar_url,
    };
  }
}
