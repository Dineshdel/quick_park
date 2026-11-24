import Link from 'next/link';
import { Button } from '@/shared/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-20 text-center">
      <p className="text-5xl font-bold">404</p>
      <h1 className="text-xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="text-muted-foreground">
        The link may be old, or the parking place is no longer listed.
      </p>
      <div className="flex justify-center gap-2">
        <Button asChild>
          <Link href="/search">Find parking</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
