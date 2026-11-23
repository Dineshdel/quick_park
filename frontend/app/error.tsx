'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { reportError } from '@/shared/lib/report-error';
import { Button } from '@/shared/ui/button';

/** Shown when a page crashes; the header stays usable. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">Please try again. If it keeps happening, come back in a few minutes.</p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
