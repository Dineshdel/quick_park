import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/** Plain responsive table: columns + rows, horizontal scroll on small screens. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Nothing to show.',
  className,
}: {
  columns: { header: string; cell: (row: T) => ReactNode; className?: string }[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  className?: string;
}) {
  if (!rows.length)
    return (
      <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">{empty}</p>
    );
  return (
    <div className={cn('overflow-x-auto rounded-lg border', className)}>
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={cn('px-3 py-2 font-medium whitespace-nowrap', c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b align-top last:border-0">
              {columns.map((c) => (
                <td key={c.header} className={cn('px-3 py-2', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
