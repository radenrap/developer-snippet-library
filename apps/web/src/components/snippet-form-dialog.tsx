import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateSnippetDto, CreateSnippetInput, SnippetDto } from '@snippets/shared';
import { KNOWN_LANGUAGES, MAX_TAGS_PER_SNIPPET } from '@snippets/shared';
import { createSnippetSchema } from '@snippets/shared/validators';
import { X } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateSnippet, useTags, useUpdateSnippet } from '@/hooks/use-snippets';

interface SnippetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bila diisi, dialog berjalan dalam mode edit. */
  snippet?: SnippetDto | null;
}

const DEFAULT_VALUES: CreateSnippetInput = {
  title: '',
  code: '',
  language: 'javascript',
  description: '',
  tags: [],
};

/**
 * Dialog buat/edit snippet.
 *
 * Validasi memakai skema zod yang sama dengan API (`createSnippetSchema` dari
 * @snippets/shared) lewat react-hook-form, jadi aturan tidak diduplikasi.
 */
export function SnippetFormDialog({ open, onOpenChange, snippet = null }: SnippetFormDialogProps) {
  const isEdit = snippet !== null;
  const createMutation = useCreateSnippet();
  const updateMutation = useUpdateSnippet();
  const { data: availableTags = [] } = useTags();
  const [tagInput, setTagInput] = useState('');
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagBoxRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<CreateSnippetInput>({
    resolver: zodResolver(createSnippetSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // Sinkronkan isi form tiap dialog dibuka / snippet berganti.
  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      title: snippet?.title ?? DEFAULT_VALUES.title,
      code: snippet?.code ?? DEFAULT_VALUES.code,
      language: snippet?.language ?? DEFAULT_VALUES.language,
      description: snippet?.description ?? '',
      tags: snippet?.tags ?? [],
    });
    setTagInput('');
    setTagMenuOpen(false);
  }, [form, open, snippet]);

  const selectedTags = form.watch('tags') ?? [];
  const selectedLower = useMemo(
    () => new Set(selectedTags.map((tag) => tag.toLowerCase())),
    [selectedTags],
  );

  const suggestions = useMemo(() => {
    const needle = tagInput.trim().toLowerCase();

    return availableTags
      .filter((tag) => !selectedLower.has(tag.name.toLowerCase()))
      .filter((tag) => needle.length === 0 || tag.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [availableTags, selectedLower, tagInput]);

  /** Samakan kapitalisasi dengan tag yang sudah ada agar tidak timbul duplikat case. */
  function resolveTagName(raw: string): string {
    const clean = raw.trim().replace(/^#/, '');

    if (clean.length === 0) {
      return '';
    }

    const lower = clean.toLowerCase();
    const known = availableTags.find((tag) => tag.name.toLowerCase() === lower);

    if (known) {
      return known.name;
    }

    const selected = selectedTags.find((tag) => tag.toLowerCase() === lower);

    return selected ?? clean;
  }

  function addTag(raw: string) {
    const name = resolveTagName(raw);

    if (name.length === 0) {
      return;
    }

    const current = form.getValues('tags') ?? [];

    if (current.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
      setTagInput('');

      return;
    }

    if (current.length >= MAX_TAGS_PER_SNIPPET) {
      toast.error(`Maksimal ${MAX_TAGS_PER_SNIPPET} tag per snippet`);

      return;
    }

    form.setValue('tags', [...current, name], { shouldDirty: true, shouldValidate: true });
    setTagInput('');
    setTagMenuOpen(true);
  }

  function removeTag(name: string) {
    const current = form.getValues('tags') ?? [];

    form.setValue(
      'tags',
      current.filter((tag) => tag.toLowerCase() !== name.toLowerCase()),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function handleTagBlur() {
    // Tutup menu hanya bila fokus benar-benar keluar dari kotak tag. Klik saran
    // tidak memindahkan fokus dari input, jadi menu tetap terbuka untuk menambah lagi.
    window.setTimeout(() => {
      if (!tagBoxRef.current?.contains(document.activeElement)) {
        setTagMenuOpen(false);
      }
    }, 0);
  }

  const createTagLabel = tagInput.trim().replace(/^#/, '');
  const showCreateItem =
    createTagLabel.length > 0 &&
    !selectedLower.has(createTagLabel.toLowerCase()) &&
    !suggestions.some((tag) => tag.name.toLowerCase() === createTagLabel.toLowerCase());

  function handleTagKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && tagInput.length === 0 && selectedTags.length > 0) {
      event.preventDefault();
      removeTag(selectedTags[selectedTags.length - 1] ?? '');

      return;
    }

    if (event.key === 'Escape') {
      setTagMenuOpen(false);

      return;
    }

    const hasItems = suggestions.length > 0 || showCreateItem;

    // Koma = commit tag yang sedang diketik. Enter tanpa item juga di-commit
    // (sekaligus mencegah submit form tersirat). Enter saat ada item dibiarkan
    // ke cmdk agar saran yang disorot tetap bisa dipilih lewat keyboard.
    if (event.key === ',' || (event.key === 'Enter' && !hasItems)) {
      event.preventDefault();
      addTag(tagInput);
    }
  }

  function onSubmit(values: CreateSnippetInput) {
    const description = values.description?.trim() ?? '';

    const payload: CreateSnippetDto = {
      title: values.title,
      code: values.code,
      language: values.language,
      description: description.length > 0 ? description : undefined,
      tags: values.tags ?? [],
    };

    if (isEdit && snippet) {
      updateMutation.mutate({ id: snippet.id, patch: payload });
    } else {
      createMutation.mutate(payload);
    }

    onOpenChange(false);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit snippet' : 'Tambah snippet'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Perubahan disimpan ke snippet yang sama; judul duplikat ditolak dengan 409.'
              : 'Kartu baru muncul langsung di daftar (optimistic) sebelum server menjawab.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(event) => {
              void form.handleSubmit(onSubmit)(event);
            }}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Judul</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Validasi email sederhana" maxLength={255} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bahasa</FormLabel>
                    <FormControl>
                      <Input {...field} list="language-options" placeholder="javascript" />
                    </FormControl>
                    <datalist id="language-options">
                      {KNOWN_LANGUAGES.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={() => (
                  <FormItem>
                    <FormLabel>Tag</FormLabel>
                    <div ref={tagBoxRef} className="relative rounded-md border">
                      {selectedTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 border-b p-2">
                          {selectedTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                              #{tag}
                              <button
                                type="button"
                                aria-label={`Hapus tag ${tag}`}
                                className="cursor-pointer rounded-sm opacity-60 hover:opacity-100"
                                onClick={() => removeTag(tag)}
                              >
                                <X className="size-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <Command
                        shouldFilter={false}
                        className="overflow-visible bg-transparent [&_[data-slot=command-input-wrapper]]:border-b-0"
                      >
                        <CommandInput
                          value={tagInput}
                          onValueChange={(value) => {
                            setTagInput(value);
                            setTagMenuOpen(true);
                          }}
                          onFocus={() => setTagMenuOpen(true)}
                          onBlur={handleTagBlur}
                          onKeyDown={handleTagKeyDown}
                          placeholder="Ketik tag lalu pilih dari saran…"
                          className="h-9"
                        />
                        {tagMenuOpen ? (
                          <CommandList className="absolute top-full left-0 z-50 mt-1 max-h-56 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                            <CommandEmpty>Tidak ada tag yang cocok.</CommandEmpty>
                            <CommandGroup>
                              {showCreateItem ? (
                                <CommandItem
                                  value={`buat:${createTagLabel}`}
                                  onSelect={() => addTag(createTagLabel)}
                                >
                                  Buat tag &quot;{createTagLabel}&quot;
                                </CommandItem>
                              ) : null}
                              {suggestions.map((tag) => (
                                <CommandItem key={tag.id} value={tag.name} onSelect={addTag}>
                                  #{tag.name}
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {tag.count}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        ) : null}
                      </Command>
                    </div>
                    <FormDescription>Maksimal {MAX_TAGS_PER_SNIPPET} tag.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ''}
                      rows={9}
                      spellCheck={false}
                      className="font-mono text-sm"
                      placeholder="const emailRegex = /^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/;"
                      onKeyDown={(event) => {
                        // Tab menyisipkan dua spasi, bukan memindahkan fokus.
                        if (event.key !== 'Tab') {
                          return;
                        }

                        event.preventDefault();

                        const element = event.currentTarget;
                        const { selectionStart, selectionEnd, value } = element;
                        const nextValue = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;

                        field.onChange(nextValue);

                        requestAnimationFrame(() => {
                          element.selectionStart = selectionStart + 2;
                          element.selectionEnd = selectionStart + 2;
                        });
                      }}
                    />
                  </FormControl>
                  <FormDescription>Tab menyisipkan indentasi, bukan pindah field.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deskripsi (opsional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      placeholder="Untuk apa snippet ini?"
                    />
                  </FormControl>
                  <FormDescription>
                    Deskripsi ikut diindeks full-text search dengan bobot B.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Buat snippet'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
