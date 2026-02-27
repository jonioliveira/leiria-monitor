/**
 * Generates all PWA icon sizes from public/icon-512.png
 * Run: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
const source = join(publicDir, "icon-512.png");

// Standard sizes needed across Android, Windows, and legacy browsers
// 512 is the source file — skip to avoid input/output conflict
const sizes = [72, 96, 128, 144, 152, 180, 192, 384];

for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// Maskable icons — icon centered in 80% safe zone on app background color
// The outer 10% padding on each side is the "bleed" area that may be cropped
const maskableSizes = [192, 512];
const BG = { r: 12, g: 15, b: 26, alpha: 1 }; // #0c0f1a

for (const size of maskableSizes) {
  const iconSize = Math.round(size * 0.8);
  const padding = Math.round(size * 0.1);

  const resized = await sharp(source).resize(iconSize, iconSize).toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: resized, left: padding, top: padding }])
    .png()
    .toFile(join(publicDir, `icon-maskable-${size}.png`));
  console.log(`✓ icon-maskable-${size}.png`);
}

// apple-touch-icon — iOS home screen icon (must be exactly 180×180)
await sharp(source)
  .resize(180, 180)
  .png()
  .toFile(join(publicDir, "apple-touch-icon.png"));
console.log("✓ apple-touch-icon.png");

console.log("\nAll icons generated.");
