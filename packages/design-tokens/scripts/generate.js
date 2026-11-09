/* Generates platform artifacts from the compiled tokens: CSS variables and Android Kotlin tokens. */
const fs = require('fs');
const path = require('path');
const t = require('../dist/index.js');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'tokens.css'), t.toCssVariables());

const kt = (hex) => `Color(0xFF${hex.replace('#', '').toUpperCase()})`;
const pascal = (k) => k.charAt(0).toUpperCase() + k.slice(1);
const lines = [
  '// GENERATED FILE — do not edit. Source: packages/design-tokens/src/index.ts',
  '// Regenerate with: npm run generate -w @mam/design-tokens',
  'package id.mam.app.ui.theme',
  '',
  'import androidx.compose.ui.graphics.Color',
  'import androidx.compose.ui.unit.dp',
  '',
  'object MamColors {',
  ...Object.entries(t.colors).map(([k, v]) => `    val ${pascal(k)} = ${kt(v)}`),
  '}',
  '',
  'object MamDarkColors {',
  ...Object.entries(t.darkColors).map(([k, v]) => `    val ${pascal(k)} = ${kt(v)}`),
  '}',
  '',
  'object MamSpacing {',
  ...Object.entries(t.spacing).map(([k, v]) => `    val ${pascal(k)} = ${v}.dp`),
  '}',
  '',
  'object MamRadius {',
  ...Object.entries(t.radius).map(([k, v]) => `    val ${pascal(k)} = ${v}.dp`),
  '}',
  '',
];
const ktPath = path.resolve(
  root,
  '../../apps/android/app/src/main/java/id/mam/app/ui/theme/MamTokens.kt',
);
fs.mkdirSync(path.dirname(ktPath), { recursive: true });
fs.writeFileSync(ktPath, lines.join('\n'));
console.log('Generated tokens.css and', path.relative(process.cwd(), ktPath));
