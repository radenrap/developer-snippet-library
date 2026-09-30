import type { SnippetSortField } from '@snippets/shared';
import { DEFAULT_PAGE_SIZE } from '@snippets/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, SnippetGridSkeleton } from '@/components/feedback';
import { SearchToolbar } from '@/components/search-toolbar';
import { SnippetCard } from '@/components/snippet-card';
import { SnippetFormDialog } from '@/components/snippet-form-dialog';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useSnippets, useTags } from '@/hooks/use-snippets';
import { describeError } from '@/lib/api';

export function HomePage() {
  const [searchInput, setSearchInput] = useState('');
  // Debounce 300 ms: ketikan tidak langsung memicu request ke API.
  const search = useDebouncedValue(searchInput, 300);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [language, setLanguage] = useState('all');
  const [sort, setSort] = useState<SnippetSortField>('relevance');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const filters = useMemo(
    () => ({
      q: search.trim().length > 0 ? search.trim() : undefined,
      tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
      language: language === 'all' ? undefined : language,
      sort,
      order: 'desc' as const,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    [language, page, search, selectedTags, sort],
  );

  const { data, isPending, isFetching, isError, error } = useSnippets(filters);
  const { data: tags = [] } = useTags();

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const openCreate = useCallback(() => {
    setDialogOpen(true);
  }, []);

  useKeyboardShortcuts({ onFocusSearch: focusSearch, onCreate: openCreate });

  // Filter berubah -> kembali ke halaman pertama.
  useEffect(() => {
    setPage(1);
  }, [search, selectedTags, language, sort]);

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const hasFilters = Boolean(filters.q || filters.tags || filters.language);

  function toggleTag(name: string) {
    setSelectedTags((current) =>
      current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name],
    );
  }

  function resetFilters() {
    setSearchInput('');
    setSelectedTags([]);
    setLanguage('all');
    setSort('relevance');
    setPage(1);
  }

  const statusText = isPending
    ? 'Memuat snippet…'
    : filters.q
      ? `${total} hasil full-text untuk "${data?.meta.query ?? filters.q}"`
      : `${total} snippet`;

  return (
    <div className="flex flex-col gap-5">
      <SearchToolbar
        search={searchInput}
        onSearchChange={setSearchInput}
        searchRef={searchRef}
        isFetching={isFetching}
        tags={tags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        language={language}
        onLanguageChange={setLanguage}
        sort={sort}
        onSortChange={setSort}
        onCreate={openCreate}
      />

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {describeError(error)}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">{statusText}</p>

      {isPending ? (
        <SnippetGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'Tidak ada yang cocok' : 'Belum ada snippet'}
          description={
            hasFilters
              ? 'Coba ubah kata kunci, kurangi tag yang dipilih, atau ganti filter bahasa.'
              : 'Tambahkan snippet pertama Anda — atau tekan Cmd/Ctrl+K dari mana saja.'
          }
          actionLabel={hasFilters ? 'Reset filter' : 'Tambah snippet'}
          onAction={hasFilters ? resetFilters : openCreate}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((snippet) => (
            <SnippetCard key={snippet.id} snippet={snippet} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="size-4" />
            Sebelumnya
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || isFetching}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Berikutnya
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}

      <SnippetFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
