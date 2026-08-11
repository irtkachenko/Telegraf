import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getUploadAllowedMimeTypes, storageConfig } from '@/config/storage.config';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleKey } from '@/lib/supabase/service-role';

export async function GET() {
  try {
    // Require an authenticated user: this route builds an admin (service-role)
    // Supabase client, so it must not be reachable by anonymous callers.
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = getServiceRoleKey();
    const supabase = serviceRoleKey
      ? createSupabaseClient(supabaseUrl, serviceRoleKey)
      : authClient;
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
        // MIME-типи для вибору файлів користувачем. Бакет тепер приймає ТІЛЬКИ
        // зашифровані blob (application/octet-stream), тому тут завжди віддаємо
        // статистичний список користувацьких типів, а не allowed_mime_types бакета.
        allowedTypes: getUploadAllowedMimeTypes(),
        signedUrlExpiry: storageConfig.defaults.signedUrlExpiry,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Storage config error:', error);
    return NextResponse.json({ error: 'Failed to get storage config' }, { status: 500 });
  }
}
