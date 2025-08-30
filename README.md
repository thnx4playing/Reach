# Reach! - Vertical Tile-Based Jumper

A React Native game built with Expo SDK 53, React Native Skia, and TypeScript.

## Project Setup

### Dependencies
- **Expo SDK 53** (React Native 0.79 + React 19)
- **@shopify/react-native-skia@2.2.4** (pinned stable version)
- **react-native-gesture-handler** & **react-native-safe-area-context**
- **react-native-reanimated** with Babel plugin configuration

### Project Structure
```
src/
├── components/
│   └── DashCharacter.tsx     # Animated character component
├── content/
│   └── maps.ts              # Map registry and prefab system
├── hooks/
│   └── useAnimator.ts       # Animation frame hook
├── render/
│   ├── SpriteAtlasSprite.tsx # Atlas-based sprite rendering
│   └── PrefabNode.tsx       # Prefab rendering system
└── types/
    └── index.ts             # TypeScript definitions

assets/
├── character/dash/          # Character animations (118 files)
└── maps/                    # 5 map themes with prefabs
    ├── dark/               # Dark theme tiles and prefabs
    ├── desert/             # Desert theme tiles and prefabs
    ├── dungeon/            # Dungeon theme tiles and prefabs
    ├── frozen/             # Frozen theme tiles and prefabs
    └── grassy/             # Grassy theme tiles and prefabs
```

### Character System (Dash)
The character system supports multiple animations with automatic frame management:
- **Idle, Walk, Run, Jump, Crouch-Idle, Crouch-Walk, Hurt, Death**
- Uses atlas-based sprites with JSON frame data
- Configurable FPS per animation

### Prefab System
Five map themes with prefab support:
- **Dark, Desert, Dungeon, Frozen, Grassy**
- Each map includes tileset images, grid JSON, and prefab definitions
- Prefabs support null holes for complex shapes
- Scalable rendering with automatic frame management

### Available Prefabs
Each map theme includes prefabs like:
- **Platforms**: left-platform, right-platform, floor
- **Decorations**: vase, broke-vase, vase-tall, lit-torch
- **Lighting**: overhead-light
- And more...

### Map System
Basic level layouts for each map theme:
- **Floor at bottom** of screen for character to stand on
- **Left platform** flush against left side of screen
- **Right platform** flush against right side of screen  
- **Additional platforms** spaced around for jumping
- **Character spawns** on top of the floor

### App Features
- **Home Screen**: Map selector with 5 themed buttons and play button
- **Game Screen**: Renders selected map with character and platforms
- **Animation Controls**: Cycle through all 8 character animations
- **Navigation**: Back button to return to map selection

## Quick Setup

### For iOS Development (macOS)
```bash
# Make the setup script executable and run it
chmod +x setup-ios.sh
./setup-ios.sh

# Then open in Xcode
open ios/Reach.xcworkspace
```

### For Android Development (Windows/macOS/Linux)
```bash
# Windows PowerShell
.\setup-windows.ps1

# macOS/Linux
chmod +x setup-ios.sh
./setup-ios.sh
```

### Manual Setup
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# Start development server
npx expo start
```

## Running the Project
```bash
npm start          # Start Expo development server
npx expo start     # Alternative start command
npx expo start --dev-client  # For development builds
```

## Next Steps
Ready for game logic implementation:
- Physics system
- Input controls
- Game mechanics
- Level design
- Sound integration

The foundation is complete with proper asset integration and rendering pipeline.
