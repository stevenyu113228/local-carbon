#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createHighlighter } = require('shiki');
const { Resvg } = require('@resvg/resvg-js');

// ── Config ──────────────────────────────────────────────────────────
const DEFAULTS = {
  theme: 'one-dark-pro',
  padding: 40,
  fontSize: 14,
  lineHeight: 1.6,
  fontFamily: "'Fira Code', 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  borderRadius: 12,
  windowButtons: true,
  showLineNumbers: true,
  highlight: [],       // lines to highlight (1-based)
  width: null,         // custom width in px (null = auto)
};

// ── CLI ─────────────────────────────────────────────────────────────
function usage() {
  console.log(`
  Usage: node local-carbon.js <input-file> [output.png] [options]

  Options:
    --theme <name>       Shiki theme (default: one-dark-pro)
    --font-size <n>      Font size in px (default: 14)
    --no-line-numbers    Hide line numbers
    --lang <language>    Override language detection
    --highlight <lines>  Highlight specific lines (e.g. --highlight=1,3,5)
    --focus <lines>      Alias for --highlight
    --width <px>         Set exact image width (e.g. --width=800)
    --rules <json-file>  Color-override rules (regex→hex color JSON)
    --help               Show this help

  Examples:
    node local-carbon.js app.js
    node local-carbon.js main.py screenshot.png --theme github-dark
    node local-carbon.js app.js out.png --highlight=1,3 --width=800
`);
  process.exit(0);
}

function parseHighlight(val) {
  if (!val) return [];
  return val.split(',').map(s => Number(s.trim())).filter(n => n > 0);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help')) usage();

  const opts = { ...DEFAULTS };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--theme')           { opts.theme = args[++i]; }
    else if (arg === '--font-size')  { opts.fontSize = Number(args[++i]); }
    else if (arg === '--lang')       { opts.lang = args[++i]; }
    else if (arg === '--no-line-numbers') { opts.showLineNumbers = false; }
    else if (arg === '--width')      { opts.width = Number(args[++i]); }
    else if (arg.startsWith('--highlight=')) { opts.highlight = parseHighlight(arg.split('=')[1]); }
    else if (arg.startsWith('--focus='))     { opts.highlight = parseHighlight(arg.split('=')[1]); }
    else if (arg === '--highlight' || arg === '--focus') { opts.highlight = parseHighlight(args[++i]); }
    else if (arg === '--rules')      { opts.rulesFile = args[++i]; }
    else { positional.push(arg); }
  }

  opts.inputFile = positional[0];
  if (!opts.inputFile) { console.error('Error: no input file specified'); process.exit(1); }
  opts.outputFile = positional[1] || opts.inputFile.replace(/\.[^.]+$/, '') + '.png';
  return opts;
}

// ── Language detection ──────────────────────────────────────────────
const EXT_MAP = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', cs: 'csharp',
  cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  sh: 'bash', zsh: 'bash', bash: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', html: 'html', css: 'css', sql: 'sql',
  dockerfile: 'dockerfile', tf: 'hcl', zig: 'zig',
};

function detectLang(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  const ext = base.split('.').pop();
  return EXT_MAP[ext] || 'text';
}

// ── SVG helpers ─────────────────────────────────────────────────────
function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function macButtons(x, y) {
  return `
    <circle cx="${x}" cy="${y}" r="6" fill="#FF5F57"/>
    <circle cx="${x + 20}" cy="${y}" r="6" fill="#FFBD2E"/>
    <circle cx="${x + 40}" cy="${y}" r="6" fill="#28C840"/>`;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  // Read source code
  if (!fs.existsSync(opts.inputFile)) {
    console.error(`Error: file not found: ${opts.inputFile}`);
    process.exit(1);
  }
  const code = fs.readFileSync(opts.inputFile, 'utf-8').replace(/\t/g, '    ');
  const lang = opts.lang || detectLang(opts.inputFile);

  // Syntax highlight
  const highlighter = await createHighlighter({
    themes: [opts.theme],
    langs: [lang],
  });

  let tokens = highlighter.codeToTokensBase(code, { lang, theme: opts.theme });
  const themeObj = highlighter.getTheme(opts.theme);
  const bgColor = themeObj.bg || '#282c34';
  const fgColor = themeObj.fg || '#abb2bf';

  // ── Token post-processing: apply color-override rules ──
  if (opts.rulesFile) {
    const rulesJson = JSON.parse(fs.readFileSync(opts.rulesFile, 'utf-8'));
    const rules = Object.entries(rulesJson).map(([pattern, color]) => ({
      regex: new RegExp(pattern, 'g'),
      color,
    }));

    tokens = tokens.map(lineTokens => {
      // Build flat text for this line
      const lineText = lineTokens.map(t => t.content).join('');

      // Collect all match intervals: { start, end, color }
      const intervals = [];
      for (const rule of rules) {
        rule.regex.lastIndex = 0;
        let m;
        while ((m = rule.regex.exec(lineText)) !== null) {
          if (m[0].length === 0) break; // avoid infinite loop on zero-width match
          intervals.push({ start: m.index, end: m.index + m[0].length, color: rule.color });
        }
      }

      if (intervals.length === 0) return lineTokens;

      // Sort intervals by start position (later rules override earlier ones at same position)
      intervals.sort((a, b) => a.start - b.start || a.end - b.end);

      // Build a color-override map: for each character position, the last matching rule wins
      const overrides = new Array(lineText.length).fill(null);
      for (const iv of intervals) {
        for (let i = iv.start; i < iv.end; i++) {
          overrides[i] = iv.color;
        }
      }

      // Split tokens according to override boundaries
      const newTokens = [];
      let pos = 0;
      for (const token of lineTokens) {
        const len = token.content.length;
        let offset = 0;
        while (offset < len) {
          const curOverride = overrides[pos + offset];
          // Find run of same override within this token
          let runEnd = offset + 1;
          while (runEnd < len && overrides[pos + runEnd] === curOverride) {
            runEnd++;
          }
          newTokens.push({
            content: token.content.slice(offset, runEnd),
            color: curOverride || token.color,
          });
          offset = runEnd;
        }
        pos += len;
      }
      return newTokens;
    });
  }

  // Measure dimensions
  const lines = code.split('\n');
  const charW = opts.fontSize * 0.6;                   // monospace char width estimate
  const lineH = Math.round(opts.fontSize * opts.lineHeight);
  const gutterW = opts.showLineNumbers ? (String(lines.length).length * charW + 24) : 0;
  const maxLineChars = Math.max(...lines.map(l => l.length));

  const innerPad = 20;                                  // padding inside card
  const titleBarH = opts.windowButtons ? 44 : 0;       // taller title bar for spacing
  const codeW = gutterW + maxLineChars * charW + 32;   // 32 = right padding
  const codeH = lines.length * lineH + 16;             // 16 = bottom padding

  const autoCardW = codeW + 2 * innerPad;
  const cardW = opts.width ? (opts.width - 2 * opts.padding) : autoCardW;
  const cardH = titleBarH + codeH + innerPad;
  const totalW = opts.width || (cardW + 2 * opts.padding);
  const totalH = cardH + 2 * opts.padding;

  // Highlight set for quick lookup
  const highlightSet = new Set(opts.highlight);

  // Build SVG token spans — one <text> per line with <tspan> for colors
  const textAttrs = `font-family="${opts.fontFamily}" font-size="${opts.fontSize}" xml:space="preserve"`;
  let svgLines = '';
  tokens.forEach((lineTokens, lineIdx) => {
    const lineNum = lineIdx + 1;
    const y = opts.padding + titleBarH + (lineNum) * lineH;
    const codeX = opts.padding + innerPad + gutterW;

    // Highlight background for focused lines
    if (highlightSet.has(lineNum)) {
      const rectY = y - lineH + 4;  // align with text baseline
      svgLines += `<rect x="${opts.padding + 1}" y="${rectY}" width="${cardW - 2}" height="${lineH}" fill="${fgColor}" opacity="0.08" rx="2"/>`;
    }

    // Line number
    if (opts.showLineNumbers) {
      const num = String(lineNum).padStart(String(lines.length).length, ' ');
      svgLines += `<text x="${opts.padding + innerPad}" y="${y}" fill="${fgColor}" opacity="0.35" ${textAttrs}>${num}</text>`;
    }

    // Code tokens — single <text> with tspans preserves whitespace correctly
    let spans = '';
    lineTokens.forEach(token => {
      const color = token.color || fgColor;
      const text = escapeXml(token.content);
      spans += `<tspan fill="${color}">${text}</tspan>`;
    });
    svgLines += `<text x="${codeX}" y="${y}" fill="${fgColor}" ${textAttrs}>${spans}</text>`;
  });

  // Defs (shadow filter only, no gradient)
  const defs = `
    <defs>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>`;

  // Assemble SVG — transparent background, just the card + shadow
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  ${defs}
  <!-- card -->
  <rect x="${opts.padding}" y="${opts.padding}" width="${cardW}" height="${cardH}" rx="${opts.borderRadius}" fill="${bgColor}" filter="url(#shadow)"/>
  ${opts.windowButtons ? macButtons(opts.padding + innerPad, opts.padding + 22) : ''}
  <!-- code -->
  ${svgLines}
</svg>`;

  // Render to PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(totalW * 2) },   // 2× for retina
    font: { loadSystemFonts: true },
    background: 'rgba(0, 0, 0, 0)',  // transparent background
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  fs.writeFileSync(opts.outputFile, pngBuffer);
  console.log(`✓ Saved ${opts.outputFile}  (${Math.round(pngBuffer.length / 1024)} KB, ${pngData.width}×${pngData.height})`);

  highlighter.dispose();
}

main().catch(err => { console.error(err); process.exit(1); });
