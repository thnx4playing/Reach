# Reach! Windows Setup Script
# This script prepares the project for Windows development

Write-Host "🎮 Setting up Reach! for Windows development..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18 or 20 LTS first." -ForegroundColor Red
    Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check Node.js version (should be 18 or 20 LTS)
$nodeVersionNumber = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($nodeVersionNumber -lt 18 -or $nodeVersionNumber -gt 20) {
    Write-Host "⚠️  Warning: Node.js version $nodeVersion detected. Expo SDK 53 works best with Node.js 18 or 20 LTS." -ForegroundColor Yellow
    Write-Host "   Consider updating to Node.js 18 or 20 LTS for best compatibility." -ForegroundColor Yellow
}

# Check if npm is available
try {
    $npmVersion = npm --version
    Write-Host "✅ npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed. Please install npm (comes with Node.js)." -ForegroundColor Red
    exit 1
}

# Check if Expo CLI is installed globally
try {
    $expoVersion = expo --version
    Write-Host "✅ Expo CLI found: $expoVersion" -ForegroundColor Green
} catch {
    Write-Host "📦 Installing Expo CLI globally..." -ForegroundColor Yellow
    npm install -g @expo/cli
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Expo CLI. Please try manually: npm install -g @expo/cli" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Expo CLI installed successfully" -ForegroundColor Green
}

# Clean install dependencies
Write-Host "🧹 Cleaning previous installations..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
}
if (Test-Path ".expo") {
    Remove-Item -Recurse -Force ".expo"
}

Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install --legacy-peer-deps

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies. Please check your internet connection and try again." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green

# Install Android dependencies
Write-Host "🤖 Installing Android dependencies..." -ForegroundColor Yellow
npx expo install --android

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install Android dependencies." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Android dependencies installed" -ForegroundColor Green

# Prebuild for Android (creates native Android project)
Write-Host "🔨 Prebuilding Android project..." -ForegroundColor Yellow
npx expo prebuild --platform android --clean

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to prebuild Android project." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Android project prebuilt successfully" -ForegroundColor Green

# Create .gitignore if it doesn't exist
if (-not (Test-Path ".gitignore")) {
    Write-Host "📝 Creating .gitignore..." -ForegroundColor Yellow
    @"
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
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8
    Write-Host "✅ .gitignore created" -ForegroundColor Green
}

# Create README for Windows setup
Write-Host "📖 Creating Windows setup instructions..." -ForegroundColor Yellow
@"
# Windows Development Setup for Reach!

## Prerequisites
- Windows 10/11
- Node.js 18 or 20 LTS
- Android Studio (for Android development)
- Expo CLI (installed by setup script)

## Quick Start
1. Run the setup script: `.\setup-windows.ps1`
2. Start the development server: `npx expo start`
3. Use Expo Go app on your Android device or Android emulator

## Development Workflow

### Using Expo Go (Recommended for testing)
``````bash
# Start the development server
npx expo start

# Scan QR code with Expo Go app on your device
# Or press 'a' to open in Android emulator
``````

### Using Development Build
``````bash
# Start the development server
npx expo start --dev-client

# Build and install development build on device
npx expo run:android
``````

## Building for Production

### Development Build
``````bash
# Create a development build
npx expo build:android --type development-client
``````

### Production Build
``````bash
# Create a production build
npx expo build:android --type app-bundle
``````

## Troubleshooting

### Common Issues
1. **Metro bundler issues**: Clear cache with `npx expo start --clear`
2. **Android build errors**: Clean and rebuild with `npx expo run:android --clear`
3. **Permission issues**: Run PowerShell as Administrator

### Useful Commands
``````bash
# Clear all caches
npx expo start --clear

# Reset Metro cache
npx expo r -c

# Check project health
npx expo-doctor

# Update dependencies
npx expo install --fix
``````

## Project Structure
- `android/` - Native Android project (auto-generated)
- `src/` - React Native source code
- `assets/` - Game assets (maps, character sprites)
- `App.tsx` - Main app component
"@ | Out-File -FilePath "WINDOWS-SETUP.md" -Encoding UTF8

Write-Host "✅ Windows setup instructions created" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Setup complete! Your project is ready for Windows development." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start the development server: npx expo start" -ForegroundColor White
Write-Host "2. Use Expo Go app on your Android device" -ForegroundColor White
Write-Host "3. Or press 'a' to open in Android emulator" -ForegroundColor White
Write-Host ""
Write-Host "For development builds, run: npx expo start --dev-client" -ForegroundColor Cyan
Write-Host "Then build with: npx expo run:android" -ForegroundColor Cyan
Write-Host ""
Write-Host "📖 See WINDOWS-SETUP.md for detailed instructions and troubleshooting." -ForegroundColor Green
