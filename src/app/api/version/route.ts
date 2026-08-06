export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const version = 
    process.env.VERCEL_GIT_COMMIT_SHA || 
    process.env.NEXT_PUBLIC_BUILD_ID || 
    '1.0.0';
  
  return NextResponse.json({ version });
}