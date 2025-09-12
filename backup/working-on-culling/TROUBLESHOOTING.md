# Troubleshooting Guide for Reach!

## Common Issues and Solutions

### 1. "No script URL provided" Error

**Error Message:**
```
No script url provided make sure the packager is running or you have embedded a js bundle in your application bundle. unsanitizedscripturlstring = (null)
```

**Causes:**
- Metro bundler is not running
- Network connection issues between app and development server
- Stale cache or corrupted bundle
- Incorrect development server URL

**Solutions:**

#### Solution 1: Restart Metro Bundler with Clean Cache
```bash
# Stop any running Metro bundler (Ctrl+C)
# Then restart with clean cache
npx expo start --clear
```

#### Solution 2: Check Network Connection
```bash
# Make sure you're on the same network as your development machine
# Check if the QR code URL is accessible from your device
```

#### Solution 3: Reset Metro Cache Completely
```bash
# Stop Metro bundler
# Clear all caches
npx expo r -c
# Or manually clear
rm -rf .expo
rm -rf node_modules/.cache
npx expo start --clear
```

#### Solution 4: Check Development Server URL
```bash
# Make sure the development server is accessible
# Try accessing the URL shown in terminal in your browser
# Should show Metro bundler interface
```

#### Solution 5: Use Tunnel Mode (if LAN doesn't work)
```bash
# Start with tunnel mode for better connectivity
npx expo start --tunnel
```

#### Solution 6: Development Build Issues
If using a development build:
```bash
# Make sure development build is properly configured
npx expo start --dev-client
```

### 2. Skia Rendering Issues

**Error:** Skia components not rendering or showing blank screen

**Solutions:**
```bash
# Clear Metro cache
npx expo start --clear

# Check if Skia is properly installed
npx expo doctor

# Reinstall Skia if needed
npm uninstall @shopify/react-native-skia
npm install @shopify/react-native-skia@2.2.4 --legacy-peer-deps
```

### 3. TypeScript Errors

**Error:** Module resolution or type errors

**Solutions:**
```bash
# Restart TypeScript server in your IDE
# Or restart Metro bundler
npx expo start --clear

# Check tsconfig.json configuration
# Make sure resolveJsonModule and esModuleInterop are true
```

### 4. Asset Loading Issues

**Error:** Images or assets not loading

**Solutions:**
```bash
# Clear Metro cache
npx expo start --clear

# Check asset paths in your code
# Make sure assets are in the correct directory structure
```

### 5. Platform-Specific Issues

#### iOS Issues
```bash
# Clean iOS build
cd ios
xcodebuild clean
cd ..

# Rebuild iOS project
npx expo prebuild --platform ios --clean
```

#### Android Issues
```bash
# Clean Android build
cd android
./gradlew clean
cd ..

# Rebuild Android project
npx expo prebuild --platform android --clean
```

### 6. Dependency Issues

**Error:** Package conflicts or missing dependencies

**Solutions:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# Check for outdated packages
npx expo doctor
```

### 7. Development vs Production Builds

#### For Development (Expo Go)
```bash
npx expo start
# Scan QR code with Expo Go app
```

#### For Development Build
```bash
npx expo start --dev-client
# Use custom development build
```

#### For Production
```bash
# Build for production
npx expo build:ios
npx expo build:android
```

### 8. Network and Firewall Issues

**Solutions:**
- Check firewall settings
- Ensure ports 8081, 19000, 19001 are open
- Try using tunnel mode: `npx expo start --tunnel`
- Use USB connection for Android: `npx expo start --android`

### 9. Device Connection Issues

#### Android
```bash
# Enable USB debugging
# Check ADB connection
adb devices

# Use USB connection
npx expo start --android
```

#### iOS
```bash
# Make sure device is trusted
# Check Xcode device connection
# Use Simulator if device connection fails
```

### 10. Quick Recovery Commands

```bash
# Nuclear option - complete reset
rm -rf node_modules package-lock.json .expo
npm install --legacy-peer-deps
npx expo start --clear

# Check project health
npx expo doctor

# Update dependencies
npx expo install --fix
```

## Getting Help

If issues persist:
1. Check Expo documentation: https://docs.expo.dev/
2. Check React Native Skia documentation: https://shopify.github.io/react-native-skia/
3. Check project GitHub issues
4. Run `npx expo doctor` for automated diagnostics

## Useful Commands Reference

```bash
# Development
npx expo start                    # Start development server
npx expo start --clear           # Start with clean cache
npx expo start --tunnel          # Start with tunnel mode
npx expo start --dev-client      # Start for development build

# Building
npx expo prebuild                # Generate native projects
npx expo build:ios              # Build for iOS
npx expo build:android          # Build for Android

# Utilities
npx expo doctor                  # Check project health
npx expo install --fix          # Fix dependency issues
npx expo r -c                   # Reset Metro cache
```
