# R2 Configuration Guide

## Overview
R2 is Cloudflare's object storage service (S3-compatible) used for storing HLS video segments and playlists.

## Current Configuration

### Credentials (Already in the app)
```
Access Key ID: e12d70affefd4d92da66c362013a6149
Secret Access Key: cf72cea58cc8e1dc37e6723fbb825451d7864d97857dd36c3b643bc3a50b5e24
Endpoint: https://e561d71f6685e1ddd58b290d834f940e.r2.cloudflarestorage.com/vod
```

### Bucket Structure
```
vod/
├── room1/
│   ├── participantId1/
│   │   ├── segment0.ts
│   │   ├── segment1.ts
│   │   ├── segment2.ts
│   │   └── playlist.m3u8
│   └── participantId2/
│       ├── segment0.ts
│       └── playlist.m3u8
└── room2/
    └── participantId3/
        └── ...
```

## Setting Up R2 (For New Buckets)

### 1. Create R2 Bucket
1. Log into Cloudflare Dashboard
2. Go to R2 Storage
3. Create bucket named `vod` (or your preferred name)
4. Set location: Automatic

### 2. Configure Public Access
For HLS streaming, the bucket needs public read access:

1. Go to bucket Settings
2. Under "Public Access", configure:
   - Allow public access
   - Add custom domain (optional)

### 3. CORS Configuration
Add CORS rules for web playback:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 4. Create API Token
1. Go to R2 > Manage API Tokens
2. Create token with permissions:
   - Object Read & Write
   - Specify bucket: `vod`
3. Save the credentials

## URL Structure

### Upload URL (Internal)
```
https://[account-id].r2.cloudflarestorage.com/vod/room/participantId/filename.ts
```

### Public Access URL Options

#### Option 1: R2.dev URL (Free)
```
https://pub-[hash].r2.dev/room/participantId/playlist.m3u8
```

#### Option 2: Custom Domain (Recommended)
```
https://videos.yourdomain.com/room/participantId/playlist.m3u8
```

## Setting Up Custom Domain

1. In R2 bucket settings, click "Connect Domain"
2. Enter subdomain: `videos.yourdomain.com`
3. Cloudflare creates CNAME automatically
4. Wait for propagation (few minutes)

## Producer Panel Configuration

Update your producer panel with R2 details:

```javascript
// config.js or environment variables
const R2_CONFIG = {
    // Public URL for playback
    publicUrl: 'https://videos.yourdomain.com',  // or https://pub-xxx.r2.dev
    
    // Bucket name
    bucket: 'vod',
    
    // URL pattern for recordings
    getRecordingUrl: (room, participantId) => {
        return `${R2_CONFIG.publicUrl}/${room}/${participantId}/playlist.m3u8`;
    },
    
    // Get all segments pattern
    getSegmentsPattern: (room, participantId) => {
        return `${R2_CONFIG.publicUrl}/${room}/${participantId}/segment*.ts`;
    }
};
```

## Security Considerations

### 1. API Credentials
- Never expose Secret Access Key in frontend code
- Mac app has embedded credentials (acceptable for desktop app)
- For web apps, use server-side proxy

### 2. Access Control
- Read: Public (for playback)
- Write: Restricted to API key
- Consider signed URLs for private content

### 3. Cost Management
- Monitor bandwidth usage
- Set up alerts in Cloudflare
- Consider lifecycle rules for old recordings

## Bandwidth and Costs

### R2 Pricing (as of 2024)
- Storage: $0.015 per GB/month
- Class A operations (writes): $4.50 per million
- Class B operations (reads): $0.36 per million
- Bandwidth: FREE (no egress charges!)

### Example Costs
For 100 hours of recordings:
- Storage (1080p, ~5GB/hour): 500GB × $0.015 = $7.50/month
- Write operations: ~$0.50/month
- Read operations: ~$0.10/month
- **Total: ~$8/month + FREE bandwidth**

## Testing R2 Configuration

### 1. Test Upload (Mac App)
Click "Test R2 Upload" button in the app

### 2. Test Playback
```bash
# Test with curl
curl -I https://videos.yourdomain.com/test/test-recorder/playlist.m3u8

# Should return 200 OK or 404 if not exists
```

### 3. Test with HLS Player
```html
<video controls>
  <source src="https://videos.yourdomain.com/room/participantId/playlist.m3u8" type="application/x-mpegURL">
</video>
```

## Troubleshooting

### Upload Fails
- Check API credentials
- Verify bucket exists
- Check bucket permissions
- Look for CORS issues

### Playback Fails
- Verify public access enabled
- Check CORS configuration
- Confirm correct URL pattern
- Test with direct segment URL

### Common Errors
- 403: Check bucket permissions
- 404: Verify path structure
- CORS: Add your domain to allowed origins

## Integration with Producer Panel

The producer panel needs to know your R2 public URL:

```javascript
// In producerhome.js
const R2_PUBLIC_DOMAIN = 'https://videos.yourdomain.com'; // Update this!

function getRecordingUrl(room, participantId) {
    return `${R2_PUBLIC_DOMAIN}/${room}/${participantId}/playlist.m3u8`;
}
```

## Best Practices

1. **Folder Structure**: Always use `room/participantId/` pattern
2. **Naming**: Use URL-safe characters only
3. **Cleanup**: Implement retention policy
4. **Monitoring**: Set up Cloudflare alerts
5. **Backup**: Consider cross-region replication for important recordings

This R2 configuration is already working in your VoodooVideo app - you just need to update the producer panel with your public R2 domain!