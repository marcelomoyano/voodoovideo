# Complete Ably Setup Guide for VoodooVideo

## How It Works

Ably provides real-time messaging between your Mac recorder and the producer panel. No URLs are needed - just room names and participant IDs.

## Step-by-Step Usage

### 1. Start the Mac App
1. Launch VoodooVideo
2. Grant camera/microphone permissions if needed
3. Select your video/audio devices

### 2. Connect to a Room
In the "Remote Control" section:

1. **Room**: Enter the same room name as your producer panel
   - Example: `testroom`, `studio1`, `event-2025`
   - This must match exactly with the producer panel

2. **Participant ID**: Enter a unique identifier
   - Example: `mac-1`, `recorder-john`, `camera-main`
   - This will be your stream name in the producer panel

3. Click **Connect**
   - Green dot = Connected
   - You'll see "Connected to: [room] as: [id]"

### 3. Producer Panel Integration

Once connected, on the producer panel:
1. Your Mac recorder appears as a stream with name "[participantID]'s Mac Recorder"
2. Status shows as "ready"
3. Producer can:
   - Click "Start" to begin recording remotely
   - Click "Stop" to stop recording
   - Click "End" to force disconnect the recorder

### 4. Recording Flow

When producer clicks "Start":
1. Mac app receives the command via Ably
2. Recording starts automatically with your configured settings
3. Status updates to "recording" on producer panel
4. HLS segments upload to: `room/participantID/`
5. Upload progress is shown on producer panel

### 5. Accessing Recordings

Recordings are available at:
```
https://[your-r2-domain]/room/participantID/playlist.m3u8
```

For example:
- Room: `testroom`
- Participant: `recorder1`
- URL: `https://your-domain.com/testroom/recorder1/playlist.m3u8`

## Common Scenarios

### Multiple Recorders
Connect multiple Mac recorders to the same room:
- Mac 1: Room: `studio`, ID: `mac-1`
- Mac 2: Room: `studio`, ID: `mac-2`
- Mac 3: Room: `studio`, ID: `mac-3`

Producer sees all three and can control independently.

### Event Recording
For an event with multiple cameras:
- Main stage: Room: `event2025`, ID: `stage-main`
- Audience: Room: `event2025`, ID: `audience-cam`
- Backstage: Room: `event2025`, ID: `backstage`

### Testing
1. Use room: `test`
2. Use ID: `test-recorder`
3. Open producer panel with same room
4. Test remote start/stop

## Troubleshooting

### Not Connecting?
- Check internet connection
- Verify room name matches exactly (case-sensitive)
- Ensure no spaces in room name or participant ID

### Not Appearing in Producer Panel?
- Refresh producer panel
- Check you're in the same room
- Verify connection status is green

### Recording Not Starting?
- Check camera/microphone permissions
- Verify R2 credentials are set
- Check local disk space

## Security Notes

- The Ably key is embedded but scoped to pub/sub only
- Each room is isolated - can't see other rooms
- Producer can force-end any session in their room
- No sensitive data is transmitted - only control commands

## Advanced Usage

### Custom Room Names
Use descriptive room names:
- `company-allhands-2025`
- `podcast-episode-42`
- `training-session-qa`

### Participant ID Best Practices
- Use location: `conference-room-a`
- Use person: `john-macbook`
- Use camera angle: `overhead-cam`
- Use number: `recorder-1`, `recorder-2`

This makes it easy to identify streams in the producer panel.