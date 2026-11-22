import Link from 'next/link';
import { Button } from '@/shared/ui/button';

export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Park without the search</h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Find parking near you or in another city, book by the hour, day, week, month or year, and enter with a QR
        code.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" asChild>
          <Link href="/register">I park vehicles</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/register?role=PARKING_OWNER">I own a parking place</Link>
        </Button>
      </div>
    </section>
  );
}
