import { Dimensions } from 'react-native';
import type { MapName } from '../../content/maps';
import { PlatformGenerator } from './PlatformGenerator';
import type { PlatformDef } from './PlatformSystem';

const { height: SCREEN_H } = Dimensions.get('window');

export class PlatformManager {
  private platforms: Map<string, PlatformDef> = new Map();
  private generator: PlatformGenerator;
  private generatedMaxY = 0; // Highest Y we've generated to
  private cameraY = 0;
  
  constructor(mapName: MapName, floorTopY: number, scale = 2) {
    this.generator = new PlatformGenerator(mapName, floorTopY, scale);
    this.generatedMaxY = floorTopY;
    
    // Generate initial floor
    const floorPlatforms = this.generator.generateFloor();
    floorPlatforms.forEach(platform => {
      this.platforms.set(platform.id, platform);
    });
  }

  // PERFORMANCE: Only generate when camera moves significantly
  updateForCamera(newCameraY: number, playerWorldY: number): boolean {
    const cameraChanged = Math.abs(newCameraY - this.cameraY) > 32;
    if (!cameraChanged) return false;
    
    this.cameraY = newCameraY;
    
    // Generate ahead of camera
    const cameraTop = newCameraY;
    const generateAheadY = cameraTop - SCREEN_H * 2; // 2 screens ahead
    
    if (this.generatedMaxY > generateAheadY) return false;
    
    // Generate new band
    const bandHeight = SCREEN_H;
    const bandBottomY = this.generatedMaxY;
    const bandTopY = bandBottomY - bandHeight;
    
    const existingPlatforms = Array.from(this.platforms.values());
    const newPlatforms = this.generator.generateBand(bandTopY, bandBottomY, existingPlatforms);
    
    newPlatforms.forEach(platform => {
      this.platforms.set(platform.id, platform);
    });
    
    this.generatedMaxY = bandTopY;
    
    // Cull platforms far below camera
    const cullBelowY = newCameraY + SCREEN_H * 3;
    const toRemove: string[] = [];
    this.platforms.forEach((platform, id) => {
      if (platform.y > cullBelowY) {
        toRemove.push(id);
      }
    });
    toRemove.forEach(id => this.platforms.delete(id));
    
    return true; // Platforms changed
  }

  // Get platforms for collision detection (only solid ones)
  getSolidPlatforms(): PlatformDef[] {
    return Array.from(this.platforms.values()).filter(p => p.collision?.solid);
  }

  // Get all platforms for rendering
  getAllPlatforms(): PlatformDef[] {
    return Array.from(this.platforms.values());
  }

  // OPTIMIZED: Get only platforms near player for collision
  getPlatformsNearPlayer(playerX: number, playerY: number, radius = 200): PlatformDef[] {
    return this.getSolidPlatforms().filter(platform => {
      const dx = Math.abs(platform.x - playerX);
      const dy = Math.abs(platform.y - playerY);
      return dx < radius && dy < radius;
    });
  }
}
