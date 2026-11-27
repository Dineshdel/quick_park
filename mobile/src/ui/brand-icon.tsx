import { BRAND_LOGOS, type BrandLogo } from '@qp/validation';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** A real brand logo (Google Pay, PhonePe, Visa…) drawn in its own colour. */
export function BrandIcon({
  logo,
  size = 24,
  color,
}: {
  logo: BrandLogo;
  size?: number;
  color?: string;
}) {
  const b = BRAND_LOGOS[logo];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel={b.name}>
      <Path d={b.path} fill={color ?? b.color} />
    </Svg>
  );
}

/** Brand logo on a white rounded tile, like an app icon (white even in dark mode so brand colours read). */
export function BrandTile({ logo, size = 46 }: { logo: BrandLogo; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3.2,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <BrandIcon logo={logo} size={size * 0.58} />
    </View>
  );
}
