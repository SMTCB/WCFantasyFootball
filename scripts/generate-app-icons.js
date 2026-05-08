#!/usr/bin/env node

/**
 * App Icon Generator
 * Generates iOS and Android app icons from base SVG tactical icon
 *
 * Usage: node scripts/generate-app-icons.js
 *
 * Requires: sharp, svg2img, or ImageMagick installed
 * npm install sharp
 */

const fs = require('fs');
const path = require('path');

// Create icon with tactical design (cyan/gray/white theme)
const createBaseIcon = () => {
  return `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Dark background with slight gradient -->
  <rect width="512" height="512" fill="#080A0E"/>

  <!-- Rounded corner mask effect -->
  <rect width="512" height="512" rx="110" fill="#0F1218"/>

  <!-- Tactical Icon (centered, scaled) -->
  <g transform="translate(156, 156) scale(2)">
    <!-- FWD Line -->
    <rect x="10" y="28" width="80" height="12" rx="2" fill="#00B4D8" opacity="0.95"/>
    <!-- MID Line -->
    <rect x="10" y="44" width="50" height="12" rx="2" fill="#F2EEE5" opacity="0.95"/>
    <!-- DEF Line -->
    <rect x="10" y="60" width="22" height="12" rx="2" fill="#8B95A1" opacity="0.95"/>
  </g>

  <!-- Subtle corner accent (top right) -->
  <circle cx="450" cy="62" r="45" fill="#00B4D8" opacity="0.15"/>
</svg>
  `.trim();
};

// iOS icon sizes (from Contents.json specification)
const iosIconSizes = [
  { size: 20, scale: 2, idiom: 'iphone' },   // 40x40
  { size: 20, scale: 3, idiom: 'iphone' },   // 60x60
  { size: 29, scale: 2, idiom: 'iphone' },   // 58x58
  { size: 29, scale: 3, idiom: 'iphone' },   // 87x87
  { size: 40, scale: 2, idiom: 'iphone' },   // 80x80
  { size: 40, scale: 3, idiom: 'iphone' },   // 120x120
  { size: 60, scale: 2, idiom: 'iphone' },   // 120x120 (duplicate)
  { size: 60, scale: 3, idiom: 'iphone' },   // 180x180
  { size: 20, scale: 1, idiom: 'ipad' },     // 20x20
  { size: 20, scale: 2, idiom: 'ipad' },     // 40x40
  { size: 29, scale: 1, idiom: 'ipad' },     // 29x29
  { size: 29, scale: 2, idiom: 'ipad' },     // 58x58
  { size: 40, scale: 1, idiom: 'ipad' },     // 40x40
  { size: 40, scale: 2, idiom: 'ipad' },     // 80x80
  { size: 76, scale: 1, idiom: 'ipad' },     // 76x76
  { size: 76, scale: 2, idiom: 'ipad' },     // 152x152
  { size: 83.5, scale: 2, idiom: 'ipad' },   // 167x167
  { size: 1024, scale: 1, idiom: 'ios-marketing' }, // 1024x1024
];

// Android icon sizes (mipmap directories)
const androidIconSizes = [
  { name: 'ldpi', size: 36 },
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 },
];

console.log('🎨 App Icon Generator — Forza Fantasy League');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Check for sharp
try {
  require.resolve('sharp');
} catch {
  console.error('\n❌ Error: sharp is not installed.');
  console.error('Install it with: npm install --save-dev sharp\n');
  process.exit(1);
}

const sharp = require('sharp');
const baseSvg = Buffer.from(createBaseIcon());

console.log('\n📱 Generating iOS App Icons...');
const iosDir = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');

// Ensure iOS directory exists
if (!fs.existsSync(iosDir)) {
  fs.mkdirSync(iosDir, { recursive: true });
}

// Generate iOS icons
const iosImages = [];
let iosCount = 0;

Promise.all(iosIconSizes.map(async (spec) => {
  const finalSize = spec.size * spec.scale;
  const filename = `AppIcon-${finalSize}x${finalSize}@${spec.scale}x.png`;

  try {
    await sharp(baseSvg)
      .resize(finalSize, finalSize, { fit: 'cover' })
      .png()
      .toFile(path.join(iosDir, filename));

    iosImages.push({
      filename,
      idiom: spec.idiom,
      size: `${spec.size}x${spec.size}`,
      scale: `${spec.scale}x`,
    });

    iosCount++;
    console.log(`  ✓ ${finalSize}x${finalSize}@${spec.scale}x`);
  } catch (err) {
    console.error(`  ✗ Failed to generate ${finalSize}x${finalSize}:`, err.message);
  }
})).then(() => {
  console.log(`\n✅ Generated ${iosCount} iOS icons\n`);

  // Generate iOS Contents.json
  const iosContents = {
    images: iosImages.map((img) => ({
      filename: img.filename,
      idiom: img.idiom,
      size: img.size,
      scale: img.scale,
    })),
    info: {
      author: 'xcode',
      version: 1,
    },
  };

  fs.writeFileSync(
    path.join(iosDir, 'Contents.json'),
    JSON.stringify(iosContents, null, 2)
  );
  console.log('  ✓ Contents.json created');

  // Android icons
  console.log('\n🤖 Generating Android App Icons...');
  const androidBaseDir = path.join(__dirname, '../android/app/src/main/res');
  let androidCount = 0;

  Promise.all(androidIconSizes.map(async (spec) => {
    const mmapDir = path.join(androidBaseDir, `mipmap-${spec.name}`);

    // Ensure directory exists
    if (!fs.existsSync(mmapDir)) {
      fs.mkdirSync(mmapDir, { recursive: true });
    }

    try {
      await sharp(baseSvg)
        .resize(spec.size, spec.size, { fit: 'cover' })
        .png()
        .toFile(path.join(mmapDir, 'ic_launcher.png'));

      androidCount++;
      console.log(`  ✓ mipmap-${spec.name} (${spec.size}x${spec.size})`);
    } catch (err) {
      console.error(`  ✗ Failed to generate ${spec.name}:`, err.message);
    }
  })).then(() => {
    console.log(`\n✅ Generated ${androidCount} Android icons\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 App icon generation complete!');
    console.log('\nNext steps:');
    console.log('  1. Review icons in Xcode (ios/App/App.xcodeproj)');
    console.log('  2. Review icons in Android Studio (android/)');
    console.log('  3. npx cap sync to copy to native projects');
    console.log('  4. Build and test on device: npx cap run ios/android\n');
  }).catch(err => {
    console.error('Error generating Android icons:', err);
    process.exit(1);
  });
}).catch(err => {
  console.error('Error generating iOS icons:', err);
  process.exit(1);
});
