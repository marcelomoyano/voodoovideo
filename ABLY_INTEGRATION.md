# Ably Integration for Remote Recording Control

## Overview
VoodooVideo now supports remote recording control via Ably, allowing the producer panel to start/stop recording on the Mac app remotely.

## Setup Instructions

### 1. Add Ably SDK to Xcode Project
Currently using a mock implementation. To add the real Ably SDK:

1. Open `VoodooVideo.xcodeproj` in Xcode
2. Go to File → Add Package Dependencies
3. Enter: `https://github.com/ably/ably-cocoa.git`
4. Click "Add Package"
5. Select "Ably" and add to the voodoovideo target
6. Delete `AblyMock.swift` once the real SDK is added

### 2. How to Use

#### Connect to a Room
1. Launch the VoodooVideo app
2. In the sidebar, find the "Remote Control" section
3. Enter:
   - **Room**: Same room name as in your producer panel
   - **Participant ID**: A unique identifier (e.g., "mac-recorder-1")
4. Click "Connect"

#### Remote Recording
Once connected:
- The producer panel will see your Mac recorder as a stream
- Producer can click "Start" to begin recording remotely
- Producer can click "Stop" to stop recording
- Producer can force-end the session if needed

#### Folder Structure
Recordings are uploaded to R2 with the structure:
```
room/participantID/filename.ts
room/participantID/playlist.m3u8
```

## Features

- **Real-time Status Updates**: Recording status is synchronized with the producer panel
- **Upload Progress**: HLS segment upload progress is reported to the producer
- **Remote Control**: Start/stop recording from the producer panel
- **Automatic Cleanup**: Sessions can be force-ended by the producer

## Testing

1. Connect to a test room (e.g., "testroom")
2. Use participant ID (e.g., "recorder1")
3. Open producer panel at the same room
4. You should see the Mac recorder appear as a stream
5. Test remote start/stop functionality

## Notes

- R2 credentials are still entered manually in the app
- The mock Ably implementation simulates connections for testing
- Replace with real Ably SDK for production use
- Upload folder structure: `room/participantID/` for easy organization