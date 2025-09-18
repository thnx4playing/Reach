import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, Dimensions, Image, Modal, FlatList } from 'react-native';
import type { MapName } from '../content/maps';

const { width, height } = Dimensions.get('window');

interface HomeScreenProps {
  onMapSelect: (map: MapName) => void;
  onPlay: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onMapSelect, onPlay }) => {
  const [selectedMap, setSelectedMap] = useState<MapName>('grassy');
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const maps: { name: MapName; displayName: string; color: string }[] = [
    { name: 'dark', displayName: 'Dark', color: '#2C2C2C' },
    { name: 'desert', displayName: 'Desert', color: '#D2B48C' },
    { name: 'dungeon', displayName: 'Dungeon', color: '#8B4513' },
    { name: 'frozen', displayName: 'Frozen', color: '#B0E0E6' },
    { name: 'grassy', displayName: 'Grassy', color: '#90EE90' },
  ];

  const handleMapSelect = (map: MapName) => {
    setSelectedMap(map);
    onMapSelect(map);
    setDropdownVisible(false);
  };
  
  const toggleDropdown = () => {
    setDropdownVisible(!dropdownVisible);
  };
  
  const selectedMapData = maps.find(m => m.name === selectedMap);

  const handlePlay = () => {
    onPlay();
  };
  
  // Set initial map selection on mount
  React.useEffect(() => {
    onMapSelect('grassy');
  }, [onMapSelect]);

  return (
    <View style={styles.container}>
      {/* Background image */}
      <Image 
        source={require('../../assets/background.png')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      
      <View style={styles.content}>
      </View>
      
      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        <View style={styles.controlsRow}>
          <Pressable style={styles.dropdownButton} onPress={toggleDropdown}>
            <Text style={styles.dropdownButtonText}>
              {selectedMapData?.displayName || 'Select Map'}
            </Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </Pressable>
          
          <Pressable
            style={styles.playButton}
            onPress={handlePlay}
          >
            <Text style={styles.playButtonText}>Play</Text>
          </Pressable>
        </View>
      </View>
      
      {/* Custom Dropdown Modal */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setDropdownVisible(false)}
        >
          <View style={styles.dropdownModal}>
            {maps.map((map) => (
              <Pressable
                key={map.name}
                style={[
                  styles.dropdownItem,
                  selectedMap === map.name && styles.selectedDropdownItem
                ]}
                onPress={() => handleMapSelect(map.name)}
              >
                <Text style={[
                  styles.dropdownItemText,
                  selectedMap === map.name && styles.selectedDropdownItemText
                ]}>
                  {map.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 75,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  dropdownButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
    width: 140,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    flex: 1,
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
    minWidth: 160,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 16,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  selectedDropdownItem: {
    backgroundColor: '#E8F5E8',
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2C2C2C',
    textAlign: 'center',
  },
  selectedDropdownItemText: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  playButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
