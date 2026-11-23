'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api, ApiError } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { StatusBadge } from './status-badge';

/** Common shape of vehicle types and categories. `code` exists only on vehicle types. */
export interface MasterRow {
  id: string;
  code?: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}
interface FormValues {
  code?: string;
  name: string;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

const EMPTY: FormValues = { code: '', name: '', icon: '', sortOrder: 0, isActive: true };

/** List + create/edit form for a simple admin master (vehicle types, categories). */
export function SimpleMasterPage({
  endpoint,
  noun,
  schema,
  withCode = false,
}: {
  /** e.g. "/admin/categories" */
  endpoint: string;
  /** singular, lower case, e.g. "category" */
  noun: string;
  schema: z.ZodType<FormValues, FormValues>;
  withCode?: boolean;
}) {
  const qc = useQueryClient();
  const key = ['admin', endpoint];
  const list = useQuery({ queryKey: key, queryFn: () => api<MasterRow[]>(endpoint) });
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors, isSubmitting } = form.formState;

  const startEdit = (row: MasterRow | null) => {
    setEditing(row);
    setNotice(null);
    form.reset(row ? { ...row, icon: row.icon ?? '' } : EMPTY);
  };

  /** Back to "add" mode after a save, keeping the success notice. */
  const clearForm = () => {
    setEditing(null);
    form.reset(EMPTY);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { code, ...changes } = values;
        await api(`${endpoint}/${editing.id}`, { method: 'PATCH', body: changes });
        setNotice(`Saved “${values.name}”.`);
      } else {
        await api(endpoint, { body: withCode ? values : { ...values, code: undefined } });
        setNotice(`Added “${values.name}”.`);
      }
      clearForm();
      await qc.invalidateQueries({ queryKey: ['admin', endpoint] });
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });
  const rowAction = useMutation({
    mutationFn: async ({ row, action }: { row: MasterRow; action: 'toggle' | 'delete' }) => {
      if (action === 'delete') return api(`${endpoint}/${row.id}`, { method: 'DELETE' });
      return api(`${endpoint}/${row.id}`, { method: 'PATCH', body: { isActive: !row.isActive } });
    },
    onMutate: () => setRowError(null),
    onError: (e) => setRowError(e instanceof ApiError ? e.message : 'Something went wrong'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', endpoint] }),
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        {rowError && (
          <Alert variant="destructive" className="m-4">
            {rowError}
          </Alert>
        )}
        {list.isPending ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : list.isError ? (
          <Alert variant="destructive" className="m-4">
            Could not load the list.
          </Alert>
        ) : list.data.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nothing here yet. Add the first {noun} with the form.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr>
                  {withCode && <th className="px-4 py-2 font-medium">Code</th>}
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Icon</th>
                  <th className="px-4 py-2 text-right font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    {withCode && <td className="px-4 py-2 font-mono text-xs">{row.code}</td>}
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.icon ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.sortOrder}</td>
                    <td className="px-4 py-2">
                      <StatusBadge active={row.isActive} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={rowAction.isPending}
                          onClick={() => rowAction.mutate({ row, action: 'toggle' })}
                        >
                          {row.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={rowAction.isPending}
                          onClick={() => {
                            if (confirm(`Delete “${row.name}”? This cannot be undone.`)) {
                              rowAction.mutate({ row, action: 'delete' });
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{editing ? `Edit ${noun}` : `Add a ${noun}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {errors.root && <Alert variant="destructive">{errors.root.message}</Alert>}
            {notice && <Alert variant="success">{notice}</Alert>}
            {withCode && (
              <FormField
                label="Code"
                error={errors.code?.message}
                hint={editing ? 'The code cannot be changed.' : 'Capital letters, e.g. EV_CAR'}
              >
                <Input disabled={!!editing} autoCapitalize="characters" {...form.register('code')} />
              </FormField>
            )}
            <FormField label="Name" error={errors.name?.message}>
              <Input {...form.register('name')} />
            </FormField>
            <FormField label="Icon" error={errors.icon?.message} hint="Optional lucide icon name, e.g. car">
              <Input {...form.register('icon')} />
            </FormField>
            <FormField label="Display order" error={errors.sortOrder?.message} hint="Lower numbers show first">
              <Input type="number" min={0} {...form.register('sortOrder', { valueAsNumber: true })} />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('isActive')} /> Active (shown to users)
            </label>
            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                {editing ? 'Save changes' : `Add ${noun}`}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={() => startEdit(null)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
