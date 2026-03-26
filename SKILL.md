---
name: local-carbon
description: Generate beautiful Mac-style code screenshot PNGs from source files using syntax highlighting. Use when the user wants to create a code image, code screenshot, carbon-style image, or render code as a PNG. Triggers on phrases like "screenshot this code", "make a code image", "render code as PNG", "carbon screenshot", "code to image".
---

# Local Carbon

Convert source code files into beautiful Mac-style window PNG images with syntax highlighting, line numbers, and optional line highlighting.

## Quick Start

```bash
node {{skill_dir}}/scripts/local-carbon.js <input-file> [output.png] [options]
```

Output defaults to `<input-name>.png` in the same directory as the input file.

## Best Practices & Assistant Rules

**CRITICAL:** When you use this skill to generate an image for the user, you **MUST** immediately follow up with a `message` tool call to send the resulting image to the chat channel. **Do not** just run the `exec` command and stop, leaving the user waiting silently.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--theme <name>` | Shiki theme name | `one-dark-pro` |
| `--font-size <n>` | Font size in px | `14` |
| `--no-line-numbers` | Hide line numbers | shown |
| `--lang <language>` | Override auto-detected language | auto |
| `--highlight <lines>` | Highlight specific lines (comma-separated, 1-based) | none |
| `--focus <lines>` | Alias for `--highlight` | none |
| `--width <px>` | Set exact image width in pixels | auto |
| `--rules <json-file>` | Color-override rules (JSON: regex pattern → hex color) | none |

## Examples

Basic usage — auto-detects language and output filename:

```bash
node {{skill_dir}}/scripts/local-carbon.js app.js
# → saves app.png
```

Custom output path and theme:

```bash
node {{skill_dir}}/scripts/local-carbon.js main.py screenshot.png --theme github-dark
```

Highlight lines 1, 3, and 5 with a fixed width:

```bash
node {{skill_dir}}/scripts/local-carbon.js handler.ts out.png --highlight=1,3,5 --width=800
```

Apply custom color-override rules from a JSON file:

```bash
node {{skill_dir}}/scripts/local-carbon.js page.html out.png --rules rules_example.json
```

## Color-Override Rules (`--rules`)

Provide a JSON file mapping regex patterns to hex colors. Matches override the theme's syntax colors for matched text. Example `rules_example.json`:

```json
{
  "TODO": "#ffb86c",
  "FIXME": "#ff5555",
  "class=\".*?\"": "#50fa7b",
  "https?://.*?[\"\\s]": "#8be9fd"
}
```

Later entries take precedence when patterns overlap on the same character positions.

## Supported Languages

Auto-detected from file extension: JavaScript, TypeScript, Python, Ruby, Rust, Go, Java, Kotlin, C#, C/C++, Bash, JSON, YAML, TOML, Markdown, HTML, CSS, SQL, Dockerfile, HCL, Zig, and more. Use `--lang` to override.

## Dependencies

Requires `shiki` and `@resvg/resvg-js`. Install in the scripts directory:

```bash
cd {{skill_dir}}/scripts && npm install shiki @resvg/resvg-js
```
