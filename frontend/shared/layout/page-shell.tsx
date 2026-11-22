import type { ReactNode } from 'react';

export function PageShell({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
