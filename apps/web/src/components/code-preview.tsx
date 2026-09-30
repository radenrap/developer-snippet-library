import type { SnippetDto } from '@snippets/shared';

interface CodePreviewProps {
  snippet: SnippetDto;
  maxLines?: number;
}

/**
 * Preview kode polos untuk kartu (maksimum 5 baris).
 *
 * Sengaja TIDAK memakai Shiki: kartu tampil banyak sekaligus di grid, jadi
 * highlighting di sini akan membebani. File ini juga tidak mengimpor shiki,
 * sehingga grammar highlighter tidak ikut ke bundle halaman utama.
 */
export function CodePreview({ snippet, maxLines = 5 }: CodePreviewProps) {
  const lines = snippet.code.split('\n');
  const preview = lines.slice(0, maxLines).join('\n');
  const hasMore = lines.length > maxLines;

  return (
    <div className="relative">
      <pre className="max-h-36 overflow-hidden rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
        <code className="font-mono text-foreground/80">{preview}</code>
      </pre>
      {hasMore ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-md bg-gradient-to-t from-card to-transparent" />
      ) : null}
    </div>
  );
}
