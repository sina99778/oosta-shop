/* eslint-disable @typescript-eslint/no-require-imports */
// One-off publisher for reviewed articles in content/blog/<slug>.md.
//
//   node scripts/publish-blog-content.cjs <contentDir> <slug> [<slug> ...]          # dry run
//   node scripts/publish-blog-content.cjs <contentDir> <slug> [...] --apply          # write
//
// Applies the same limits as the admin API (blog.schemas.ts / SAFE_RASTER_MIMES),
// never overwrites an existing slug, and writes each post + cover in one
// transaction. Prisma is only loaded with --apply (run inside the API container
// with NODE_PATH pointing at its node_modules).
const fs = require("node:fs");
const path = require("node:path");

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

function parseArticle(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(": ");
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 2).trim();
  }
  return { meta, content: match[2].trim() };
}

function coverMime(buffer) {
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  return null;
}

function load(dir, slug) {
  if (!SLUG.test(slug) || slug.length > 120) throw new Error(`invalid slug: ${slug}`);
  const { meta, content } = parseArticle(path.join(dir, `${slug}.md`));
  const title = (meta.title || "").trim();
  const excerpt = (meta.excerpt || "").trim() || null;
  if (meta.slug !== slug) throw new Error(`${slug}: front matter slug is ${meta.slug}`);
  if (!title || title.length > 200) throw new Error(`${slug}: title must be 1-200 chars`);
  if (excerpt && excerpt.length > 500) throw new Error(`${slug}: excerpt over 500 chars`);
  if (!content || content.length > 100000)
    throw new Error(`${slug}: content must be 1-100000 chars`);
  let cover = null;
  if (meta.cover) {
    const coverPath = path.resolve(dir, meta.cover);
    if (!coverPath.startsWith(path.resolve(dir) + path.sep))
      throw new Error(`${slug}: cover outside content dir`);
    const data = fs.readFileSync(coverPath);
    const mime = coverMime(data);
    if (!mime) throw new Error(`${slug}: cover is not webp/jpeg/png`);
    if (data.length > MAX_COVER_BYTES) throw new Error(`${slug}: cover over 5 MB`);
    cover = { data, mime };
  }
  return { slug, title, excerpt, content, cover };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const [dir, ...slugs] = args.filter((a) => a !== "--apply");
  if (!dir || slugs.length === 0) throw new Error("usage: <contentDir> <slug>... [--apply]");
  const posts = slugs.map((slug) => load(dir, slug));
  for (const p of posts)
    console.log(
      `${apply ? "PUBLISH" : "DRY-RUN"} ${p.slug}: ${p.content.length} chars, cover ${p.cover ? `${p.cover.mime} ${p.cover.data.length} B` : "none"}`,
    );
  if (!apply) return;

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.blogPost.findMany({
      where: { slug: { in: posts.map((p) => p.slug) } },
      select: { slug: true },
    });
    if (existing.length)
      throw new Error(`refusing to overwrite: ${existing.map((e) => e.slug).join(", ")}`);
    const now = new Date();
    await prisma.$transaction(
      posts.map((p, i) =>
        prisma.blogPost.create({
          data: {
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            content: p.content,
            status: "PUBLISHED",
            // Stagger by a second so the given order is the listing order (newest first).
            publishedAt: new Date(now.getTime() - i * 1000),
            coverData: p.cover ? new Uint8Array(p.cover.data) : null,
            coverMime: p.cover ? p.cover.mime : null,
          },
          select: { id: true },
        }),
      ),
    );
    console.log(`published ${posts.length} posts`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
