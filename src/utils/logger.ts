// src/utils/logger.ts
// Centralized logging utility - only logs in __DEV__ mode (except errors)

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  // Enable/disable specific categories
  physics: boolean;
  platforms: boolean;
  collision: boolean;
  boss: boolean;
  doors: boolean;
  audio: boolean;
  memory: boolean;
  performance: boolean;
}

// Default config - enable categories you want to debug
const config: LoggerConfig = {
  physics: false,      // Physics loop logging
  platforms: false,    // Platform generation/culling
  collision: false,    // Collision detection
  boss: true,          // Boss fight events (keep enabled for now)
  doors: true,         // Door teleportation
  audio: false,        // Sound effects
  memory: false,       // Memory/cleanup operations
  performance: false,  // FPS, frame timing
};

// Color codes for terminal (works in Metro bundler)
const colors = {
  debug: '\x1b[36m',   // Cyan
  info: '\x1b[32m',    // Green
  warn: '\x1b[33m',    // Yellow
  error: '\x1b[31m',   // Red
  reset: '\x1b[0m',
};

function formatMessage(level: LogLevel, category: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `[${timestamp}] [${category.toUpperCase()}]`;
  
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

function shouldLog(category: keyof LoggerConfig): boolean {
  return __DEV__ && config[category];
}

// Main logger object
export const log = {
  // Always log errors, even in production
  error: (category: string, message: string, data?: any) => {
    console.error(formatMessage('error', category, message, data));
  },
  
  // Warnings - dev only but always show when enabled
  warn: (category: string, message: string, data?: any) => {
    if (__DEV__) {
      console.warn(formatMessage('warn', category, message, data));
    }
  },
  
  // Category-specific logging
  physics: (message: string, data?: any) => {
    if (shouldLog('physics')) {
      console.log(formatMessage('debug', 'physics', message, data));
    }
  },
  
  platforms: (message: string, data?: any) => {
    if (shouldLog('platforms')) {
      console.log(formatMessage('debug', 'platforms', message, data));
    }
  },
  
  collision: (message: string, data?: any) => {
    if (shouldLog('collision')) {
      console.log(formatMessage('debug', 'collision', message, data));
    }
  },
  
  boss: (message: string, data?: any) => {
    if (shouldLog('boss')) {
      console.log(formatMessage('info', 'boss', message, data));
    }
  },
  
  doors: (message: string, data?: any) => {
    if (shouldLog('doors')) {
      console.log(formatMessage('info', 'doors', message, data));
    }
  },
  
  audio: (message: string, data?: any) => {
    if (shouldLog('audio')) {
      console.log(formatMessage('debug', 'audio', message, data));
    }
  },
  
  memory: (message: string, data?: any) => {
    if (shouldLog('memory')) {
      console.log(formatMessage('debug', 'memory', message, data));
    }
  },
  
  performance: (message: string, data?: any) => {
    if (shouldLog('performance')) {
      console.log(formatMessage('debug', 'perf', message, data));
    }
  },
  
  // Generic debug (always shows in dev)
  debug: (message: string, data?: any) => {
    if (__DEV__) {
      console.log(formatMessage('debug', 'debug', message, data));
    }
  },
  
  // Configure which categories to log
  configure: (newConfig: Partial<LoggerConfig>) => {
    Object.assign(config, newConfig);
  },
  
  // Enable all logging (for debugging sessions)
  enableAll: () => {
    Object.keys(config).forEach(key => {
      config[key as keyof LoggerConfig] = true;
    });
  },
  
  // Disable all logging (for performance testing)
  disableAll: () => {
    Object.keys(config).forEach(key => {
      config[key as keyof LoggerConfig] = false;
    });
  },
};

// Export config for external inspection
export function getLoggerConfig(): Readonly<LoggerConfig> {
  return { ...config };
}
