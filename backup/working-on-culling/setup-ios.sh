#!/bin/bash

# Reach! iOS Setup Script
# This script prepares the project for iOS development with Xcode

echo "🎮 Setting up Reach! for iOS development..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is designed for macOS. Please run this on a Mac for iOS development."
    exit 1
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode is not installed. Please install Xcode from the App Store first."
    exit 1
fi

echo "✅ Xcode found: $(xcodebuild -version | head -n1)"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or 20 LTS first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check Node.js version (should be 18 or 20 LTS)
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [[ $NODE_VERSION -lt 18 || $NODE_VERSION -gt 20 ]]; then
    echo "⚠️  Warning: Node.js version $NODE_VERSION detected. Expo SDK 53 works best with Node.js 18 or 20 LTS."
    echo "   Consider updating to Node.js 18 or 20 LTS for best compatibility."
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm (comes with Node.js)."
    exit 1
fi

echo "✅ npm found: $(npm --version)"

# Check if Expo CLI is installed globally
if ! command -v expo &> /dev/null; then
    echo "📦 Installing Expo CLI globally..."
    npm install -g @expo/cli
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Expo CLI. Please try manually: npm install -g @expo/cli"
        exit 1
    fi
fi

echo "✅ Expo CLI found: $(expo --version)"

# Clean install dependencies
echo "🧹 Cleaning previous installations..."
rm -rf node_modules
rm -f package-lock.json
rm -rf .expo

echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies. Please check your internet connection and try again."
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Install iOS dependencies
echo "🍎 Installing iOS dependencies..."
npx expo install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install iOS dependencies."
    exit 1
fi

echo "✅ iOS dependencies installed"

# Prebuild for iOS (creates native iOS project)
echo "🔨 Prebuilding iOS project..."
npx expo prebuild --platform ios --clean

if [ $? -ne 0 ]; then
    echo "❌ Failed to prebuild iOS project."
    exit 1
fi

echo "✅ iOS project prebuilt successfully"

# Check if CocoaPods is installed
if ! command -v pod &> /dev/null; then
    echo "📦 Installing CocoaPods..."
    sudo gem install cocoapods
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install CocoaPods. Please install manually: sudo gem install cocoapods"
        exit 1
    fi
fi

echo "✅ CocoaPods found: $(pod --version)"

# Install iOS pods
echo "🍎 Installing iOS pods..."
cd ios
pod install
cd ..

if [ $? -ne 0 ]; then
    echo "❌ Failed to install iOS pods."
    exit 1
fi

echo "✅ iOS pods installed successfully"

# Create .gitignore if it doesn't exist
if [ ! -f .gitignore ]; then
    echo "📝 Creating .gitignore..."
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Expo
.expo/
dist/
web-build/

# Native
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# Debug
npm-debug.*
yarn-debug.*
yarn-error.*

# macOS
.DS_Store
*.pem

# local env files
.env*.local

# typescript
*.tsbuildinfo

# iOS
ios/build/
ios/Pods/
ios/*.xcworkspace/xcuserdata/
ios/*.xcodeproj/xcuserdata/
ios/*.xcodeproj/project.xcworkspace/xcuserdata/

# Android
android/app/build/
android/build/
android/.gradle/
android/captures/
android/gradlew
android/gradlew.bat
android/local.properties
android/*.iml
android/.idea/
android/app/release/

# Temporary files
*.tmp
*.temp
EOF
    echo "✅ .gitignore created"
fi

# Create README for iOS setup
echo "📖 Creating iOS setup instructions..."
cat > iOS-SETUP.md << 'EOF'
# iOS Development Setup for Reach!

## Prerequisites
- macOS (required for iOS development)
- Xcode 14+ (install from App Store)
- Node.js 18 or 20 LTS
- Expo CLI (installed by setup script)

## Quick Start
1. Run the setup script: `./setup-ios.sh`
2. Open the project in Xcode: `open ios/Reach.xcworkspace`
3. Select your target device or simulator
4. Build and run (⌘+R)

## Development Workflow

### Using Expo Development Build
```bash
# Start the development server
npx expo start --dev-client

# In Xcode, build and run the app
# The app will connect to the development server
```

### Using Expo Go (for testing)
```bash
# Start the development server
npx expo start

# Scan QR code with Expo Go app on your device
```

## Building for Production

### Development Build
```bash
# Create a development build
npx expo build:ios --type development-client
```

### Production Build
```bash
# Create a production build
npx expo build:ios --type archive
```

## Troubleshooting

### Common Issues
1. **Metro bundler issues**: Clear cache with `npx expo start --clear`
2. **Pod installation fails**: Try `cd ios && pod deintegrate && pod install`
3. **Build errors**: Clean build folder in Xcode (Product → Clean Build Folder)

### Useful Commands
```bash
# Clear all caches
npx expo start --clear

# Reset Metro cache
npx expo r -c

# Check project health
npx expo-doctor

# Update dependencies
npx expo install --fix
```

## Project Structure
- `ios/` - Native iOS project (auto-generated)
- `src/` - React Native source code
- `assets/` - Game assets (maps, character sprites)
- `App.tsx` - Main app component
EOF

echo "✅ iOS setup instructions created"

echo ""
echo "🎉 Setup complete! Your project is ready for iOS development."
echo ""
echo "Next steps:"
echo "1. Open the project in Xcode: open ios/Reach.xcworkspace"
echo "2. Select your target device or simulator"
echo "3. Build and run (⌘+R)"
echo ""
echo "For development, run: npx expo start --dev-client"
echo "Then build and run in Xcode to see your game!"
echo ""
echo "📖 See iOS-SETUP.md for detailed instructions and troubleshooting."
