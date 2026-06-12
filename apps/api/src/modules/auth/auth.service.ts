// Authentication business logic: registration, login, and user lookup.

import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAccessToken } from "../../lib/jwt";
import { AppError } from "../../utils/httpError";
import type { LoginInput, SignupInput } from "./auth.schemas";

export type PublicUser = Omit<User, "passwordHash">;
export type AuthResult = { user: PublicUser; token: string };

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
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

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const identifier = input.identifier.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });

  // Verify password even when the user is absent? Keep it simple: uniform error message.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
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
