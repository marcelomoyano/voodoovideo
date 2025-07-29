# Testing Ably Connection

## Quick Test

1. **Run the Mac App**
   ```bash
   open /Users/marcelo/Library/Developer/Xcode/DerivedData/voodoovideo-*/Build/Products/Debug/voodoovideo.app
   ```

2. **Connect to Test Room**
   - Room: `test-mac-recorder`
   - Participant ID: `test-1`
   - Click Connect

3. **Verify Connection**
   - Green dot should appear
   - Status: "Connected"
   - Console should show: "✅ Stream registered as: test-1"

4. **Test Commands**
   You can test by opening the browser console and running:
   ```javascript
   // Simulate producer commands
   const ably = new Ably.Realtime('8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs');
   const channel = ably.channels.get('test-mac-recorder');
   
   // Start recording
   channel.publish('producer-command', {
     command: 'START_STREAM',
     streamId: 'test-1'
   });
   
   // Stop recording
   channel.publish('producer-command', {
     command: 'STOP_STREAM', 
     streamId: 'test-1'
   });
   ```

5. **Check Upload Structure**
   Files will upload to:
   - `test-mac-recorder/test-1/segment0.ts`
   - `test-mac-recorder/test-1/segment1.ts`
   - `test-mac-recorder/test-1/playlist.m3u8`

## Integration with Producer Panel

When connected to the same room as your producer panel:
1. Mac recorder appears automatically
2. Shows as "test-1's Mac Recorder"
3. Producer can control remotely
4. Upload progress visible in real-time

## Debug Commands

In the Xcode console, you should see:
- `🔌 AblyManager: Connecting to room`
- `✅ Ably connected`
- `📡 Subscribed to Ably channels`
- `✅ Stream registered`
- `📨 Received producer command: START_STREAM`

## Common Room Names to Test

- Your producer panel room (if you have one running)
- `demo-room`
- `test-recording`
- Any unique name you want