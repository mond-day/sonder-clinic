const BLOCK_RE = /\{\{#\s*([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g;
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.?]+)\s*\}\}/g;
const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'div', 'span']);

export type TemplateContext = Record<string, unknown>;

export function getPath(source: unknown, path: string): unknown {
  const clean = path.replace(/\?$/, '');
  if (!clean) return undefined;
  return clean.split('.').reduce<unknown>((current, key) => {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) {
      if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

export function renderTemplate(source: string, context: TemplateContext): string {
  const withBlocks = source.replace(BLOCK_RE, (_match, path: string, inner: string) => {
    const value = getPath(context, path);
    if (Array.isArray(value)) {
      if (!value.length) return '';
      return value.map((item) => {
        const itemContext = (item && typeof item === 'object' && !Array.isArray(item))
          ? { ...context, ...(item as Record<string, unknown>) }
          : { ...context, item };
        return renderTemplate(inner, itemContext);
      }).join('');
    }
    if (!isPresent(value)) return '';
    return renderTemplate(inner, context);
  });

  return withBlocks.replace(PLACEHOLDER_RE, (match, path: string) => {
    if (path.startsWith('#') || path.startsWith('/')) return match;
    const value = getPath(context, path);
    return stringifyValue(value);
  });
}

export function sanitizeTemplateHtml(input: string): string {
  const withoutScripts = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '');

  return withoutScripts.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    if (name === 'br') return match.startsWith('</') ? '' : '<br />';
    if (!ALLOWED_TAGS.has(name)) return '';
    if (match.startsWith('</')) return `</${name}>`;
    const safeAttrs = attrs
      .replace(/\s(style|src|href|srcset|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .trim();
    return safeAttrs ? `<${name}>` : `<${name}>`;
  });
}

export function textToHtml(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const paragraphs = escaped.split(/\n{2,}/).map((block) => {
    const lines = block.trim() ? block.replaceAll('\n', '<br />') : '';
    return lines ? `<p>${lines}</p>` : '';
  });
  return paragraphs.join('\n');
}

export function renderStructuredTemplate(
  structured: Record<string, unknown>,
  context: TemplateContext,
): { title: string; header: string; body: string; footer: string; signature: string; renderedText: string; renderedHtml: string } {
  const pick = (key: string) => renderTemplate(String(structured[key] ?? ''), context).trim();
  const title = pick('title');
  const header = pick('header');
  const body = pick('body');
  const footer = pick('footer');
  const signature = pick('signature');
  const renderedText = [title, header, body, footer, signature].filter(Boolean).join('\n\n');
  const renderedHtml = sanitizeTemplateHtml([
    title ? `<h1>${textToHtml(title).replace(/^<p>|<\/p>$/g, '')}</h1>` : '',
    header ? textToHtml(header) : '',
    body ? textToHtml(body) : '',
    footer ? textToHtml(footer) : '',
    signature ? `<p><em>${textToHtml(signature).replace(/^<p>|<\/p>$/g, '')}</em></p>` : '',
  ].filter(Boolean).join('\n'));
  return { title, header, body, footer, signature, renderedText, renderedHtml };
}
