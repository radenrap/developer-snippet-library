import type { SnippetSortField, TagDto } from '@snippets/shared';
import { KNOWN_LANGUAGES, SNIPPET_SORT_FIELDS } from '@snippets/shared';
import { cn } from 'cn';
import { Loader2, Plus, Search } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SORT_LABELS: Record<SnippetSortField, string> = {
  relevance: 'Relevansi',
  updatedAt: 'Terbaru diubah',
  createdAt: 'Terbaru dibuat',
  title: 'Judul (A-Z)',
};

interface SearchToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  isFetching: boolean;
  tags: TagDto[];
  selectedTags: string[];
  onToggleTag: (name: string) => void;
  language: string;
  onLanguageChange: (value: string) => void;
  sort: SnippetSortField;
  onSortChange: (value: SnippetSortField) => void;
  onCreate: () => void;
}

/**
 * Toolbar homepage: pencarian (dijalankan ter-debounce oleh pemanggil),
 * chips tag multi-select dengan semantik OR, filter bahasa, sortir, dan
 * tombol buat snippet.
 */
export function SearchToolbar({
  search,
  onSearchChange,
  searchRef,
  isFetching,
  tags,
  selectedTags,
  onToggleTag,
  language,
  onLanguageChange,
  sort,
  onSortChange,
  onCreate,
}: SearchToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Cari snippet, misalnya: regex email atau -python  (tekan /)"
            className="pl-9"
            aria-label="Cari snippet"
          />
          {isFetching ? (
            <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter bahasa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua bahasa</SelectItem>
            {KNOWN_LANGUAGES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => onSortChange(value as SnippetSortField)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Urutkan berdasarkan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SNIPPET_SORT_FIELDS.map((item) => (
              <SelectItem key={item} value={item}>
                {SORT_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={onCreate} className="shrink-0 gap-1.5">
          <Plus className="size-4" />
          Snippet
        </Button>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Tag:</span>
          {tags.map((tag) => {
            const isSelected = selectedTags.includes(tag.name);

            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggleTag(tag.name)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                #{tag.name}
                <span className="text-[10px] opacity-70">{tag.count}</span>
              </button>
            );
          })}
          {selectedTags.length > 0 ? (
            <span className="ml-1 text-xs text-muted-foreground">
              ({selectedTags.length} dipilih, OR)
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
