// Node script: generate src/assets/grassyPrefabs.ts with static requires
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../assets/maps/grassy/prefabs");
const OUT = path.resolve(__dirname, "../src/assets/grassyPrefabs.ts");

// Check if directory exists
if (!fs.existsSync(DIR)) {
  console.log(`Directory ${DIR} does not exist. Creating it...`);
  fs.mkdirSync(DIR, { recursive: true });
  console.log(`Created directory: ${DIR}`);
  console.log("Please add your prefab PNG files to this directory and run the script again.");
  process.exit(0);
}

const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith(".png"));
files.sort();

if (files.length === 0) {
  console.log(`No PNG files found in ${DIR}`);
  console.log("Please add your prefab PNG files to this directory and run the script again.");
  process.exit(0);
}

const lines = [];
lines.push("// AUTO-GENERATED — DO NOT EDIT BY HAND");
lines.push("// Run: npm run gen:grassy-manifest");
lines.push('export const grassyPrefabImages: Record<string, any> = {');

for (const f of files) {
  const name = path.basename(f, ".png"); // prefab name must match filename
  const rel = `../../assets/maps/grassy/prefabs/${f}`;
  lines.push(`  "${name}": require("${rel}"),`);
}

lines.push("};");
lines.push("");
lines.push("export type GrassyPrefabName =");
for (let i = 0; i < files.length; i++) {
  const name = path.basename(files[i], ".png");
  lines.push(`  | "${name}"`);
}
lines[lines.length - 1] = lines[lines.length - 1] + ";";

fs.writeFileSync(OUT, lines.join("\n"));
console.log(`Wrote ${OUT} with ${files.length} entries.`);
console.log("Files found:", files.join(", "));
