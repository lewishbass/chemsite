# Chat Formatting Instructions

This chat component supports **Markdown**, **syntax-highlighted code blocks**, and **LaTeX math**.

## Quick reference

| Style | How-to |
|---|---|
| **Bold** | `**bold text**` |
| *Italic* | `*italic text*` |
| ~~Strikethrough~~ | `~~strikethrough~~` |
| `Inline code` | `` `inline code` `` |
| Headings | `# H1`, `## H2`, `### H3` |
| Lists | `- item` or `1. item` |
| Links | `[text](url)` |
| Blockquotes | `> quote` |
| Tables | `\| col1 \| col2 \|` (GFM style) |

## Code blocks

Wrap code in triple backticks with an optional language for syntax highlighting:

\`\`\`python
def hello():
    print("Hello, world!")
\`\`\`

Supported languages: `python`, `javascript`, `typescript`, `jsx`, `tsx`, `rust`, `go`, `java`, `c`, `cpp`, `bash`, `json`, `yaml`, `sql`, `html`, `css`, and many more.

## LaTeX math

Use `$...$` for inline math and `$$...$$` for block math:

- Inline: `$E = mc^2$` → $E = mc^2$
- Block:
  $$
  \int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
  $$
