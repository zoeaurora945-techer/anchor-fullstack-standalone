import { ENV } from "./env";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import * as db from "../db";
import type { User } from "../../drizzle/schema";
import crypto from "crypto";

export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
  return `${salt}$${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const derived = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

/**
 * Verify a JWT session cookie and return the user, or null if invalid.
 */
export async function verifySession(
  cookieValue: string | undefined | null
): Promise<AuthenticatedUser | null> {
  if (!cookieValue) return null;
  if (!ENV.jwtSecret) {
    console.warn("[Auth] JWT_SECRET not configured");
    return null;
  }

  try {
    const { jwtVerify } = await import("jose");
    const secretKey = new TextEncoder().encode(ENV.jwtSecret);
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"],
    });
    const openId = payload.openId as string;
    if (!openId) return null;

    const user = await db.getUserByOpenId(openId);
    if (!user) return null;
    return user as AuthenticatedUser;
  } catch {
    return null;
  }
}

/**
 * Create a session JWT for a user.
 */
export async function createSessionToken(
  openId: string,
  name: string,
  expiresInMs = 365 * 24 * 60 * 60 * 1000
): Promise<string> {
  const { SignJWT } = await import("jose");
  const secretKey = new TextEncoder().encode(ENV.jwtSecret);
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

/**
 * Authenticate a request from cookie or Authorization header.
 */
export async function authenticateRequest(
  req: import("express").Request
): Promise<AuthenticatedUser | null> {
  const { parse: parseCookieHeader } = await import("cookie");
  const { COOKIE_NAME } = await import("@shared/const") as typeof import("@shared/const");

  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  let sessionToken = cookies[COOKIE_NAME];

  if (!sessionToken) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }
  }

  return verifySession(sessionToken);
}

export { hashPassword, verifyPassword };
