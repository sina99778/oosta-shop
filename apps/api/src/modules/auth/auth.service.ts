// Authentication business logic: registration, login, and user lookup.

import { createHash, randomBytes } from "node:crypto";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { sessionCutoff, signAccessToken } from "../../lib/jwt";
import { AppError } from "../../utils/httpError";
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  UpdateProfileInput,
} from "./auth.schemas";

export type PublicUser = Omit<User, "passwordHash">;
export type AuthResult = { user: PublicUser; token: string };

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export async function registerUser(input: SignupInput): Promise<AuthResult> {
  const orConditions: Prisma.UserWhereInput[] = [];
  // Case-insensitive: accounts created before emails were lowercased still collide.
  if (input.email) orConditions.push({ email: { equals: input.email, mode: "insensitive" } });
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
      },
    });
  } catch (error) {
    // The pre-check improves UX, but only the unique index closes concurrent races.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AppError(409, "CONFLICT", "An account with this email or phone already exists");
    }
    throw error;
  }

  return { user: toPublicUser(user), token: signAccessToken({ sub: user.id, role: user.role }) };
}

// A real bcrypt hash of a random string: comparing against it when the user does
// not exist keeps the response time the same, so timing can't reveal which
// emails/phones are registered.
const DUMMY_HASH = "$2a$12$12K73ODN6potKRkEJmcqkuR5zTh7RS904kbNnb6c79txdnYK5RUP2";

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const identifier = input.identifier.trim();
  const phone = identifier.replace(/[\s-]/g, "");
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: { equals: identifier, mode: "insensitive" } }, { phone }],
    },
  });

  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid credentials");
  }

  return { user: toPublicUser(user), token: signAccessToken({ sub: user.id, role: user.role }) };
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}

export async function updateProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
  return toPublicUser(await prisma.user.update({ where: { id }, data: { name: input.name } }));
}

// Changes the password and ends every other session; returns a fresh token so
// the caller stays signed in on this device.
export async function changePassword(id: string, input: ChangePasswordInput): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, "WRONG_PASSWORD", "Current password is incorrect");
  }
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      sessionsValidAfter: sessionCutoff(),
    },
  });
  return signAccessToken({ sub: user.id, role: user.role });
}

// ── One-time reset links (made by an admin; there is no SMS/email channel) ──

const RESET_TTL_MS = 24 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Creates a reset link for a user, replacing any unused earlier one.
export async function createPasswordReset(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordReset.create({ data: { userId, tokenHash: hashToken(token), expiresAt } }),
  ]);
  return { token, expiresAt };
}

// Spends a reset token: sets the new password and signs out every session.
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const invalid = new AppError(400, "RESET_INVALID", "This reset link is invalid or has expired");
  await prisma.$transaction(async (tx) => {
    // The conditional update is the claim: of two concurrent uses, one wins.
    const claimed = await tx.passwordReset.updateMany({
      where: { tokenHash: hashToken(input.token), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw invalid;
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: { userId: true },
    });
    if (!reset) throw invalid;
    await tx.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        sessionsValidAfter: sessionCutoff(),
      },
    });
  });
}
