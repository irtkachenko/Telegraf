// Centralized storage configuration for the application

export interface BucketConfig {
  name: string;
  isPrivate: boolean;
  maxFileSize: number; // in bytes
  allowedExtensions: string[];
}

export interface StorageLimits {
  maxFileSize: string;
  allowedTypes: string[];
  signedUrlExpiry: number;
}

export interface StorageConfigResponse {
  buckets: {
    name: string;
    public: boolean;
    createdAt: string;
  }[];
  limits: StorageLimits;
}

export interface StorageConfig {
  // Bucket names (static, don't change dynamically)
  bucketNames: {
    attachments: string;
  };
  // Allowed MIME types for uploads
  uploadAllowedExtensions: string[];
  // Static asset extensions for middleware exclusion
  staticAssetExtensions: string[];
  // Default fallback values for error cases
  defaults: {
    maxFileSize: number; // in bytes
    signedUrlExpiry: number; // in seconds
    urlExpiryBuffer: number; // in seconds - buffer before URL expires
    urlCheckInterval: number; // in seconds - how often to check for expired URLs
  };
}

export const storageConfig: StorageConfig = {
  bucketNames: {
    attachments: 'attachments',
  },
  uploadAllowedExtensions: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  staticAssetExtensions: [
    'svg',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'ico',
    'css',
    'js',
    'woff',
    'woff2',
    'ttf',
    'eot',
  ],
  defaults: {
    maxFileSize: 50 * 1024 * 1024, // 50MB fallback
    signedUrlExpiry: 3600, // 1 hour fallback
    urlExpiryBuffer: 300, // 5 minutes buffer before URL expires
    urlCheckInterval: 600, // 10 minutes interval for checking expired URLs
  },
};

// Helper functions for working with storage config

export function getBucketName(bucketKey: keyof StorageConfig['bucketNames']): string {
  return storageConfig.bucketNames[bucketKey];
}

export function getUploadAllowedMimeTypes(): string[] {
  return storageConfig.uploadAllowedExtensions;
}

// Backward-compatible alias. Prefer `getUploadAllowedMimeTypes`.
export function getUploadAllowedExtensions(): string[] {
  return getUploadAllowedMimeTypes();
}

export function isStaticAsset(pathname: string): boolean {
  const extensions = storageConfig.staticAssetExtensions;
  const extension = pathname.split('.').pop()?.toLowerCase();
  return extension ? extensions.includes(extension) : false;
}

export function getStaticAssetPattern(): string {
  const extensions = storageConfig.staticAssetExtensions.join('|');
  return `.*.(?:${extensions})$`;
}

export function getDefaultMaxFileSize(): number {
  return storageConfig.defaults.maxFileSize;
}

export function getDefaultSignedUrlExpiry(): number {
  return storageConfig.defaults.signedUrlExpiry;
}

export function getUrlExpiryBuffer(): number {
  return storageConfig.defaults.urlExpiryBuffer;
}

export function getUrlCheckInterval(): number {
  return storageConfig.defaults.urlCheckInterval;
}
