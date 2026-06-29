import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Initialize S3 client for Cloudflare R2
const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  region: 'auto',
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const supplierId = formData.get('supplierId') as string | null
    const customName = formData.get('customName') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    
    let rawName = customName || file.name
    // Ensure we keep the original extension if the custom name lacks it
    const lastDotIdx = file.name.lastIndexOf('.')
    if (lastDotIdx !== -1) {
      const originalExt = file.name.substring(lastDotIdx)
      if (customName && !customName.toLowerCase().endsWith(originalExt.toLowerCase())) {
        rawName = customName + originalExt
      }
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${rawName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    
    // Group files in "Supplier profile/{supplierId}" directory if supplierId is provided
    const key = supplierId ? `Supplier profile/${supplierId}/${filename}` : filename

    const bucketName = process.env.R2_BUCKET_NAME || 'sourcing'

    // Upload file to R2 bucket
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )

    // Return the local proxy URL to load/download the image securely
    const imageUrl = `/api/images?key=${encodeURIComponent(key)}`
    return NextResponse.json({ url: imageUrl })
  } catch (error: any) {
    console.error('Error uploading file to R2:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
