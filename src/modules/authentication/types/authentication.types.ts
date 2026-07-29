export interface UserPayload {
  id: string;
  email: string | null;
}

export interface LoginResponseData {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: UserPayload;
}

export interface RefreshResponseData {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface JWTPayload {
  sub: string;
  email: string | null;
  environmentId: string;
  iat?: number;
  exp?: number;
}
