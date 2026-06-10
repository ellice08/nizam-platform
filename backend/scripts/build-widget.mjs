import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIDGET_API_BASE = process.env.WIDGET_API_BASE ?? 'https://nizam-platform-production.up.railway.app';

const src = readFileSync(join(__dirname, '../public/widget.js'), 'utf-8');
const out = src.replace(/__API_BASE__/g, WIDGET_API_BASE);

const outDir = join(__dirname, '../dist/public');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'widget.js'), out, 'utf-8');

console.log(`[build-widget] API_BASE="${WIDGET_API_BASE}" → dist/public/widget.js`);
