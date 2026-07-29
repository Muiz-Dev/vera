import type { Request, Response, NextFunction } from "express";
import { AuthenticationService } from "../services/authentication.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import {
  RegisterValidator,
  LoginValidator,
  RefreshValidator,
  LogoutValidator,
  ForgotPasswordValidator,
  ResetPasswordValidator,
  VerifyEmailValidator,
} from "../validators/authentication.validator";

export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  /**
   * POST /api/v1/auth/register
   */
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = RegisterValidator.parse(req.body);
      const result = await this.authService.register(validated);
      ResponseFormatter.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/login
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = LoginValidator.parse(req.body);
      const ipAddress = req.ip || null;
      const userAgent = req.headers["user-agent"] || null;

      const result = await this.authService.login(validated, ipAddress, userAgent);
      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/logout
   */
  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = LogoutValidator.parse(req.body);
      await this.authService.logout(validated.refreshToken);
      ResponseFormatter.success(res, { message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/refresh
   */
  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = RefreshValidator.parse(req.body);
      const result = await this.authService.refresh(validated.refreshToken);
      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/forgot-password
   */
  public forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = ForgotPasswordValidator.parse(req.body);
      await this.authService.requestPasswordReset(validated.email);
      ResponseFormatter.success(res, {
        message: "If the email is associated with an account, a password reset link has been sent.",
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/reset-password
   */
  public resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = ResetPasswordValidator.parse(req.body);
      await this.authService.resetPassword(validated.token, validated.password);
      ResponseFormatter.success(res, { message: "Password has been successfully reset" });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/verify-email
   */
  public verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = VerifyEmailValidator.parse(req.body);
      await this.authService.verifyEmail(validated.token);
      ResponseFormatter.success(res, { message: "Email has been successfully verified" });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/mfa/setup-placeholder
   * Placeholder / MFA secret enrollment foundation
   */
  public setupMfaPlaceholder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityId } = req.body;
      if (!identityId) {
        ResponseFormatter.error(res, {
          code: "ERR_VALIDATION_FAILED",
          message: "identityId is required",
        }, 400);
        return;
      }
      const result = await this.authService.setupMfaSecret(identityId);
      ResponseFormatter.success(res, {
        message: "MFA foundation secret initialized",
        ...result,
      });
    } catch (err) {
      next(err);
    }
  };
}
