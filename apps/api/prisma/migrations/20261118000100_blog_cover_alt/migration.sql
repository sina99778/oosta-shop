-- Alt text for blog cover images (nullable; existing posts stay decorative).
ALTER TABLE "blog_posts" ADD COLUMN "coverAlt" TEXT;
