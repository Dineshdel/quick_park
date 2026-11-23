'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CancellationPolicyDto } from '@qp/types';
import { cancellationPolicyCreateSchema, type CancellationPolicyCreateInput } from '@qp/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { PageShell } from '@/shared/layout/page-shell';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api, ApiError } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { StatusBadge } from '../_components/status-badge';

const ENDPOINT = '/admin/cancellation-policies';
const KEY = ['admin', ENDPOINT];

type FormIn = CancellationPolicyCreateInput;
type FormOut = z.output<typeof cancellationPolicyCreateSchema>;

const EMPTY: FormIn = {
  name: '',
  description: '',
  rules: [
    { hoursBefore: 2, refundPct: 100 },
    { hoursBefore: 0, refundPct: 0 },
  ],
  isDefault: false,
  isActive: true,
};

export default function CancellationPoliciesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: KEY, queryFn: () => api<CancellationPolicyDto[]>(ENDPOINT) });
  const [editing, setEditing] = useState<CancellationPolicyDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(cancellationPolicyCreateSchema),
    defaultValues: EMPTY,
  });
  const rules = useFieldArray({ control: form.control, name: 'rules' });
  const { errors, isSubmitting } = form.formState;

  const startEdit = (p: CancellationPolicyDto | null) => {
    setEditing(p);
    setNotice(null);
    form.reset(p ? { ...p, description: p.description ?? '' } : EMPTY);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        // The default flag can only be moved, never cleared, so don't send `false` for the current default.
        const body = editing.isDefault ? { ...values, isDefault: undefined } : values;
        await api(`${ENDPOINT}/${editing.id}`, { method: 'PATCH', body });
        setNotice(`Saved “${values.name}”.`);
      } else {
        await api(ENDPOINT, { body: values });
        setNotice(`Added “${values.name}”.`);
      }
      setEditing(null);
      form.reset(EMPTY);
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  const rowAction = useMutation({
    mutationFn: async ({ p, action }: { p: CancellationPolicyDto; action: 'default' | 'toggle' | 'delete' }) => {
      if (action === 'delete') return api(`${ENDPOINT}/${p.id}`, { method: 'DELETE' });
      const body = action === 'default' ? { isDefault: true, isActive: true } : { isActive: !p.isActive };
      return api(`${ENDPOINT}/${p.id}`, { method: 'PATCH', body });
    },
    onMutate: () => setRowError(null),
    onError: (e) => setRowError(e instanceof ApiError ? e.message : 'Something went wrong'),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  // Errors on the rules array as a whole (e.g. "Add a rule for 0 hours") arrive on `rules.root` or `rules`.
  const rulesError = errors.rules?.root?.message ?? errors.rules?.message;

  return (
    <PageShell
      title="Cancellation policies"
      description="Refund rules applied when a customer cancels. New places use the default policy."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        <div className="grid gap-3">
          {rowError && <Alert variant="destructive">{rowError}</Alert>}
          {list.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.isError ? (
            <Alert variant="destructive">Could not load the policies.</Alert>
          ) : list.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No policies yet. The first one you add becomes the default.</p>
          ) : (
            list.data.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    {p.isDefault && <StatusBadge active label="Default" />}
                    {!p.isActive && <StatusBadge active={false} />}
                  </div>
                  {p.description && <CardDescription>{p.description}</CardDescription>}
                </CardHeader>
                <CardContent className="grid gap-3">
                  <ul className="grid gap-1 text-sm">
                    {p.rules.map((r) => (
                      <li key={r.hoursBefore} className="flex justify-between gap-4 rounded bg-muted/40 px-3 py-1.5">
                        <span>{r.hoursBefore === 0 ? 'Less than that / no-show' : `${r.hoursBefore}+ hours before start`}</span>
                        <span className="font-medium tabular-nums">{r.refundPct}% refund</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
                      Edit
                    </Button>
                    {!p.isDefault && (
                      <>
                        <Button size="sm" variant="ghost" disabled={rowAction.isPending} onClick={() => rowAction.mutate({ p, action: 'default' })}>
                          Make default
                        </Button>
                        <Button size="sm" variant="ghost" disabled={rowAction.isPending} onClick={() => rowAction.mutate({ p, action: 'toggle' })}>
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={rowAction.isPending}
                          onClick={() => {
                            if (confirm(`Delete “${p.name}”? This cannot be undone.`)) rowAction.mutate({ p, action: 'delete' });
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editing ? 'Edit policy' : 'Add a policy'}</CardTitle>
            <CardDescription>
              Each rule means “cancelled at least N hours before start → refund X%”. Include a 0-hour rule for late cancellations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              {errors.root && <Alert variant="destructive">{errors.root.message}</Alert>}
              {notice && <Alert variant="success">{notice}</Alert>}
              <FormField label="Name" error={errors.name?.message}>
                <Input {...form.register('name')} />
              </FormField>
              <FormField label="Description" error={errors.description?.message} hint="Optional, shown to customers">
                <Input {...form.register('description')} />
              </FormField>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Refund rules</legend>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
                  <span>Hours before start (at least)</span>
                  <span>Refund %</span>
                  <span className="w-10" />
                </div>
                {rules.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      type="number"
                      min={0}
                      aria-label={`Rule ${i + 1} hours before start`}
                      aria-invalid={!!errors.rules?.[i]?.hoursBefore || undefined}
                      {...form.register(`rules.${i}.hoursBefore`, { valueAsNumber: true })}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Rule ${i + 1} refund percent`}
                      aria-invalid={!!errors.rules?.[i]?.refundPct || undefined}
                      {...form.register(`rules.${i}.refundPct`, { valueAsNumber: true })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove rule ${i + 1}`}
                      disabled={rules.fields.length === 1}
                      onClick={() => rules.remove(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {rulesError && <p className="text-sm text-destructive">{rulesError}</p>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={rules.fields.length >= 10}
                  onClick={() => rules.append({ hoursBefore: 24, refundPct: 100 })}
                >
                  <Plus /> Add rule
                </Button>
              </fieldset>

              {!editing?.isDefault && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" {...form.register('isDefault')} /> Make this the default policy
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" {...form.register('isActive')} /> Active
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <Button type="submit" loading={isSubmitting}>
                  {editing ? 'Save changes' : 'Add policy'}
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
    </PageShell>
  );
}
