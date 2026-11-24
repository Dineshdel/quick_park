import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fileUrl } from '../lib/config';
import { Text } from './kit';

/** Horizontal photo strip; tap opens a full-screen swipeable viewer with a counter. */
export function PhotoGallery({
  photos,
  height = 200,
}: {
  photos: { id: string; url: string }[];
  height?: number;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  if (!photos.length) return null;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
      >
        {photos.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => setIndex(i)}
            accessibilityLabel={`Open photo ${i + 1} of ${photos.length}`}
          >
            <Image
              source={{ uri: fileUrl(p.url) }}
              style={{ width: height * 1.45, height, borderRadius: 14 }}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={index !== null}
        animationType="fade"
        onRequestClose={() => setIndex(null)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={index ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <View style={{ width, justifyContent: 'center' }}>
                <Image
                  source={{ uri: fileUrl(item.url) }}
                  style={{ width, height: '80%' }}
                  contentFit="contain"
                />
              </View>
            )}
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + 10,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text color="#fff">
                {(index ?? 0) + 1} / {photos.length}
              </Text>
            </View>
            <Pressable
              onPress={() => setIndex(null)}
              accessibilityLabel="Close"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 22, padding: 10 }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
