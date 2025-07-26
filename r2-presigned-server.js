// R2 Presigned URL Server
// npm install express @aws-sdk/client-s3 @aws-sdk/s3-request-presigner cors

const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// R2 Configuration
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: '<YOUR_ACCESS_KEY_ID>',
    secretAccessKey: '<YOUR_SECRET_ACCESS_KEY>',
  },
});

const BUCKET_NAME = '<YOUR_BUCKET_NAME>';

// Generate presigned URL for upload
app.post('/presigned-url', async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      ContentType: contentType || 'application/octet-stream',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    res.json({ 
      uploadUrl: presignedUrl,
      publicUrl: `https://your-r2-domain.com/${filename}` // Replace with your R2 public domain
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

app.listen(3000, () => {
  console.log('🚀 R2 Presigned URL server running on port 3000');
});