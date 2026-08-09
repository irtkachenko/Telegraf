import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getUploadAllowedMimeTypes, storageConfig } from '@/config/storage.config';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleKey } from '@/lib/supabase/service-role';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = getServiceRoleKey();
    const supabase = serviceRoleKey
      ? createSupabaseClient(supabaseUrl, serviceRoleKey)
      : await createClient();
    const { data: bucket, error } = await supabase.storage.getBucket(
      storageConfig.bucketNames.attachments,
    );

    // If bucket not found or error, return defaults from static config
    if (error || !bucket) {
      return NextResponse.json({
        buckets: [
          {
            name: storageConfig.bucketNames.attachments,
            public: false, // attachments bucket is private by default
            createdAt: new Date().toISOString(),
          },
        ],
        limits: {
          maxFileSize: String(storageConfig.defaults.maxFileSize),
          allowedTypes: getUploadAllowedMimeTypes(),
          signedUrlExpiry: storageConfig.defaults.signedUrlExpiry,
        },
      });
    }

    const config = {
      buckets: [
        {
          name: bucket.name,
          public: bucket.public,
          createdAt: bucket.created_at,
        },
      ],
      limits: {
        maxFileSize: String(bucket.file_size_limit ?? storageConfig.defaults.maxFileSize),
        allowedTypes:
          Array.isArray(bucket.allowed_mime_types) && bucket.allowed_mime_types.length > 0
            ? bucket.allowed_mime_types
            : getUploadAllowedMimeTypes(),
        signedUrlExpiry: storageConfig.defaults.signedUrlExpiry,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Storage config error:', error);
    return NextResponse.json({ error: 'Failed to get storage config' }, { status: 500 });
  }
}
