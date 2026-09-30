import type {
  CreateSnippetInput,
  SnippetDto,
  SnippetSortField,
  SortOrder,
  UpdateSnippetInput,
} from '@snippets/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SnippetPage } from '@/lib/api';
import {
  createSnippet,
  deleteSnippet,
  describeError,
  getSnippet,
  listSnippets,
  listTags,
  testRegex,
  updateSnippet,
} from '@/lib/api';

/** Sama dengan `API_DEFAULT_AUTHOR_ID` di API; hanya untuk kartu optimistic. */
const DEFAULT_AUTHOR_ID = '00000000-0000-4000-8000-000000000001';

export interface SnippetFilters {
  q?: string;
  language?: string;
  tags?: string;
  sort?: SnippetSortField;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}

export const queryKeys = {
  snippets: ['snippets'] as const,
  /** Prefix khusus cache list; dipakai saat patch optimistic. */
  listPrefix: ['snippets', 'list'] as const,
  list: (filters: SnippetFilters) => ['snippets', 'list', filters] as const,
  detail: (id: string) => ['snippets', 'detail', id] as const,
  tags: ['tags'] as const,
};

export function useSnippets(filters: SnippetFilters) {
  return useQuery({
    queryKey: queryKeys.list(filters),
    queryFn: () => listSnippets(filters),
    // Hasil sebelumnya tetap ditampilkan selama data baru dimuat, jadi tidak ada kedip.
    placeholderData: keepPreviousData,
  });
}

export function useSnippet(id: string) {
  return useQuery({
    queryKey: queryKeys.detail(id),
    queryFn: () => getSnippet(id),
    enabled: id.length > 0,
  });
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: listTags,
    staleTime: 60_000,
  });
}

/** Kartu sementara yang muncul seketika, sebelum API menjawab. */
function buildOptimisticSnippet(input: CreateSnippetInput): SnippetDto {
  const now = new Date().toISOString();

  return {
    // Bukan UUID asli; hanya hidup di cache sampai data dari server tiba.
    id: `optimistic-${Date.now()}`,
    title: input.title,
    code: input.code,
    language: input.language,
    description: input.description ?? null,
    tags: input.tags ?? [],
    authorId: input.authorId ?? DEFAULT_AUTHOR_ID,
    embeddingStatus: 'pending',
    rank: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function useCreateSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSnippet,
    async onMutate(input) {
      await queryClient.cancelQueries({ queryKey: queryKeys.snippets });

      // Dibatasi ke prefix list. `queryKeys.snippets` juga cocok dengan cache
      // detail (['snippets','detail',id]) yang isinya SnippetDto -- bila ikut
      // ter-patch, bentuknya rusak dan `page.meta` jadi undefined.
      const snapshot = queryClient.getQueriesData<SnippetPage>({ queryKey: queryKeys.listPrefix });
      const optimistic = buildOptimisticSnippet(input);

      for (const [key, page] of snapshot) {
        // Hanya cache halaman pertama yang disisipi kartu baru.
        if (page?.meta.page !== 1) {
          continue;
        }

        queryClient.setQueryData<SnippetPage>(key, {
          items: [optimistic, ...page.items],
          meta: { ...page.meta, total: page.meta.total + 1 },
        });
      }

      return { snapshot };
    },
    onError(error, _input, context) {
      for (const [key, page] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, page);
      }

      toast.error(describeError(error));
    },
    onSuccess(created) {
      queryClient.setQueryData(queryKeys.detail(created.id), created);
      toast.success(`Snippet "${created.title}" disimpan`);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.snippets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export function useUpdateSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSnippetInput }) =>
      updateSnippet(id, patch),
    onSuccess(updated) {
      queryClient.setQueryData(queryKeys.detail(updated.id), updated);
      toast.success('Perubahan disimpan');
    },
    onError(error) {
      toast.error(describeError(error));
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.snippets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export function useDeleteSnippet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSnippet,
    onSuccess(id) {
      queryClient.removeQueries({ queryKey: queryKeys.detail(id) });
      toast.success('Snippet dihapus');
    },
    onError(error) {
      toast.error(describeError(error));
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.snippets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

/** Dipakai tab "Uji regex" di halaman detail. */
export function useTestRegex() {
  return useMutation({
    mutationFn: testRegex,
    onError(error) {
      toast.error(describeError(error));
    },
  });
}
