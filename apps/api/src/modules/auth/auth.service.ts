// Authentication business logic: registration, login, and user lookup.

import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAccessToken } from "../../lib/jwt";
import { AppError } from "../../utils/httpError";
import { newWelcomeCode } from "../orders/welcome-gift";
import type { ChangePasswordInput, LoginInput, SignupInput } from "./auth.schemas";

export type PublicUser = Omit<User, "passwordHash" | "sessionVersion" | "verifiedRecoveryEmail"> & {
  recoveryEmailVerified: boolean;
};
export type AuthResult = { user: PublicUser; token: string };
const dummyPasswordHash = hashPassword("oosta-account-that-does-not-exist");

function toPublicUser(user: User): PublicUser {
  const {
    passwordHash: _passwordHash,
    sessionVersion: _sessionVersion,
    verifiedRecoveryEmail,
    ...rest
  } = user;
  return {
    ...rest,
    recoveryEmailVerified: Boolean(
      rest.role === "USER" && rest.email && rest.email === verifiedRecoveryEmail,
    ),
  };
}

function issueToken(user: User): string {
  return signAccessToken({ sub: user.id, role: user.role, sv: user.sessionVersion });
}

export async function registerUser(input: SignupInput): Promise<AuthResult> {
  const orConditions: Prisma.UserWhereInput[] = [];
  if (input.email) orConditions.push({ email: input.email });
  if (input.phone) orConditions.push({ phone: input.phone });

  const existing = await prisma.user.findFirst({ where: { OR: orConditions } });
  if (existing) {
    throw new AppError(409, "CONFLICT", "An account with this email or phone already exists");
  }

  const passwordHash = await hashPassword(input.password);
  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash,
        welcomeGift: { create: { code: newWelcomeCode() } },
      },
    });
  } catch (error) {
    // The pre-check improves UX, but only the unique index closes concurrent races.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AppError(409, "CONFLICT", "An account with this email or phone already exists");
    }
    throw error;
  }

  return { user: toPublicUser(user), token: issueToken(user) };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const identifier = input.identifier.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });

  // Keep the expensive password check on both paths to reduce timing enumeration.
  const validPassword = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await dummyPasswordHash),
  );
  if (!user || !validPassword) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid credentials");
  }

  return { user: toPublicUser(user), token: issueToken(user) };
}

// Requires the current password, then rotates the hash and bumps sessionVersion in
// one update so every token issued before the change (other devices, a stolen copy)
// stops working. Returns a fresh token for the caller's own session.
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "UNAUTHORIZED", "User no longer exists");
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    // 400, not 401: the session itself is valid and clients drop sessions on 401.
    throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
  }
  const passwordHash = await hashPassword(input.newPassword);
  let updated: User;
  try {
    updated = await prisma.user.update({
      where: { id: userId, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025")
      throw new AppError(
        409,
        "CREDENTIALS_CHANGED",
        "Credentials changed during this request. Sign in again.",
      );
    throw error;
  }
  return { user: toPublicUser(updated), token: issueToken(updated) };
}

// "Log out on every device": revokes all existing tokens for this user.
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}
