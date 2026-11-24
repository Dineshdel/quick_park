import { Bike, Bus, BusFront, Car, Caravan, Truck, type LucideIcon } from 'lucide-react';

/** Icons for the seeded vehicle types; admin-added types fall back to a car. */
const ICONS: Record<string, LucideIcon> = {
  car: Car,
  bike: Bike,
  bus: Bus,
  'bus-front': BusFront,
  caravan: Caravan,
  truck: Truck,
};

export function VehicleIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Car;
  return <Icon className={className} aria-hidden />;
}
