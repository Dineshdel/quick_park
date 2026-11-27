import Ionicons from '@expo/vector-icons/Ionicons';
import type { BrandLogo } from '@qp/validation';
import { Linking, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandTile } from './brand-icon';
import { useDialog } from './dialog';
import { ListItem, SheetHandle, Text, type IconName } from './kit';
import { useTheme } from './theme';

interface MapApp {
  key: string;
  /** Real logo, when one is available. */
  logo?: BrandLogo;
  name: string;
  hint: string;
  icon: IconName;
  color: string;
  /** Tried in order: the app's own link first, then a web link that opens the app (or the browser). */
  urls: string[];
}

/** Map apps offered for directions on this phone. */
function mapApps(lat: number, lng: number, label: string): MapApp[] {
  const name = encodeURIComponent(label);
  const google: MapApp = {
    key: 'google',
    logo: 'googlemaps',
    name: 'Google Maps',
    hint: 'Turn-by-turn directions',
    icon: 'logo-google',
    color: '#1a73e8',
    urls: [
      ...(Platform.OS === 'ios'
        ? [`comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`]
        : [`google.navigation:q=${lat},${lng}&mode=d`]),
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    ],
  };
  const waze: MapApp = {
    key: 'waze',
    logo: 'waze',
    name: 'Waze',
    hint: 'Live traffic routes',
    icon: 'car',
    color: '#33ccff',
    urls: [`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`],
  };
  if (Platform.OS === 'ios')
    return [
      {
        key: 'apple',
        name: 'Apple Maps',
        hint: 'Built into your iPhone',
        icon: 'logo-apple',
        color: '#111111',
        urls: [
          `maps://?daddr=${lat},${lng}&dirflg=d`,
          `https://maps.apple.com/?daddr=${lat},${lng}`,
        ],
      },
      google,
      waze,
    ];
  return [
    google,
    waze,
    {
      key: 'other',
      name: 'Other map apps',
      hint: 'Choose from the map apps on this phone',
      icon: 'apps',
      color: '#5f6b7a',
      // geo: makes Android show its own list of every installed map app.
      urls: [`geo:${lat},${lng}?q=${lat},${lng}(${name})`],
    },
  ];
}

/** Opens the first link the phone can handle. */
async function openFirst(urls: string[]) {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // not installed / not handled: try the next one
    }
  }
  throw new Error('No app on this phone can open directions.');
}

/**
 * "Get directions with…" bottom sheet: Apple Maps, Google Maps and Waze on iPhone; Google Maps, Waze and the
 * phone's own map-app chooser on Android.
 */
export function MapsSheet({
  open,
  onClose,
  lat,
  lng,
  label,
}: {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  label: string;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { showError } = useDialog();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: theme.card,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 16,
          gap: 10,
        }}
      >
        <SheetHandle />
        <View style={{ gap: 2, marginBottom: 4 }}>
          <Text variant="h2">Get directions</Text>
          <Text variant="small" numberOfLines={1}>
            to {label}
          </Text>
        </View>
        {mapApps(lat, lng, label).map((a) => (
          <ListItem
            key={a.key}
            left={
              a.logo ? (
                <BrandTile logo={a.logo} size={42} />
              ) : (
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    backgroundColor: a.color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={a.icon} size={22} color="#fff" />
                </View>
              )
            }
            title={a.name}
            subtitle={a.hint}
            onPress={() => {
              onClose();
              openFirst(a.urls).catch((e: unknown) => void showError(e, 'Could not open maps'));
            }}
          />
        ))}
      </View>
    </Modal>
  );
}
