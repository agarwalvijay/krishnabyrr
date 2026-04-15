import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TagGroup {
  name: string;
  label: string;
  display_order: number;
  is_filter: boolean;
  tag_count: number;
}

interface TagItem {
  id: string;
  group_name: string;
  value: string;
  hex_color: string | null;
  product_count: number;
}

// ── Tag slide-over ─────────────────────────────────────────────────────────────

const tagSchema = z.object({
  group_name: z.string().min(1, 'Group is required'),
  value: z.string().min(1, 'Value is required').max(80),
  hex_color: z.string().trim().optional()
    .refine((v) => !v || /^#[0-9A-Fa-f]{6}$/.test(v), 'Use format #RRGGBB'),
});
type TagFormData = z.infer<typeof tagSchema>;

function TagSlideOver({
  tag,
  groups,
  defaultGroup,
  onClose,
}: {
  tag: TagItem | null;
  groups: TagGroup[];
  defaultGroup?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = tag === null;

  const { register, handleSubmit, watch, formState: { errors, isDirty } } = useForm<TagFormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: {
      group_name: tag?.group_name ?? defaultGroup ?? groups[0]?.name ?? '',
      value: tag?.value ?? '',
      hex_color: tag?.hex_color ?? '',
    },
  });

  const currentHex = watch('hex_color');

  const saveMutation = useMutation({
    mutationFn: (data: TagFormData) => {
      const payload = { ...data, value: data.value.trim(), hex_color: data.hex_color?.trim() || null };
      return isNew ? api.post('/admin/tags', payload) : api.put(`/admin/tags/${tag!.id}`, payload);
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

        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Group</label>
              <select {...register('group_name')}>
                {groups.map((g) => (
                  <option key={g.name} value={g.name}>{g.label}</option>
                ))}
              </select>
              {errors.group_name && <p className="mt-1 text-xs text-kb-error">{errors.group_name.message}</p>}
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
              <input {...register('hex_color')} placeholder="#008080" />
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
                  Used by <strong>{tag?.product_count ?? 0}</strong> product(s).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${tag?.value}"?`)) deleteMutation.mutate();
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

// ── Tag group slide-over ───────────────────────────────────────────────────────

const groupSchema = z.object({
  name: z.string()
    .min(1, 'Required')
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, underscores only'),
  label: z.string().min(1, 'Required').max(100),
  display_order: z.coerce.number().int().min(0).default(0),
  is_filter: z.boolean().default(true),
});
type GroupFormData = z.infer<typeof groupSchema>;

function GroupSlideOver({
  group,
  onClose,
}: {
  group: TagGroup | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = group === null;

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: group?.name ?? '',
      label: group?.label ?? '',
      display_order: group?.display_order ?? 0,
      is_filter: group?.is_filter ?? true,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: GroupFormData) =>
      isNew
        ? api.post('/admin/tag-groups', data)
        : api.put(`/admin/tag-groups/${group!.name}`, data),
    onSuccess: () => {
      toast.success(isNew ? 'Tag group created' : 'Tag group updated');
      queryClient.invalidateQueries({ queryKey: ['admin-tag-groups'] });
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
    mutationFn: () => api.delete(`/admin/tag-groups/${group!.name}`),
    onSuccess: () => {
      toast.success('Tag group deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-tag-groups'] });
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
          <h2 className="text-base font-semibold text-kb-charcoal">
            {isNew ? 'New Tag Group' : `Edit Group: ${group.label}`}
          </h2>
          <button onClick={onClose} className="text-kb-muted hover:text-kb-charcoal">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Internal Name <span className="text-kb-error">*</span>
              </label>
              <input
                {...register('name')}
                placeholder="e.g. material"
                disabled={!isNew}
                className={!isNew ? 'opacity-60 cursor-not-allowed' : ''}
              />
              <p className="mt-1 text-xs text-kb-muted">Lowercase, no spaces. Cannot be changed after creation.</p>
              {errors.name && <p className="mt-1 text-xs text-kb-error">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Display Label <span className="text-kb-error">*</span>
              </label>
              <input {...register('label')} placeholder="e.g. Material" />
              {errors.label && <p className="mt-1 text-xs text-kb-error">{errors.label.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Display Order</label>
              <input {...register('display_order')} type="number" min={0} placeholder="0" />
              {errors.display_order && <p className="mt-1 text-xs text-kb-error">{errors.display_order.message}</p>}
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="is_filter" {...register('is_filter')} className="rounded" />
              <label htmlFor="is_filter" className="text-sm font-medium text-kb-charcoal">
                Show as filter on shop page
              </label>
            </div>

            {!isNew && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-kb-muted mb-2">
                  This group has <strong>{group.tag_count}</strong> tag(s). Delete all tags first before removing the group.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete group "${group.label}"? This cannot be undone.`)) deleteMutation.mutate();
                  }}
                  disabled={deleteMutation.isPending || group.tag_count > 0}
                  className="text-xs text-kb-error hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete this group'}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending || (!isNew && !isDirty)}>
              {saveMutation.isPending ? 'Saving…' : isNew ? 'Create Group' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Group section ──────────────────────────────────────────────────────────────

function GroupSection({
  group,
  items,
  onEditTag,
  onAddTag,
  onEditGroup,
}: {
  group: TagGroup;
  items: TagItem[];
  onEditTag: (tag: TagItem) => void;
  onAddTag: (groupName: string) => void;
  onEditGroup: (group: TagGroup) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-kb-charcoal">{group.label}</h3>
          <code className="text-xs text-kb-muted bg-gray-100 px-1.5 py-0.5 rounded">{group.name}</code>
          {group.is_filter && (
            <span className="text-xs text-kb-teal bg-kb-teal/10 px-1.5 py-0.5 rounded">filter</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddTag(group.name)}
            className="text-xs text-kb-teal hover:underline"
          >
            + Add Tag
          </button>
          <button
            onClick={() => onEditGroup(group)}
            className="text-xs text-kb-muted hover:text-kb-charcoal"
          >
            Edit Group
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-kb-muted">No tags yet.</div>
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
                  <button onClick={() => onEditTag(tag)} className="text-xs text-kb-teal hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TagsPage() {
  const [tagSlideOver, setTagSlideOver]     = useState<TagItem | 'new' | null>(null);
  const [groupSlideOver, setGroupSlideOver] = useState<TagGroup | 'new' | null>(null);
  const [addToGroup, setAddToGroup]         = useState<string | undefined>(undefined);

  const { data: groups = [], isLoading: groupsLoading } = useQuery<TagGroup[]>({
    queryKey: ['admin-tag-groups'],
    queryFn: () => api.get('/admin/tag-groups').then((r) => r.data.data ?? []),
  });

  const { data: tags = [], isLoading: tagsLoading } = useQuery<TagItem[]>({
    queryKey: ['admin-tags'],
    queryFn: () => api.get('/admin/tags').then((r) => r.data.data ?? []),
  });

  const tagsByGroup: Record<string, TagItem[]> = {};
  for (const g of groups) tagsByGroup[g.name] = [];
  for (const t of tags) {
    if (tagsByGroup[t.group_name]) tagsByGroup[t.group_name].push(t);
    else tagsByGroup[t.group_name] = [t];
  }

  const isLoading = groupsLoading || tagsLoading;

  return (
    <AdminLayout
      title="Tags"
      action={
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setGroupSlideOver('new')}>
            New Group
          </button>
          <button className="btn-primary" onClick={() => { setAddToGroup(undefined); setTagSlideOver('new'); }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Tag
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="card p-10 text-center text-kb-muted">
            No tag groups yet.{' '}
            <button className="text-kb-teal hover:underline" onClick={() => setGroupSlideOver('new')}>
              Create one
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <GroupSection
              key={group.name}
              group={group}
              items={tagsByGroup[group.name] ?? []}
              onEditTag={(tag) => setTagSlideOver(tag)}
              onAddTag={(g) => { setAddToGroup(g); setTagSlideOver('new'); }}
              onEditGroup={(g) => setGroupSlideOver(g)}
            />
          ))
        )}
      </div>

      {tagSlideOver !== null && (
        <TagSlideOver
          tag={tagSlideOver === 'new' ? null : tagSlideOver}
          groups={groups}
          defaultGroup={addToGroup}
          onClose={() => { setTagSlideOver(null); setAddToGroup(undefined); }}
        />
      )}

      {groupSlideOver !== null && (
        <GroupSlideOver
          group={groupSlideOver === 'new' ? null : groupSlideOver}
          onClose={() => setGroupSlideOver(null)}
        />
      )}
    </AdminLayout>
  );
}
