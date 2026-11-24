import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/lib/hooks';

export default function AuthLayout() {
  const s = useSession();
  if (s.status === 'authenticated') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
