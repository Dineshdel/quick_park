/**
 * Stock car-park photos (Unsplash) shown for a place whose owner hasn't uploaded any yet.
 * Each one was checked by eye to really show parking.
 */
const STOCK = [
  'photo-1506521781263-d8422e82f27a', // open-air lot from above
  'photo-1590674899484-d5640e854abe', // underground garage, yellow pillars
  'photo-1573348722427-f1d6819fdf98', // covered deck at night
  'photo-1470224114660-3f6686c562eb', // rooftop bays, yellow lines
  'photo-1621929747188-0b4dc28498d2', // street parking under trees
  'photo-1604063155785-ee4488b8ad15', // empty basement deck
  'photo-1545179605-1296651e9d43', // garage with bay lights
  'photo-1593280405106-e438ebe93f5b', // full lot from a drone
];

/**
 * A stock photo picked from the place's id: it looks random across places but stays the same for one
 * place, so the picture doesn't change every time the page refreshes its data.
 */
export function placeholderPhoto(seed: string, width = 800): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const id = STOCK[h % STOCK.length]!;
  return `https://images.unsplash.com/${id}?w=${width}&q=70&auto=format&fit=crop`;
}
