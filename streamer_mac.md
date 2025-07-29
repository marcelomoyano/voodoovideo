# Native macOS WHIP Streamer - Technical Implementation Plan

## Overview
Convert browser-based WHIP/WebRTC streaming to native macOS using Apple's Network framework and WebRTC, unifying with the existing JavaScript patterns for maximum compatibility.

## Architecture

### Core Components

#### 1. WHIPClient (Native Swift)
**Location**: `voodoovideo/WHIPClient.swift`
**Purpose**: Direct port of `whip-client.js` functionality

```swift
class WHIPClient {
    private var peerConnection: RTCPeerConnection?
    private var videoSender: RTCRtpSender?
    private var audioSender: RTCRtpSender?
    private let endpoint: String
    private var bitrateEnforcementTimer: Timer?
    
    // Configuration matching JS version
    private let rtcConfig = RTCConfiguration()
    
    func startStream(videoTrack: RTCVideoTrack?, audioTrack: RTCAudioTrack?) async throws
    func replaceTrack(_ track: RTCMediaStreamTrack) async throws
    func stopStream()
    func enforceBitrate() async
}
```

#### 2. StreamManager (Native Swift)
**Location**: `voodoovideo/StreamManager.swift`
**Purpose**: Manages streaming lifecycle, mirrors `stream-manager.js`

```swift
class StreamManager: ObservableObject {
    @Published var isStreaming = false
    @Published var streamStatus = "Ready"
    
    private var whipClient: WHIPClient?
    private var currentVideoTrack: RTCVideoTrack?
    private var currentAudioTrack: RTCAudioTrack?
    
    func startStreaming(endpoint: String, settings: StreamSettings) async throws
    func stopStreaming()
    func replaceVideoTrack(_ track: RTCVideoTrack) async throws
    func replaceAudioTrack(_ track: RTCAudioTrack) async throws
}
```

#### 3. WebRTCManager (Native Swift)
**Location**: `voodoovideo/WebRTCManager.swift`
**Purpose**: Handle WebRTC setup, track creation from capture session

```swift
class WebRTCManager: NSObject {
    private let factory: RTCPeerConnectionFactory
    private var videoCapturer: RTCCameraVideoCapturer?
    
    func createVideoTrack(from captureSession: AVCaptureSession) -> RTCVideoTrack?
    func createAudioTrack(from captureSession: AVCaptureSession) -> RTCAudioTrack?
    func updateVideoSettings(resolution: String, fps: Int, bitrate: Int)
}
```

## Integration Points

### 1. Ably Signaling (Unified)
- Reuse existing `AblyManager` for signaling
- Same command structure as browser version
- Producer panel compatibility maintained

### 2. Capture Session Integration
- Connect to existing `VideoPreviewManager` capture pipeline
- **Key**: Tap into the same sample buffers already processed for local recording
- Create WebRTC tracks from `AVCaptureSession` outputs

### 3. Settings Synchronization
- Match browser UI settings exactly:
  - Resolution: 4K, 2K, 1080p, 720p, etc.
  - Codecs: H.264, VP9, VP8, AV1 (where supported)
  - Bitrates: 1-10 Mbps with fine control
  - Frame rates: 15-60 fps

## Implementation Strategy

### Phase 1: WebRTC Foundation
1. **Add WebRTC dependencies**:
   ```swift
   // Package.swift or pod dependency
   .package(url: "https://github.com/webrtc-sdk/webrtc-ios", from: "1.1.0")
   ```

2. **Create WebRTCManager**:
   - Initialize RTCPeerConnectionFactory
   - Configure video/audio capture from existing session
   - Handle codec preferences and bitrate control

3. **WHIPClient implementation**:
   - Port JavaScript WHIP protocol exactly
   - Same ICE server configuration
   - Identical SDP manipulation for bitrate/codec control

### Phase 2: Capture Pipeline Integration
1. **Tap existing VideoPreviewManager**:
   ```swift
   // In VideoPreviewManager, add WebRTC output
   private let webrtcManager = WebRTCManager()
   
   func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
       // Existing logic for local recording + HLS
       guard isRecording else { return }
       
       if output is AVCaptureVideoDataOutput {
           localRecorder.processVideoSampleBuffer(sampleBuffer)
           hlsSegmenter.processVideoSampleBuffer(sampleBuffer)
           
           // NEW: Feed to WebRTC if streaming
           if streamManager.isStreaming {
               webrtcManager.processVideoSampleBuffer(sampleBuffer)
           }
       }
       // Same for audio
   }
   ```

2. **Settings synchronization**:
   - Mirror browser settings UI in SwiftUI
   - Apply settings to both local recording AND WebRTC streaming
   - Dynamic quality adjustment during stream

### Phase 3: Producer Panel Integration
1. **Unified command structure**:
   ```swift
   // Same commands as browser version
   ablyManager.onStartRecording = {
       // Start BOTH local recording AND WHIP streaming
       startRecordingWithAbly()
       streamManager.startStreaming(endpoint: whipEndpoint, settings: currentSettings)
   }
   ```

2. **Status reporting**:
   - Same status messages as browser version
   - Unified presence/streaming indicators
   - Bitrate/quality metrics

### Phase 4: Advanced Features
1. **Dynamic track replacement**:
   - Hot-swap cameras during stream (like browser version)
   - Seamless device switching
   - Quality adaptation

2. **Codec optimization**:
   - H.264 hardware encoding for efficiency
   - VP9 software encoding for quality
   - Automatic codec selection based on device capabilities

3. **Network priority**:
   - Use native QoS APIs
   - Background app networking permissions
   - Cellular fallback with quality reduction

## Settings UI Enhancement

### Add to ContentView.swift
```swift
// New streaming section alongside recording controls
private var streamingSection: some View {
    VStack(spacing: 8) {
        // WHIP Endpoint
        TextField("WHIP Endpoint", text: $streamManager.whipEndpoint)
        
        // Stream Quality (separate from recording)
        Picker("Stream Quality", selection: $streamManager.streamQuality) {
            Text("1080p30").tag("1080p30")
            Text("720p60").tag("720p60") 
            Text("1080p60").tag("1080p60")
        }
        
        // Stream/Stop buttons
        Button(streamManager.isStreaming ? "Stop Stream" : "Start Stream") {
            if streamManager.isStreaming {
                streamManager.stopStreaming()
            } else {
                Task {
                    try await streamManager.startStreaming()
                }
            }
        }
    }
}
```

## Performance Advantages

### 1. Native Encoding
- Hardware H.264/HEVC encoding via VideoToolbox
- Better efficiency than browser software encoding
- Higher quality at same bitrates

### 2. Network Priority
- Native QoS control
- Direct control over network buffering
- Real-time transport optimizations

### 3. Resource Management
- Direct GPU access for encoding
- Efficient memory management
- Background processing capabilities

## Compatibility Matrix

| Feature | Browser Version | Native macOS | Status |
|---------|-----------------|-------------|--------|
| WHIP Protocol | ✅ | ✅ | Direct port |
| Ably Signaling | ✅ | ✅ | Reuse existing |
| H.264 Encoding | Software | Hardware | Upgrade |
| VP9 Support | ✅ | Software | Match |
| Track Replacement | ✅ | ✅ | Port |
| Bitrate Control | ✅ | ✅ | Enhanced |
| Producer Panel | ✅ | ✅ | Unified |

## Migration Strategy

### 1. Parallel Implementation
- Keep browser version working
- Add native streaming alongside local recording
- A/B test quality and performance

### 2. Unified Control
- Same producer panel controls both versions
- Automatic detection of native vs browser clients
- Seamless fallback

### 3. Quality Comparison
- Side-by-side quality tests
- Network efficiency measurements
- User experience feedback

## Deliverables

1. **WHIPClient.swift** - Core WHIP protocol implementation
2. **StreamManager.swift** - Stream lifecycle management  
3. **WebRTCManager.swift** - WebRTC track creation/management
4. **Updated ContentView.swift** - Streaming controls UI
5. **Updated VideoPreviewManager.swift** - Capture pipeline integration
6. **Settings sync** - Unified quality controls

## Timeline Estimate

- **Week 1**: WebRTC foundation, WHIPClient core
- **Week 2**: Capture pipeline integration, basic streaming
- **Week 3**: UI integration, settings sync, producer panel compatibility
- **Week 4**: Advanced features, optimization, testing

## Success Metrics

1. **Quality**: Higher bitrate efficiency than browser
2. **Latency**: Sub-500ms glass-to-glass via WHIP
3. **Reliability**: Seamless reconnection, no drops
4. **Compatibility**: 100% producer panel feature parity
5. **Performance**: Lower CPU usage, better battery life

This implementation will give you broadcast-grade streaming quality with the familiar producer panel workflow, while maintaining full compatibility with your existing browser-based streamers.