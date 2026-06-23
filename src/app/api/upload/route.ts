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

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    const bucketName = process.env.R2_BUCKET_NAME || 'sourcing'

    // Upload file to R2 bucket
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: buffer,
        ContentType: file.type,
      })
    )

    // Return the local proxy URL to load/download the image securely
    const imageUrl = `/api/images?key=${filename}`
    return NextResponse.json({ url: imageUrl })
  } catch (error: any) {
    console.error('Error uploading file to R2:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
