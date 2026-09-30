import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateSnippetDto, CreateSnippetInput, SnippetDto } from '@snippets/shared';
import { KNOWN_LANGUAGES, MAX_TAGS_PER_SNIPPET } from '@snippets/shared';
import { createSnippetSchema } from '@snippets/shared/validators';
import { X } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  }, [form, open, snippet]);

  const selectedTags = form.watch('tags') ?? [];

  const suggestions = useMemo(() => {
    const needle = tagInput.trim().toLowerCase();

    return availableTags
      .filter((tag) => !selectedTags.includes(tag.name))
      .filter((tag) => needle.length === 0 || tag.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [availableTags, selectedTags, tagInput]);

  function addTag(name: string) {
    const clean = name.trim().replace(/^#/, '');

    if (clean.length === 0) {
      return;
    }

    const current = form.getValues('tags') ?? [];

    if (current.includes(clean)) {
      setTagInput('');

      return;
    }

    if (current.length >= MAX_TAGS_PER_SNIPPET) {
      toast.error(`Maksimal ${MAX_TAGS_PER_SNIPPET} tag per snippet`);

      return;
    }

    form.setValue('tags', [...current, clean], { shouldDirty: true });
    setTagInput('');
  }

  function removeTag(name: string) {
    const current = form.getValues('tags') ?? [];

    form.setValue(
      'tags',
      current.filter((tag) => tag !== name),
      { shouldDirty: true },
    );
  }

  function handleTagKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && tagInput.length === 0 && selectedTags.length > 0) {
      event.preventDefault();
      removeTag(selectedTags[selectedTags.length - 1] ?? '');
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
  const createTagLabel = tagInput.trim();
  const showCreateItem =
    createTagLabel.length > 0 && !suggestions.some((tag) => tag.name === createTagLabel);

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

              <FormItem>
                <FormLabel>Tag</FormLabel>
                <div className="rounded-md border">
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

                  <Command shouldFilter={false}>
                    <CommandInput
                      value={tagInput}
                      onValueChange={setTagInput}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Ketik tag lalu pilih dari saran…"
                      className="h-9"
                    />
                    <CommandList>
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
                  </Command>
                </div>
                <FormDescription>Maksimal {MAX_TAGS_PER_SNIPPET} tag.</FormDescription>
              </FormItem>
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
