import type { HighlighterCore } from 'shiki/core';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

/** Tema tunggal, dipilih agar serasi dengan UI gelap (index.html memasang class `dark`). */
const THEME = 'github-dark';

/**
 * Pemuat grammar, satu entri per bahasa yang didukung.
 *
 * Penting: memakai entry `shiki` biasa membuat Vite memecah SEMUA bahasa milik
 * shiki (~250 chunk, termasuk cpp/emacs-lisp berukuran ratusan KB) ke dalam dist.
 * Dengan `shiki/core` + dynamic import eksplisit, hanya bahasa di bawah ini yang
 * ikut ter-bundle, dan tetap dimuat malas saat pertama kali dipakai.
 */
const LANGUAGE_LOADERS = {
  bash: () => import('shiki/langs/bash.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};

type SupportedLanguage = keyof typeof LANGUAGE_LOADERS;

const SUPPORTED = new Set<string>(Object.keys(LANGUAGE_LOADERS));

/**
 * Kolom `language` di database bebas (varchar 50), jadi nilai di luar daftar
 * harus dipetakan. Catatan penting: `regex` BUKAN id grammar di Shiki --
 * dipakai JavaScript karena pola umumnya ditulis sebagai literal regex JS.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: 'javascript',
  golang: 'go',
  js: 'javascript',
  mjs: 'javascript',
  node: 'javascript',
  other: 'plaintext',
  postgres: 'sql',
  postgresql: 'sql',
  py: 'python',
  python3: 'python',
  regex: 'javascript',
  regexp: 'javascript',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  text: 'plaintext',
  txt: 'plaintext',
  yml: 'yaml',
  zsh: 'bash',
};

/** Bahasa yang aman dipakai untuk highlighting; fallback ke `plaintext`. */
export function resolveLanguage(language: string): SupportedLanguage | 'plaintext' {
  const normalized = language.trim().toLowerCase();
  const mapped = LANGUAGE_ALIASES[normalized] ?? normalized;

  return SUPPORTED.has(mapped) ? (mapped as SupportedLanguage) : 'plaintext';
}

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import('shiki/themes/github-dark.mjs')],
    langs: Object.values(LANGUAGE_LOADERS).map((load) => load()),
    engine: createOnigurumaEngine(import('shiki/wasm.mjs')),
  });

  return highlighterPromise;
}

/**
 * Menghasilkan HTML yang sudah di-highlight.
 * Highlighter-nya singleton dan dibuat malas, jadi biaya inisialisasi hanya
 * dibayar sekali per sesi.
 */
export async function highlightCode(code: string, language: string): Promise<string> {
  const highlighter = await getHighlighter();

  return highlighter.codeToHtml(code, {
    lang: resolveLanguage(language),
    theme: THEME,
  });
}
