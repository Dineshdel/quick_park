'use client';

import { useEffect } from 'react';
import { reportError } from '@/shared/lib/report-error';

/** Last resort when the root layout itself fails: plain HTML, no app styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '80px 16px' }}>
        <h1>Quick Park is having trouble</h1>
        <p>Please try again in a moment.</p>
        <button onClick={reset} style={{ padding: '8px 16px', marginTop: 12 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
