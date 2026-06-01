// Development seed: wipes and repopulates the database with an admin user,
// a demo user, sample categories/products/plans, and inventory per product type.
// Run with: npm run db:seed -w @oosta/api

import { PrismaClient, ProductType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

type CredentialPayload = {
  accountEmail?: string;
  accountPassword?: string;
  licenseKey?: string;
  giftCardCode?: string;
};

type PlanSeed = { label: string; durationDays: number | null; price: number };
type ProductSeed = {
  name: string;
  slug: string;
  description: string;
  type: ProductType;
  image?: string;
  stockPerPlan: number;
  plans: PlanSeed[];
};

// Generates a unique credential payload appropriate to the product type.
function buildPayload(type: ProductType): CredentialPayload {
  const token = randomUUID().replace(/-/g, "").slice(0, 16);
  switch (type) {
    case ProductType.ACCOUNT:
      return {
        accountEmail: `acct.${token}@delivery.example`,
        accountPassword: `Pass!${token.slice(0, 10)}`,
      };
    case ProductType.LICENSE:
      return {
        licenseKey:
          `${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}`.toUpperCase(),
      };
    case ProductType.GIFTCARD:
      return { giftCardCode: token.toUpperCase() };
    default:
      return {};
  }
}

async function reset(): Promise<void> {
  // Delete in FK-safe order.
  await prisma.inventoryItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productPlan.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUsers(): Promise<void> {
  const [adminHash, userHash] = await Promise.all([
    bcrypt.hash("Admin@12345", SALT_ROUNDS),
    bcrypt.hash("User@12345", SALT_ROUNDS),
  ]);

  await prisma.user.create({
    data: {
      name: "Site Admin",
      email: "admin@oosta.local",
      phone: "+989120000000",
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      name: "Demo User",
      email: "user@oosta.local",
      phone: "+989120000001",
      passwordHash: userHash,
      role: Role.USER,
    },
  });
}

async function seedCatalog(): Promise<void> {
  const aiAccounts = await prisma.category.create({
    data: { name: "AI Accounts", slug: "ai-accounts" },
  });
  const softwareLicenses = await prisma.category.create({
    data: { name: "Software Licenses", slug: "software-licenses" },
  });
  const giftCards = await prisma.category.create({
    data: { name: "Gift Cards", slug: "gift-cards" },
  });

  const catalog: { categoryId: string; products: ProductSeed[] }[] = [
    {
      categoryId: aiAccounts.id,
      products: [
        {
          name: "ChatGPT Plus Account",
          slug: "chatgpt-plus-account",
          description: "Premium ChatGPT Plus access with the latest GPT-4-class models.",
          type: ProductType.ACCOUNT,
          stockPerPlan: 8,
          plans: [
            { label: "1 Month", durationDays: 30, price: 350000 },
            { label: "3 Months", durationDays: 90, price: 900000 },
          ],
        },
        {
          name: "Claude Pro Account",
          slug: "claude-pro-account",
          description: "Claude Pro subscription with higher usage limits and priority access.",
          type: ProductType.ACCOUNT,
          stockPerPlan: 6,
          plans: [{ label: "1 Month", durationDays: 30, price: 400000 }],
        },
      ],
    },
    {
      categoryId: softwareLicenses.id,
      products: [
        {
          name: "Windows 11 Pro License",
          slug: "windows-11-pro-license",
          description: "Genuine Windows 11 Pro retail activation key, lifetime validity.",
          type: ProductType.LICENSE,
          stockPerPlan: 10,
          plans: [{ label: "Lifetime", durationDays: null, price: 1200000 }],
        },
      ],
    },
    {
      categoryId: giftCards.id,
      products: [
        {
          name: "Google Play Gift Card",
          slug: "google-play-gift-card",
          description: "Redeemable Google Play store credit, delivered instantly.",
          type: ProductType.GIFTCARD,
          stockPerPlan: 12,
          plans: [
            { label: "10 USD", durationDays: null, price: 650000 },
            { label: "25 USD", durationDays: null, price: 1550000 },
          ],
        },
      ],
    },
  ];

  for (const group of catalog) {
    for (const p of group.products) {
      const product = await prisma.product.create({
        data: {
          name: p.name,
          slug: p.slug,
          description: p.description,
          type: p.type,
          image: p.image ?? null,
          categoryId: group.categoryId,
        },
      });

      for (const plan of p.plans) {
        const createdPlan = await prisma.productPlan.create({
          data: {
            productId: product.id,
            label: plan.label,
            durationDays: plan.durationDays,
            price: plan.price,
          },
        });

        const items = Array.from({ length: p.stockPerPlan }, () => ({
          productId: product.id,
          planId: createdPlan.id,
          type: p.type,
          ...buildPayload(p.type),
        }));

        await prisma.inventoryItem.createMany({ data: items });
      }
    }
  }
}

async function main(): Promise<void> {
  await reset();
  await seedUsers();
  await seedCatalog();

  const [users, categories, products, plans, inventory] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.productPlan.count(),
    prisma.inventoryItem.count(),
  ]);

  console.log("Seed complete:");
  console.table({ users, categories, products, plans, inventory });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
