// Creates one production administrator without resetting any existing records.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Set ADMIN_EMAIL to bootstrap an administrator");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("This email already exists; no account or password was changed");
  const password = randomBytes(24).toString("base64url");
  await prisma.user.create({
    data: {
      email,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(
    `Administrator created: ${email}\nOne-time generated password: ${password}\nStore this password securely; it will not be printed again.`,
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
