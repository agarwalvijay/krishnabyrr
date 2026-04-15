import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

type TagGroup = 'fabric' | 'weave' | 'occasion' | 'color';

interface TagItem {
  id: string;
  group_name: TagGroup;
  value: string;
  hex_color: string | null;
  product_count: number;
}

const GROUPS: TagGroup[] = ['fabric', 'weave', 'occasion', 'color'];
const GROUP_LABELS: Record<TagGroup, string> = {
  fabric: 'Fabric Type',
  weave: 'Weave / Craft',
  occasion: 'Occasion',
  color: 'Color',
};

const tagSchema = z.object({
  group_name: z.enum(['fabric', 'weave', 'occasion', 'color']),
  value: z.string().min(1, 'Value is required').max(80),
  hex_color: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^#[0-9A-Fa-f]{6}$/.test(v), 'Use format #RRGGBB'),
});

type FormData = z.infer<typeof tagSchema>;

function TagSlideOver({ tag, onClose }: { tag: TagItem | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isNew = tag === null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: {
      group_name: tag?.group_name ?? 'fabric',
      value: tag?.value ?? '',
      hex_color: tag?.hex_color ?? '',
    },
  });

  const currentGroup = watch('group_name');
  const currentHex = watch('hex_color');

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        value: data.value.trim(),
        hex_color: data.hex_color?.trim() || null,
      };
      return isNew
        ? api.post('/admin/tags', payload)
        : api.put(`/admin/tags/${tag!.id}`, payload);
    },
    onSuccess: () => {
      toast.success(isNew ? 'Tag created' : 'Tag updated');
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Save failed';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/tags/${tag!.id}`),
    onSuccess: () => {
      toast.success('Tag deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Delete failed';
      toast.error(msg);
    },
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-kb-charcoal">{isNew ? 'New Tag' : 'Edit Tag'}</h2>
          <button onClick={onClose} className="text-kb-muted hover:text-kb-charcoal transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Group</label>
              <select {...register('group_name')}>
                {GROUPS.map((group) => (
                  <option key={group} value={group}>{GROUP_LABELS[group]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Value <span className="text-kb-error">*</span>
              </label>
              <input {...register('value')} placeholder="e.g. Banarasi" />
              {errors.value && <p className="mt-1 text-xs text-kb-error">{errors.value.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Color Hex <span className="text-kb-muted font-normal">(optional)</span>
              </label>
              <input {...register('hex_color')} placeholder={currentGroup === 'color' ? '#008080' : 'Optional'} />
              {errors.hex_color && <p className="mt-1 text-xs text-kb-error">{errors.hex_color.message}</p>}
              {currentHex && /^#[0-9A-Fa-f]{6}$/.test(currentHex) && (
                <div className="mt-2 flex items-center gap-2 text-xs text-kb-muted">
                  <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: currentHex }} />
                  Preview
                </div>
              )}
            </div>

            {!isNew && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-kb-muted mb-2">
                  This tag is currently used by <strong>{tag?.product_count ?? 0}</strong> product(s).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${tag?.value}" from ${GROUP_LABELS[tag!.group_name]}?`)) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-kb-error hover:underline disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete this tag'}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending || (!isNew && !isDirty)}>
              {saveMutation.isPending ? 'Saving…' : isNew ? 'Create Tag' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function GroupSection({
  group,
  items,
  onEdit,
}: {
  group: TagGroup;
  items: TagItem[];
  onEdit: (tag: TagItem) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-kb-charcoal">{GROUP_LABELS[group]}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-kb-muted">No tags in this group yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2 text-left font-medium text-kb-muted">Value</th>
              <th className="px-4 py-2 text-left font-medium text-kb-muted">Color</th>
              <th className="px-4 py-2 text-center font-medium text-kb-muted">Products</th>
              <th className="px-4 py-2 text-right font-medium text-kb-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((tag) => (
              <tr key={tag.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-kb-charcoal">{tag.value}</td>
                <td className="px-4 py-2.5">
                  {tag.hex_color ? (
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: tag.hex_color }} />
                      <code className="text-xs text-kb-muted">{tag.hex_color}</code>
                    </div>
                  ) : (
                    <span className="text-xs text-kb-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center text-kb-muted">{tag.product_count}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => onEdit(tag)} className="text-xs text-kb-teal hover:underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TagsPage() {
  const [slideOver, setSlideOver] = useState<TagItem | 'new' | null>(null);

  const { data, isLoading, isError } = useQuery<TagItem[]>({
    queryKey: ['admin-tags'],
    queryFn: async () => {
      const res = await api.get('/admin/tags');
      return res.data.data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const out: Record<TagGroup, TagItem[]> = { fabric: [], weave: [], occasion: [], color: [] };
    (data ?? []).forEach((tag) => {
      if (GROUPS.includes(tag.group_name)) {
        out[tag.group_name].push(tag);
      }
    });
    return out;
  }, [data]);

  return (
    <AdminLayout
      title="Tags"
      action={
        <button className="btn-primary" onClick={() => setSlideOver('new')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Tag
        </button>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="card p-10 text-center text-kb-muted">Failed to load tags.</div>
        ) : (
          GROUPS.map((group) => (
            <GroupSection
              key={group}
              group={group}
              items={grouped[group]}
              onEdit={(tag) => setSlideOver(tag)}
            />
          ))
        )}
      </div>

      {slideOver && (
        <TagSlideOver
          tag={slideOver === 'new' ? null : slideOver}
          onClose={() => setSlideOver(null)}
        />
      )}
    </AdminLayout>
  );
}
