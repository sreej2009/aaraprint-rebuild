#!/usr/bin/env node
/**
 * Convert the original site's content and policy pages into structured JSON blocks.
 * The wording is Aaraprint's own business content; only the presentation is new.
 *
 * Reads (read-only): ../recovered/pages/<page>/index.html
 * Writes:            src/data/generated/content/<page>.json
 *
 * Email addresses are replaced with a `support-email` token: the original used a
 * placeholder address, so the real one comes from configuration (VITE_SUPPORT_EMAIL).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const RECOVERED = path.resolve(process.argv[2] ?? '../recovered');
const OUT = path.resolve('src/data/generated/content');

const PROSE_PAGES = ['about', 'shipping', 'refund-policy', 'privacy', 'terms'];

async function load(page) {
  const html = await fs.readFile(path.join(RECOVERED, 'pages', page, 'index.html'), 'utf8');
  return { html, document: new JSDOM(html).window.document };
}

const clean = (text) => text.replace(/\s+/g, ' ');

/** Inline content: text runs with optional link / bold. */
function inlines(node) {
  const out = [];
  const push = (run) => {
    if (!run.text && run.type !== 'support-email') return;
    const last = out.at(-1);
    if (last && !last.href && !run.href && !last.type && !run.type && Boolean(last.strong) === Boolean(run.strong)) last.text += run.text;
    else out.push(run);
  };
  const walk = (el, strong) => {
    for (const child of el.childNodes) {
      if (child.nodeType === 3) push({ text: clean(child.textContent), ...(strong ? { strong: true } : {}) });
      else if (child.nodeType === 1) {
        if (child.getAttribute('aria-hidden') === 'true') continue;
        const tag = child.tagName.toLowerCase();
        if (tag === 'a') {
          const href = child.getAttribute('href') ?? '';
          if (href.startsWith('mailto:')) push({ type: 'support-email', text: '' });
          else push({ text: clean(child.textContent), href, ...(strong ? { strong: true } : {}) });
        } else if (tag === 'br') push({ text: ' ' });
        else walk(child, strong || tag === 'strong' || tag === 'b');
      }
    }
  };
  walk(node, false);
  if (out[0]?.text) out[0].text = out[0].text.trimStart();
  const last = out.at(-1);
  if (last?.text) last.text = last.text.trimEnd();
  return out.filter((r) => r.type || r.text);
}

const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'table', 'dl', 'h3']);

function toBlock(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'p') return { type: 'p', content: inlines(el) };
  if (tag === 'h3') return { type: 'h3', text: clean(el.textContent).trim() };
  if (tag === 'ul' || tag === 'ol') return { type: tag, items: [...el.querySelectorAll(':scope > li')].map(inlines) };
  if (tag === 'dl') {
    const items = [];
    for (const dt of el.querySelectorAll('dt')) items.push({ term: clean(dt.textContent).trim(), details: dt.nextElementSibling ? inlines(dt.nextElementSibling) : [] });
    return { type: 'dl', items };
  }
  if (tag === 'table') {
    return {
      type: 'table',
      head: [...el.querySelectorAll('thead th')].map((th) => clean(th.textContent).trim()),
      rows: [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((cell) => inlines(cell))),
    };
  }
  return null;
}

/** Block-level descendants in document order, without descending into blocks. */
function blocksIn(root) {
  const out = [];
  const walk = (el) => {
    for (const child of el.children) {
      if (BLOCK_TAGS.has(child.tagName.toLowerCase())) {
        const block = toBlock(child);
        if (block && !(block.type === 'p' && block.content.length === 0)) out.push(block);
      } else walk(child);
    }
  };
  walk(root);
  return out;
}

const slugify = (text) => text.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function proseFromDocument(document, page) {
  const main = document.querySelector('main');
  const header = main.querySelector('header');
  const h1 = main.querySelector('h1');
  const title = clean(h1.textContent).trim();
  const time = main.querySelector('time');
  const updated = time ? { iso: time.getAttribute('datetime'), label: clean(time.textContent).trim() } : null;

  let intro = [];
  if (header) {
    intro = [...header.querySelectorAll('p')].filter((p) => !p.querySelector('time')).map(inlines);
  }

  const summarySection = main.querySelector('section[aria-labelledby="summary-heading"]');
  const summary = summarySection
    ? {
        title: clean(summarySection.querySelector('h2').textContent).trim(),
        items: [...summarySection.querySelectorAll('li')].map((li) => {
          const [heading, text] = li.querySelectorAll('p');
          return { title: clean(heading?.textContent ?? '').trim(), text: text ? inlines(text) : [] };
        }),
        note: summarySection.querySelector(':scope > p') ? inlines(summarySection.querySelector(':scope > p')) : null,
      }
    : null;

  const sections = [];
  const article = main.querySelector('article');
  if (article) {
    for (const section of article.querySelectorAll(':scope > section')) {
      const h2 = section.querySelector('h2');
      const titleText = [...h2.childNodes].filter((n) => !(n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true')).map((n) => n.textContent).join('');
      sections.push({ id: section.id, title: clean(titleText).trim(), blocks: blocksIn(section).filter((b) => b.type !== 'h3' || b.text) });
    }
  } else {
    // Simple pages: everything after the h1, split at each h2.
    let current = { id: null, title: null, blocks: [] };
    const container = h1.parentElement;
    const nodes = [...container.parentElement.querySelectorAll('h2, p, ul, ol, table, dl')].filter((n) => !n.closest('header') || n.tagName === 'H2');
    for (const node of nodes) {
      if (node.closest('ul, ol, table, dl') && node.tagName === 'P') continue;
      if (node.tagName === 'H2') {
        if (current.blocks.length || current.title) sections.push(current);
        const t = clean(node.textContent).trim();
        current = { id: slugify(t), title: t, blocks: [] };
      } else if (node !== h1 && !header?.contains(node)) {
        const block = toBlock(node);
        if (block) current.blocks.push(block);
      }
    }
    if (current.blocks.length || current.title) sections.push(current);
  }

  const eyebrow = header?.querySelector('span') ? clean(header.querySelector('span').textContent).trim() : null;
  return { slug: page, eyebrow, title, updated, intro, summary, sections, toc: Boolean(article) };
}

/** FAQ answers live in the page's React Server Component payload (accordions start closed). */
function faqFromHtml(html) {
  let payload = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      payload += JSON.parse(`"${m[1]}"`);
    } catch {
      payload += m[1];
    }
  }
  const { document } = new JSDOM(html).window;
  const questions = [...document.querySelectorAll('main h3')].map((h) => clean(h.textContent).trim());
  return questions.map((question) => {
    const at = payload.indexOf(`"children":"${question}"`);
    const after = payload.slice(at + question.length, at + question.length + 2000);
    const answer = /"children":"((?:[^"\\]|\\.){20,})"/.exec(after)?.[1] ?? '';
    return { question, answer: JSON.parse(`"${answer}"`) };
  });
}

function creditsFromDocument(document) {
  return [...document.querySelectorAll('main li')].map((li) => {
    const links = [...li.querySelectorAll('a')];
    const photographer = links[0];
    const source = links.find((a) => a.textContent.includes('View source'));
    return {
      subject: clean(li.textContent).split('Photo by')[0].trim(),
      author: photographer ? clean(photographer.textContent).trim() : null,
      authorUrl: photographer?.getAttribute('href') ?? null,
      sourceUrl: source?.getAttribute('href') ?? null,
    };
  });
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const written = [];
  for (const page of PROSE_PAGES) {
    const { document } = await load(page);
    const doc = proseFromDocument(document, page);
    await fs.writeFile(path.join(OUT, `${page}.json`), JSON.stringify(doc, null, 2) + '\n');
    written.push(`${page}: ${doc.sections.length} sections`);
  }
  const faq = faqFromHtml((await load('faq')).html);
  await fs.writeFile(path.join(OUT, 'faq.json'), JSON.stringify(faq, null, 2) + '\n');
  written.push(`faq: ${faq.length} questions`);

  const credits = creditsFromDocument((await load('credits')).document);
  await fs.writeFile(path.join(OUT, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
  written.push(`credits: ${credits.length} entries`);
  console.log(written.join('\n'));
}

await main();
