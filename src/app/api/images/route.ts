import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  region: 'auto',
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  try {
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 })
    }

    const bucketName = process.env.R2_BUCKET_NAME || 'sourcing'

    // Fetch the object from Cloudflare R2
    const s3Response = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    )

    if (!s3Response.Body) {
      return NextResponse.json({ error: 'File empty or not found' }, { status: 404 })
    }

    // Convert the stream body to a Uint8Array / Buffer response
    const streamToBuffer = async (stream: any): Promise<Buffer> => {
      const chunks: any[] = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    }

    const fileBuffer = await streamToBuffer(s3Response.Body)

    // Set appropriate headers and return the image response
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': s3Response.ContentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error: any) {
    console.error('Error fetching file from R2:', error)
    if (error.name === 'NoSuchKey') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
