'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { REQUIRED_KYC_DOCS, type KycDocType, type OwnerProfileDto } from '@qp/types';
import { ownerProfileSchema, type OwnerProfileInput } from '@qp/validation';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { PageShell } from '@/shared/layout/page-shell';
import { api, apiUpload, errorMessage } from '@/shared/lib/api';
import { fmtDateTime } from '@/shared/lib/format';
import { applyApiError } from '@/shared/lib/form-errors';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useOwnerProfile } from '../_components/use-owner';

const DOC_LABEL: Record<KycDocType, string> = { PAN: 'PAN card', AADHAAR: 'Aadhaar', GST_CERTIFICATE: 'GST certificate', LAND_PROOF: 'Proof of land use / rent agreement', OTHER: 'Other' };
type FormOut = z.output<typeof ownerProfileSchema>;
const blank = (p: OwnerProfileDto | null): OwnerProfileInput => ({
  businessName: p?.businessName ?? '',
  phone: p?.phone ?? '',
  address: p?.address ?? '',
  panNumber: p?.panNumber ?? '',
  gstin: p?.gstin ?? '',
  bankAccountName: p?.bankAccountName ?? '',
  bankAccountNumber: p?.bankAccountNumber ?? '',
  bankIfsc: p?.bankIfsc ?? '',
  upiId: p?.upiId ?? '',
});

export default function OnboardingPage() {
  const qc = useQueryClient();
  const profile = useOwnerProfile();
  const p = profile.data ?? null;
  const form = useForm<OwnerProfileInput, unknown, FormOut>({ resolver: zodResolver(ownerProfileSchema), defaultValues: blank(null) });
  const { errors, isSubmitting } = form.formState;
  const [saved, setSaved] = useState<string | null>(null);
  const [docType, setDocType] = useState<KycDocType>('PAN');
  const [docMsg, setDocMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile.data !== undefined) form.reset(blank(profile.data));
  }, [profile.data, form]);

  const locked = p?.kycStatus === 'PENDING';
  const setProfile = (data: OwnerProfileDto) => qc.setQueryData(['owner-profile'], data);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaved(null);
    try {
      setProfile(await api<OwnerProfileDto>('/owner/profile', { method: 'PUT', body: values }));
      setSaved('Saved.');
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  const upload = async (file: File) => {
    setBusy('upload');
    setDocMsg(null);
    try {
      const fd = new FormData();
      fd.append('docType', docType);
      fd.append('file', file);
      setProfile(await apiUpload<OwnerProfileDto>('/owner/kyc/documents', fd));
      setDocMsg({ ok: true, text: `${DOC_LABEL[docType]} uploaded.` });
    } catch (e) {
      setDocMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const missingDocs = REQUIRED_KYC_DOCS.filter((t) => !p?.documents.some((d) => d.docType === t));

  return (
    <PageShell title="Business & verification" description="We verify every parking owner before their places go live. Your documents are stored privately and only our admins can see them.">
      {p && (
        <Alert variant={p.kycStatus === 'APPROVED' ? 'success' : p.kycStatus === 'REJECTED' ? 'destructive' : 'default'}>
          <div className="flex flex-wrap items-center gap-2">
            Verification: <StatusPill status={p.kycStatus} />
            {p.kycStatus === 'PENDING' && p.kycSubmittedAt && <span>submitted {fmtDateTime(p.kycSubmittedAt)}. We usually review within 1–2 working days.</span>}
            {p.kycStatus === 'APPROVED' && <span>You can submit parking places for approval.</span>}
            {p.kycStatus === 'REJECTED' && <span>Reason: {p.kycRejectionReason}. Fix the details and submit again.</span>}
            {p.kycStatus === 'NOT_SUBMITTED' && <span>Fill in the details and documents below, then submit. You can create draft places meanwhile.</span>}
          </div>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Business profile</CardTitle>
            <CardDescription>Bank details or a UPI id are needed for payouts. Changing PAN, GSTIN or bank details after approval needs a new review.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              {errors.root && <Alert variant="destructive">{errors.root.message}</Alert>}
              {saved && <Alert variant="success">{saved}</Alert>}
              <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
                <FormField label="Business name" error={errors.businessName?.message}>
                  <Input {...form.register('businessName')} />
                </FormField>
                <FormField label="Mobile number" error={errors.phone?.message}>
                  <Input inputMode="tel" {...form.register('phone')} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Business address" error={errors.address?.message}>
                    <Input {...form.register('address')} />
                  </FormField>
                </div>
                <FormField label="PAN" error={errors.panNumber?.message} hint="ABCDE1234F">
                  <Input className="uppercase" {...form.register('panNumber')} />
                </FormField>
                <FormField label="GSTIN (optional)" error={errors.gstin?.message}>
                  <Input className="uppercase" {...form.register('gstin')} />
                </FormField>
                <FormField label="Account holder name" error={errors.bankAccountName?.message}>
                  <Input {...form.register('bankAccountName')} />
                </FormField>
                <FormField label="Account number" error={errors.bankAccountNumber?.message}>
                  <Input inputMode="numeric" {...form.register('bankAccountNumber')} />
                </FormField>
                <FormField label="IFSC" error={errors.bankIfsc?.message}>
                  <Input className="uppercase" {...form.register('bankIfsc')} />
                </FormField>
                <FormField label="UPI id (optional)" error={errors.upiId?.message}>
                  <Input {...form.register('upiId')} />
                </FormField>
              </fieldset>
              <Button type="submit" loading={isSubmitting} disabled={locked} className="justify-self-start">
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents</CardTitle>
              <CardDescription>Required: {REQUIRED_KYC_DOCS.map((t) => DOC_LABEL[t]).join(' and ')}. PDF or photo, up to 5 MB.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {docMsg && <Alert variant={docMsg.ok ? 'success' : 'destructive'}>{docMsg.text}</Alert>}
              {!p ? (
                <p className="text-sm text-muted-foreground">Save your business profile first.</p>
              ) : (
                <>
                  <ul className="grid gap-2">
                    {p.documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <FileText className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <b>{DOC_LABEL[d.docType]}</b> · {d.fileName}
                        </span>
                        {!locked && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${d.fileName}`}
                            onClick={async () => {
                              try {
                                setProfile(await api<OwnerProfileDto>(`/owner/kyc/documents/${d.id}`, { method: 'DELETE' }));
                              } catch (e) {
                                setDocMsg({ ok: false, text: errorMessage(e) });
                              }
                            }}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!locked && (
                    <div className="flex flex-wrap gap-2">
                      <Select value={docType} onChange={(e) => setDocType(e.target.value as KycDocType)} className="flex-1" aria-label="Document type">
                        {(Object.keys(DOC_LABEL) as KycDocType[]).map((t) => (
                          <option key={t} value={t}>
                            {DOC_LABEL[t]}
                          </option>
                        ))}
                      </Select>
                      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                      <Button variant="outline" loading={busy === 'upload'} onClick={() => fileRef.current?.click()}>
                        <Upload /> Upload
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          {p && (p.kycStatus === 'NOT_SUBMITTED' || p.kycStatus === 'REJECTED') && (
            <Card>
              <CardContent className="grid gap-3 pt-6">
                {missingDocs.length > 0 && <p className="text-sm text-muted-foreground">Still needed: {missingDocs.map((t) => DOC_LABEL[t]).join(', ')}.</p>}
                <Button
                  loading={busy === 'submit'}
                  onClick={async () => {
                    setBusy('submit');
                    setDocMsg(null);
                    try {
                      setProfile(await api<OwnerProfileDto>('/owner/kyc/submit', { method: 'POST' }));
                    } catch (e) {
                      setDocMsg({ ok: false, text: errorMessage(e) });
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Submit for verification
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
