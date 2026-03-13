import "express-session";

declare module "express-session" {
  interface SessionData {
    user?: {
      sub: string;
      name: string;
      email: string;
      groups: string[];
    };
    oidcNonce?: string;
    oidcState?: string;
    returnTo?: string;
  }
}
