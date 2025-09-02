# Producer Recorder Control System

## Overview
A comprehensive web-based remote control system for managing Mac recording applications via Ably real-time messaging. This system enables producers to remotely control multiple recording devices, manage their settings, and monitor recording progress from a centralized web interface.

## Architecture

### Components

#### 1. **Web Control Interface** (`devices/producer-recorder.html`)
- Real-time remote control interface for managing recording devices
- Room-based connection system for organizing recording sessions
- Responsive design with dark theme optimized for control room environments

#### 2. **Mac Recording App** (VoodooVideo)
- Native macOS application with camera/microphone capture
- HEVC local recording with HLS segmentation for R2 upload
- Ably integration for remote control and status reporting

#### 3. **Ably Real-time Messaging**
- Bi-directional communication between web interface and Mac apps
- Room-based channels for organizing recording sessions
- Device sync channels for hardware discovery and management

## Features

### 🎬 Recording Control
- **Remote Start/Stop**: Control recording on individual or all devices simultaneously
- **Force Stop**: Emergency stop with session termination
- **Status Monitoring**: Real-time recording status and duration tracking
- **Upload Progress**: Live R2 upload progress monitoring per recorder

### 📹 Device Management
- **Device Discovery**: Automatic detection of available cameras and microphones
- **Remote Device Swap**: Change video/audio devices without physical access
- **Sync Devices**: Manual refresh of device information with current selections
- **Permission Status**: Monitor camera/microphone authorization states

### 🎯 Quality Settings
- **Resolution Options**: 4K, 1080p, 720p, 480p
- **Bitrate Control**: 5, 8, 10, 15, 20 Mbps
- **Framerate Settings**: 24, 30, 60 fps
- **Dynamic Range**: SDR, HLG, PQ support
- **Global Presets**: Apply quality settings to all recorders at once

### 📊 Monitoring & Statistics
- **Recorder Cards**: Individual control panels for each connected recorder
- **Activity Log**: Real-time event logging with color-coded messages
- **Statistics Dashboard**: Total recorders, active recordings, upload progress
- **Connection Status**: Visual indicators for Ably connection state

## File Structure

```
voodoovideo/
├── devices/
│   ├── producer-recorder.html     # Main web interface
│   ├── recorder-app.js            # Application logic and event handling
│   ├── recorder-controls.js       # Remote command implementations
│   ├── recorder-manager.js        # UI management and recorder cards
│   ├── recorder-styles.css        # Recording-specific styling
│   ├── connection.js              # Ably connection management (shared)
│   └── logger.js                  # Logging utility (shared)
└── voodoovideo/
    ├── AblyManager.swift          # Enhanced with device commands
    ├── ContentView.swift          # UI with remote control callbacks
    └── ConfigurationManager.swift # Settings management
```

## Remote Commands

### Recording Commands
- `START_RECORDING` - Begin recording on target device
- `STOP_RECORDING` - Stop recording gracefully
- `END_SESSION` - Force terminate recording session

### Device Commands
- `CHANGE_VIDEO_DEVICE` - Switch to specified camera
- `CHANGE_AUDIO_DEVICE` - Switch to specified microphone
- `SYNC_DEVICES` - Request fresh device information

### Quality Commands
- `CHANGE_RESOLUTION` - Set output resolution (4K/1080p/720p/480p)
- `CHANGE_BITRATE` - Set encoding bitrate (5-20 Mbps)
- `CHANGE_FRAMERATE` - Set capture framerate (24/30/60 fps)
- `CHANGE_DYNAMIC_RANGE` - Set HDR mode (SDR/HLG/PQ)

## Communication Flow

### Connection Sequence
1. Web interface connects to Ably room (e.g., "apple")
2. Mac app connects to same room, registers as recorder
3. Mac app publishes device information to `{room}-devices` channel
4. Web interface discovers recorder and requests device list
5. Recorder card populated with controls and device dropdowns

### Command Flow
```
Web Interface → Ably Channel → Mac App
     ↓              ↓              ↓
User Action → producer-command → Handle Command
                                      ↓
                              Execute Action
                                      ↓
                            stream-status-update
                                      ↓
Web Interface ← Ably Channel ← Status Update
```

### Device Sync Flow
1. User clicks "Sync Devices" button
2. Web sends `SYNC_DEVICES` command
3. Mac app collects available devices
4. Mac app includes current selections
5. Device info published to device channel
6. Web interface updates dropdowns

## Quality Presets

| Quality | Resolution | Bitrate | Framerate |
|---------|------------|---------|-----------|
| 4K      | 2160p      | 20 Mbps | 30 fps    |
| 1080p   | 1920x1080  | 10 Mbps | 30 fps    |
| 720p    | 1280x720   | 5 Mbps  | 30 fps    |
| 480p    | 640x480    | 5 Mbps  | 24 fps    |

## Usage

### For Producers (Web Interface)

1. **Connect to Room**
   - Open `producer-recorder.html` in browser
   - Enter room ID (e.g., "studio-a", "apple")
   - Click Connect

2. **Discover Recorders**
   - Recorders auto-appear when Mac apps join room
   - Click "Discover Recorders" to manually search
   - Click "Sync Devices" to refresh device lists

3. **Control Recording**
   - Use individual recorder controls or global buttons
   - Monitor recording duration and upload progress
   - Check activity log for status updates

### For Recording Operators (Mac App)

1. **Setup Connection**
   - Enter room ID in Remote Control section
   - Participant ID auto-generates from hostname
   - Click Connect to join room

2. **Configure Settings**
   - Select video/audio devices locally
   - Set quality preferences
   - Configure R2 upload credentials

3. **Monitor Status**
   - Connection indicator shows Ably status
   - Recording indicator shows active state
   - Console logs show remote commands

## Key Improvements

### Device Synchronization
- **Problem**: Device lists showing "Unknown"
- **Solution**: Added "Sync Devices" button with current device reporting
- **Result**: Accurate device information with manual refresh control

### Quality Alignment
- **Problem**: Mismatched bitrate/resolution options
- **Solution**: Synchronized options between web and Mac interfaces
- **Result**: Consistent quality settings across platforms

### Error Handling
- **Problem**: JavaScript errors with missing DOM elements
- **Solution**: Added null checks in connection.js
- **Result**: Stable operation across different interfaces

### Event Timing
- **Problem**: Device info sent before channels ready
- **Solution**: Delayed device info sending, immediate handler setup
- **Result**: Reliable device discovery on connection

## Security Considerations

- Ably API keys should be stored securely (currently in code for development)
- R2 credentials entered locally, not transmitted via Ably
- Room IDs act as basic access control mechanism
- Consider adding authentication layer for production use

## Future Enhancements

- [ ] Multiple camera support per recorder
- [ ] Audio level monitoring
- [ ] Recording scheduling
- [ ] Automatic quality adjustment based on network conditions
- [ ] Cloud backup of recordings
- [ ] WebRTC preview of recording feeds
- [ ] Batch configuration templates
- [ ] Recording health metrics and alerts

## Troubleshooting

### Devices Not Appearing
1. Click "Sync Devices" button on recorder card
2. Check Mac app console for device info logs
3. Verify both apps connected to same room
4. Check browser console for device update messages

### Commands Not Working
1. Verify Ably connection status (green indicator)
2. Check Mac app console for command reception
3. Ensure participant IDs match between web and Mac
4. Review activity log for error messages

### Recording Issues
1. Check camera/microphone permissions in Mac app
2. Verify R2 credentials if upload enabled
3. Monitor available disk space
4. Check console for encoding errors

## Dependencies

### Web Interface
- Ably JavaScript SDK (CDN)
- Modern browser with ES6 support
- No build process required

### Mac App
- Ably iOS/macOS SDK (Swift Package)
- AVFoundation framework
- macOS 11.0+
- Xcode 13+

## License
Internal use only - VoodooStudios

## Support
For issues or questions, check the activity logs in both the web interface and Mac app console for detailed debugging information.