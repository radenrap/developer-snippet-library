/**
 * Seed script: mengisi 20 snippet contoh lintas bahasa + tag many-to-many.
 * Idempoten -- snippet yang judulnya sudah ada dilewati, jadi aman dijalankan ulang.
 *
 *   pnpm --filter @snippets/db db:seed
 *   FORCE_SEED=1 pnpm --filter @snippets/db db:seed   # kosongkan dulu, lalu isi ulang
 *
 * Kolom `search_vector` TIDAK diisi di sini -- trigger `snippets_search_vector_update`
 * yang menghitungnya saat INSERT, jadi seed ini sekaligus menguji trigger FTS.
 */
import { desc, sql } from 'drizzle-orm';
import { closeDb, getDb } from './client';
import { matchesSearch, searchRank } from './fts';
import type { NewSnippet } from './schema';
import { snippets, snippetTags, tags } from './schema';

/**
 * Placeholder author. Tabel users belum ada, jadi author_id berupa UUID tetap
 * tanpa foreign key (lihat komentar di schema/snippets.ts).
 */
const AUTHORS = {
  ada: '00000000-0000-4000-8000-000000000001',
  grace: '00000000-0000-4000-8000-000000000002',
  linus: '00000000-0000-4000-8000-000000000003',
} as const;

interface SeedSnippet {
  title: string;
  language: string;
  description: string;
  code: string;
  tags: string[];
  authorId: string;
}

const SEED_SNIPPETS: SeedSnippet[] = [
  {
    title: 'Debounce panggilan fungsi',
    language: 'javascript',
    description: 'Menunda eksekusi sampai input berhenti berubah selama periode tertentu.',
    code: `function debounce(fn, wait = 250) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}`,
    tags: ['async', 'utility', 'frontend'],
    authorId: AUTHORS.ada,
  },
  {
    title: 'Deep clone tanpa library',
    language: 'javascript',
    description: 'structuredClone menyalin nested object, array, Date, Map, dan Set.',
    code: `const original = { a: 1, nested: { b: [2, 3] } };
const copy = structuredClone(original);
copy.nested.b.push(4);
console.log(original.nested.b.length); // 2`,
    tags: ['utility', 'immutable'],
    authorId: AUTHORS.ada,
  },
  {
    title: 'Object.entries yang type-safe',
    language: 'typescript',
    description: 'Mengembalikan pasangan key/value dengan tipe literal, bukan [string, any].',
    code: `function entries<T extends object>(obj: T) {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}

const config = { host: 'localhost', port: 5432 };
for (const [key, value] of entries(config)) {
  console.log(key, value);
}`,
    tags: ['typing', 'utility'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'Discriminated union untuk hasil operasi',
    language: 'typescript',
    description: 'Pengganti exception: kesalahan jadi nilai yang harus ditangani compiler.',
    code: `type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function parsePort(raw: string): Result<number> {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'port tidak valid' };
  }
  return { ok: true, value: port };
}`,
    tags: ['typing', 'error-handling'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'List comprehension dengan filter',
    language: 'python',
    description: 'Membuat list baru sekaligus menyaring elemen dalam satu ekspresi.',
    code: `numbers = range(1, 21)
squares = [n * n for n in numbers if n % 2 == 0]
print(squares)  # [4, 16, 36, 64, 100, 144, 196, 256, 324, 400]`,
    tags: ['utility', 'collection'],
    authorId: AUTHORS.linus,
  },
  {
    title: 'Context manager untuk mengukur waktu',
    language: 'python',
    description: 'Blok with yang otomatis mencetak durasi eksekusi, aman terhadap exception.',
    code: `from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        print(label, round(time.perf_counter() - start, 4), "s")

with timer("loop"):
    sum(i * i for i in range(100000))`,
    tags: ['performance', 'utility'],
    authorId: AUTHORS.linus,
  },
  {
    title: 'Validasi email sederhana',
    language: 'regex',
    description: 'Cukup untuk form; hindari untuk verifikasi alamat yang benar-benar terkirim.',
    code: `const emailRegex = /^[\\w.+-]+@[\\w-]+\\.[\\w.-]{2,}$/;
console.log(emailRegex.test("dev@example.com")); // true
console.log(emailRegex.test("dev@example"));     // false`,
    tags: ['validation', 'regex', 'frontend'],
    authorId: AUTHORS.ada,
  },
  {
    title: 'Ekstrak semua URL dari teks',
    language: 'regex',
    description: 'Flag g wajib agar match() mengembalikan seluruh kemunculan.',
    code: `const urlRegex = /https?:\\/\\/[^\\s"'<>)]+/g;
const text = "Docs: https://example.dev/a dan http://localhost:3000";
const urls = text.match(urlRegex) ?? [];`,
    tags: ['parsing', 'regex', 'extraction'],
    authorId: AUTHORS.ada,
  },
  {
    title: 'Kekuatan password dengan lookahead',
    language: 'regex',
    description: 'Minimal 8 karakter dan memuat huruf kecil, huruf besar, serta angka.',
    code: `const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$/;
strongPassword.test("rahasia123"); // false, tanpa huruf besar
strongPassword.test("Rahasia123"); // true`,
    tags: ['validation', 'security', 'regex'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'Named capture group untuk tanggal ISO',
    language: 'regex',
    description: 'Grup bernama membuat hasil match bisa dibaca tanpa menghitung indeks.',
    code: `const isoDate = /(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/;
const match = isoDate.exec("rilis 2026-09-29");
console.log(match?.groups); // { year: '2026', month: '09', day: '29' }`,
    tags: ['parsing', 'regex', 'extraction'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'Regex escape karakter HTML',
    language: 'regex',
    description: 'Mengganti karakter berbahaya sebelum menyisipkan teks ke innerHTML.',
    code: `const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);`,
    tags: ['security', 'regex', 'frontend'],
    authorId: AUTHORS.ada,
  },
  {
    title: 'Tiga snippet terbaru per bahasa',
    language: 'sql',
    description: 'ROW_NUMBER() dengan PARTITION BY untuk top-N per grup.',
    code: `SELECT language, title, created_at
FROM (
  SELECT language, title, created_at,
         ROW_NUMBER() OVER (
           PARTITION BY language ORDER BY created_at DESC
         ) AS rn
  FROM snippets
) ranked
WHERE rn <= 3;`,
    tags: ['database', 'window-function'],
    authorId: AUTHORS.linus,
  },
  {
    title: 'CTE rekursif untuk data berjenjang',
    language: 'sql',
    description: 'Menelusuri tree kategori dari akar sampai daun beserta kedalamannya.',
    code: `WITH RECURSIVE tree AS (
  SELECT id, parent_id, name, 1 AS depth
  FROM categories
  WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.name, t.depth + 1
  FROM categories c
  JOIN tree t ON t.id = c.parent_id
)
SELECT * FROM tree ORDER BY depth, name;`,
    tags: ['database', 'recursive'],
    authorId: AUTHORS.linus,
  },
  {
    title: 'Full-text search dengan ts_rank_cd',
    language: 'sql',
    description: 'Pola query yang dipakai endpoint pencarian snippets di API ini.',
    code: `SELECT title, ts_rank_cd(search_vector, query) AS rank
FROM snippets,
     websearch_to_tsquery('english', 'regex validation') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;`,
    tags: ['database', 'search', 'fts'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'HTTP server minimal',
    language: 'go',
    description: 'Cukup standard library untuk service kecil plus graceful log.',
    code: `package main

import (
    "fmt"
    "log"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "hello")
    })
    log.Println("listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}`,
    tags: ['backend', 'http'],
    authorId: AUTHORS.linus,
  },
  {
    title: 'Pattern matching dengan enum',
    language: 'rust',
    description: 'Compiler memaksa semua varian ditangani, jadi tidak ada kasus terlupa.',
    code: `enum Shape {
    Circle(f64),
    Rect { w: f64, h: f64 },
}

fn area(shape: &Shape) -> f64 {
    match shape {
        Shape::Circle(r) => 3.14159 * r * r,
        Shape::Rect { w, h } => w * h,
    }
}`,
    tags: ['typing', 'utility'],
    authorId: AUTHORS.linus,
  },
  {
    title: 'Rename massal ke huruf kecil',
    language: 'bash',
    description: 'set -euo pipefail membuat script berhenti pada error pertama.',
    code: `#!/usr/bin/env bash
set -euo pipefail

for file in *.TXT; do
  [ -e "$file" ] || continue
  mv -- "$file" "\${file,,}"
done`,
    tags: ['cli', 'automation'],
    authorId: AUTHORS.ada,
  },
  {
    title: 'Grid responsif tanpa media query',
    language: 'css',
    description: 'auto-fit + minmax membuat jumlah kolom menyesuaikan lebar wadah.',
    code: `.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}`,
    tags: ['frontend', 'layout'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'Form dengan validasi native',
    language: 'html',
    description: 'required dan type=email memberi validasi browser tanpa JavaScript.',
    code: `<form>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required minlength="5" />
  <button type="submit">Kirim</button>
</form>`,
    tags: ['frontend', 'validation', 'a11y'],
    authorId: AUTHORS.grace,
  },
  {
    title: 'Promise.allSettled untuk request paralel',
    language: 'javascript',
    description: 'Semua promise dijalankan; kegagalan satu tidak membatalkan lainnya.',
    code: `const urls = ["/api/a", "/api/b", "/api/c"];
const results = await Promise.allSettled(urls.map((url) => fetch(url)));

for (const result of results) {
  if (result.status === "fulfilled") {
    console.log(result.value.status);
  } else {
    console.error(result.reason);
  }
}`,
    tags: ['async', 'http', 'error-handling'],
    authorId: AUTHORS.ada,
  },
];

async function main(): Promise<void> {
  const db = getDb();

  const existingRows = await db.select({ title: snippets.title }).from(snippets);
  const existingTitles = new Set(existingRows.map((row) => row.title));
  const force = process.env.FORCE_SEED === '1';

  await db.transaction(async (tx) => {
    if (force && existingTitles.size > 0) {
      console.log(`FORCE_SEED=1: mengosongkan ${existingTitles.size} snippet lama...`);
      await tx.delete(snippetTags);
      await tx.delete(snippets);
      await tx.delete(tags);
      existingTitles.clear();
    }

    // Idempoten: snippet contoh yang judulnya sudah ada tidak disisipkan ulang,
    // sehingga seed tidak pernah menghapus data yang bukan miliknya.
    const pending = SEED_SNIPPETS.filter((item) => !existingTitles.has(item.title));

    if (pending.length === 0) {
      console.log('Semua snippet contoh sudah ada; tidak ada baris baru.');
      return;
    }

    const rows: NewSnippet[] = pending.map((item) => ({
      title: item.title,
      code: item.code,
      language: item.language,
      description: item.description,
      authorId: item.authorId,
    }));

    const inserted = await tx.insert(snippets).values(rows).returning({ id: snippets.id });

    const uniqueTags = [...new Set(pending.flatMap((item) => item.tags))].sort();

    await tx
      .insert(tags)
      .values(uniqueTags.map((name) => ({ name })))
      .onConflictDoNothing({ target: tags.name });

    const allTags = await tx.select({ id: tags.id, name: tags.name }).from(tags);
    const tagIdByName = new Map(allTags.map((tag) => [tag.name, tag.id] as [string, string]));

    const links: { snippetId: string; tagId: string }[] = [];

    inserted.forEach((row, index) => {
      const source = pending[index];
      if (!source) {
        return;
      }

      for (const name of source.tags) {
        const tagId = tagIdByName.get(name);
        if (tagId) {
          links.push({ snippetId: row.id, tagId });
        }
      }
    });

    if (links.length > 0) {
      await tx.insert(snippetTags).values(links).onConflictDoNothing();
    }

    console.log(
      `Tertanam: ${inserted.length} snippet, ${uniqueTags.length} tag unik, ${links.length} relasi.`,
    );
  });

  // Bukti trigger FTS bekerja: kolom search_vector terisi otomatis saat INSERT.
  const filled = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(snippets)
    .where(sql`${snippets.searchVector} is not null`);

  console.log(`search_vector terisi pada ${filled[0]?.count ?? 0} baris (oleh trigger).`);

  // `.as('rank')` wajib: tanpa alias, drizzle tidak memberi nama kolom hasil
  // ekspresi sql mentah sehingga ORDER BY rank akan gagal.
  const rankColumn = searchRank('regex').as('rank');

  const found = await db
    .select({ title: snippets.title, language: snippets.language, rank: rankColumn })
    .from(snippets)
    .where(matchesSearch('regex validation'))
    .orderBy(desc(rankColumn))
    .limit(5);

  console.log(`FTS "regex validation" -> ${found.length} hasil:`);
  for (const row of found) {
    console.log(`  ${row.rank.toFixed(4)}  [${row.language}] ${row.title}`);
  }
}

try {
  await main();
  console.log('Seed selesai.');
} catch (error) {
  console.error('Seed gagal:', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
