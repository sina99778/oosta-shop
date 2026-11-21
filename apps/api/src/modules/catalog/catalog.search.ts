import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { ListProductsQuery } from "./catalog.schemas";

const chatgptAliases = ["چت", "چت جی پی تی", "چت جی‌پی‌تی", "chatgtp", "openai"];
const claudeAliases = ["کلود", "کلاد", "آنتروپیک", "anthropic"];
const aliases: Record<string, string[]> = {
  chatgpt: chatgptAliases,
  "chatgpt-plus-account": chatgptAliases,
  claude: claudeAliases,
  "claude-pro-account": claudeAliases,
  gemini: ["جمینای", "جمنای", "جیمینای", "جمینی", "google ai"],
  canva: ["کانوا", "کنوا"],
  capcut: ["کپ کات", "کپ‌کات"],
  netflix: ["نتفلیکس", "نت فلیکس"],
  spotify: ["اسپاتیفای", "اسپوتیفای"],
  "adobe-creative-cloud": ["فتوشاپ", "photoshop", "ادوبی کریتیو کلاد"],
  "youtube-premium": ["یوتیوب", "یوتیوب پریمیوم"],
  "microsoft-365": ["مایکروسافت ۳۶۵", "office 365", "آفیس ۳۶۵"],
};

const aliasesBySlug = JSON.stringify(aliases);
const ignoredSpaces =
  "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200c\u2028\u2029\u202f\u205f\u3000\ufeff";

function normalize(value: Prisma.Sql) {
  return Prisma.sql`translate(lower(${value}), ${`يىك${ignoredSpaces}`}, ${"ییک"})`;
}

type SearchProduct = { id: string; slug: string; createdAt: Date; sortOrder: number };

export function searchProducts(term: string, { category, featured }: ListProductsQuery) {
  return prisma.$queryRaw<SearchProduct[]>`
    WITH search AS (SELECT ${normalize(Prisma.sql`${term}::text`)} AS term)
    SELECT p.id, p.slug, p."createdAt", p."sortOrder"
    FROM products p CROSS JOIN search
    WHERE p."isActive" AND search.term <> ''
      ${category ? Prisma.sql`AND p."categoryId" = (SELECT id FROM categories WHERE slug = ${category})` : Prisma.empty}
      ${featured ? Prisma.sql`AND p."isFeatured"` : Prisma.empty}
      AND (
        strpos(${normalize(Prisma.sql`p.name`)}, search.term) > 0
        OR strpos(${normalize(Prisma.sql`p.slug`)}, search.term) > 0
        OR strpos(${normalize(Prisma.sql`p."metaTitle"`)}, search.term) > 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(${aliasesBySlug}::jsonb -> p.slug, '[]')) AS alias(value)
          WHERE strpos(${normalize(Prisma.sql`alias.value`)}, search.term) > 0
        )
        OR EXISTS (
          SELECT 1 FROM product_plans plan
          WHERE plan."productId" = p.id AND plan."isActive"
            AND strpos(${normalize(Prisma.sql`plan.label`)}, search.term) > 0
        )
      )
    ORDER BY p."sortOrder" DESC, p."createdAt" DESC, p.id
  `;
}
