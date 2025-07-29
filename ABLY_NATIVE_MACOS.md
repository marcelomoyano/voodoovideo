# Ably Integration for Native macOS Producer App

This guide shows how to implement Ably in a native macOS app for producer panel functionality.

## 1. Setup Ably SDK

### Add Package Dependency
1. In Xcode: File → Add Package Dependencies
2. URL: `https://github.com/ably/ably-cocoa.git`
3. Version: `1.2.0` or later
4. Add to your target

### Import Ably
```swift
import Ably
```

## 2. Ably Manager Class

Create an `AblyProducerManager.swift`:

```swift
import Foundation
import Ably
import Combine

class AblyProducerManager: ObservableObject {
    private var ably: ARTRealtime?
    private var channel: ARTRealtimeChannel?
    private var obsControlChannel: ARTRealtimeChannel?
    
    @Published var isConnected = false
    @Published var connectionStatus = "Disconnected"
    @Published var currentRoom: String?
    @Published var streams: [String: StreamInfo] = [:]
    
    // Stream info structure
    struct StreamInfo {
        let streamId: String
        let streamName: String
        var status: String
        let room: String
        var isRecorder: Bool
        var uploadProgress: Double = 0.0
        var onAir: Bool = false
    }
    
    init() {}
    
    func connect(to room: String) {
        self.currentRoom = room
        
        print("🔌 Connecting to Ably room: \(room)")
        connectionStatus = "Connecting..."
        
        let options = ARTClientOptions()
        options.key = "8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs"
        options.autoConnect = true
        options.dispatchQueue = DispatchQueue(label: "ably.producer", qos: .background)
        
        ably = ARTRealtime(options: options)
        
        ably?.connection.on { [weak self] stateChange in
            DispatchQueue.main.async {
                switch stateChange.current {
                case .connected:
                    self?.handleConnected()
                case .disconnected:
                    self?.handleDisconnected()
                case .failed:
                    self?.handleFailed(stateChange.reason)
                default:
                    break
                }
            }
        }
    }
    
    private func handleConnected() {
        guard let room = currentRoom else { return }
        
        print("✅ Ably connected")
        isConnected = true
        connectionStatus = "Connected"
        
        // Subscribe to room channel
        channel = ably?.channels.get(room)
        
        // Subscribe to OBS control channel
        obsControlChannel = ably?.channels.get("obs-control-\(room)")
        
        setupChannelListeners()
        requestRoomState()
    }
    
    private func handleDisconnected() {
        print("❌ Ably disconnected")
        isConnected = false
        connectionStatus = "Disconnected"
        streams.removeAll()
    }
    
    private func handleFailed(_ reason: ARTErrorInfo?) {
        print("❌ Ably failed: \(reason?.message ?? "Unknown error")")
        isConnected = false
        connectionStatus = "Failed"
    }
    
    private func setupChannelListeners() {
        // Listen for stream registrations
        channel?.subscribe("stream-registered") { [weak self] message in
            guard let data = message.data as? [String: Any] else { return }
            self?.handleStreamRegistered(data)
        }
        
        // Listen for status updates
        channel?.subscribe("stream-status-update") { [weak self] message in
            guard let data = message.data as? [String: Any] else { return }
            self?.handleStreamStatusUpdate(data)
        }
        
        // Listen for stream removal
        channel?.subscribe("stream-removed") { [weak self] message in
            guard let data = message.data as? [String: Any],
                  let streamId = data["streamId"] as? String else { return }
            DispatchQueue.main.async {
                self?.streams.removeValue(forKey: streamId)
            }
        }
        
        // Listen for recording progress
        channel?.subscribe("recording-progress") { [weak self] message in
            guard let data = message.data as? [String: Any] else { return }
            self?.handleRecordingProgress(data)
        }
        
        // Listen for on-air updates
        channel?.subscribe("stream-onair-update") { [weak self] message in
            guard let data = message.data as? [String: Any] else { return }
            self?.handleOnAirUpdate(data)
        }
        
        // Listen for room state responses
        channel?.subscribe("room-streams-response") { [weak self] message in
            guard let data = message.data as? [String: Any] else { return }
            self?.handleRoomStateResponse(data)
        }
    }
    
    private func handleStreamRegistered(_ data: [String: Any]) {
        guard let streamId = data["streamId"] as? String else { return }
        
        let streamInfo = StreamInfo(
            streamId: streamId,
            streamName: data["streamName"] as? String ?? "\(streamId)'s Stream",
            status: data["status"] as? String ?? "ready",
            room: data["room"] as? String ?? currentRoom ?? "",
            isRecorder: data["type"] as? String == "recorder"
        )
        
        DispatchQueue.main.async {
            self.streams[streamId] = streamInfo
            print("📱 Stream registered: \(streamId) (Recorder: \(streamInfo.isRecorder))")
        }
    }
    
    private func handleStreamStatusUpdate(_ data: [String: Any]) {
        guard let streamId = data["streamId"] as? String,
              let status = data["status"] as? String else { return }
        
        DispatchQueue.main.async {
            self.streams[streamId]?.status = status
            print("📊 Stream \(streamId) status: \(status)")
        }
    }
    
    private func handleRecordingProgress(_ data: [String: Any]) {
        guard let streamId = data["streamId"] as? String,
              let progress = data["progress"] as? Double else { return }
        
        DispatchQueue.main.async {
            self.streams[streamId]?.uploadProgress = progress
            print("📈 Upload progress \(streamId): \(Int(progress * 100))%")
        }
    }
    
    private func handleOnAirUpdate(_ data: [String: Any]) {
        guard let streamId = data["streamId"] as? String,
              let onAir = data["onAir"] as? Bool else { return }
        
        DispatchQueue.main.async {
            self.streams[streamId]?.onAir = onAir
            print("📺 Stream \(streamId) on-air: \(onAir)")
        }
    }
    
    private func handleRoomStateResponse(_ data: [String: Any]) {
        guard let streamsArray = data["streams"] as? [[String: Any]] else { return }
        
        for streamData in streamsArray {
            handleStreamRegistered(streamData)
        }
    }
    
    private func requestRoomState() {
        guard let room = currentRoom else { return }
        
        let requestData: [String: Any] = [
            "command": "GET_ROOM_STREAMS",
            "room": room,
            "requestId": Date().timeIntervalSince1970
        ]
        
        channel?.publish("producer-request", data: requestData)
        print("📡 Requested room state for: \(room)")
    }
    
    // MARK: - Producer Commands
    
    func startRecording(streamId: String) {
        let command: [String: Any] = [
            "command": "START_RECORDING",
            "streamId": streamId
        ]
        
        channel?.publish("producer-command", data: command) { error in
            if let error = error {
                print("❌ Failed to send start command: \(error)")
            } else {
                print("✅ Sent start recording command to \(streamId)")
            }
        }
    }
    
    func stopRecording(streamId: String) {
        let command: [String: Any] = [
            "command": "STOP_RECORDING",
            "streamId": streamId
        ]
        
        channel?.publish("producer-command", data: command) { error in
            if let error = error {
                print("❌ Failed to send stop command: \(error)")
            } else {
                print("✅ Sent stop recording command to \(streamId)")
            }
        }
    }
    
    func forceEndSession(streamId: String) {
        let command: [String: Any] = [
            "command": "FORCE_END_SESSION",
            "streamId": streamId,
            "reason": "Producer force-closed session"
        ]
        
        channel?.publish("producer-command", data: command) { error in
            if let error = error {
                print("❌ Failed to send force end command: \(error)")
            } else {
                print("✅ Sent force end session command to \(streamId)")
            }
        }
    }
    
    func toggleOnAir(streamId: String) {
        guard var streamInfo = streams[streamId] else { return }
        
        streamInfo.onAir.toggle()
        streams[streamId] = streamInfo
        
        let command: [String: Any] = [
            "streamId": streamId,
            "onAir": streamInfo.onAir,
            "room": currentRoom ?? "",
            "timestamp": Date().timeIntervalSince1970
        ]
        
        channel?.publish("stream-onair-update", data: command)
        print("📺 Toggled on-air for \(streamId): \(streamInfo.onAir)")
    }
    
    func disconnect() {
        print("🔌 Disconnecting from Ably")
        
        channel?.unsubscribe()
        obsControlChannel?.unsubscribe()
        ably?.close()
        
        ably = nil
        channel = nil
        obsControlChannel = nil
        
        DispatchQueue.main.async {
            self.isConnected = false
            self.connectionStatus = "Disconnected"
            self.currentRoom = nil
            self.streams.removeAll()
        }
    }
    
    deinit {
        disconnect()
    }
}
```

## 3. SwiftUI Integration

Create your main producer view:

```swift
import SwiftUI

struct ProducerView: View {
    @StateObject private var ablyManager = AblyProducerManager()
    @State private var roomName = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Connection Section
                connectionSection
                
                // Streams List
                if ablyManager.isConnected {
                    streamsList
                }
                
                Spacer()
            }
            .padding()
            .navigationTitle("Producer Panel")
        }
        .frame(minWidth: 800, minHeight: 600)
    }
    
    private var connectionSection: some View {
        VStack(spacing: 10) {
            HStack {
                Circle()
                    .fill(ablyManager.isConnected ? .green : .red)
                    .frame(width: 10, height: 10)
                
                Text(ablyManager.connectionStatus)
                    .font(.headline)
                
                Spacer()
            }
            
            HStack {
                TextField("Room Name", text: $roomName)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .disabled(ablyManager.isConnected)
                
                Button(ablyManager.isConnected ? "Disconnect" : "Connect") {
                    if ablyManager.isConnected {
                        ablyManager.disconnect()
                    } else if !roomName.isEmpty {
                        ablyManager.connect(to: roomName)
                    }
                }
                .disabled(!ablyManager.isConnected && roomName.isEmpty)
            }
            
            if let room = ablyManager.currentRoom {
                Text("Connected to: \(room)")
                    .foregroundColor(.green)
                    .font(.caption)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(10)
    }
    
    private var streamsList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(Array(ablyManager.streams.values), id: \.streamId) { stream in
                    StreamCard(stream: stream, ablyManager: ablyManager)
                }
            }
        }
    }
}

struct StreamCard: View {
    let stream: AblyProducerManager.StreamInfo
    let ablyManager: AblyProducerManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack {
                VStack(alignment: .leading) {
                    HStack {
                        Text(stream.streamName)
                            .font(.headline)
                        
                        if stream.isRecorder {
                            Text("📹 Recorder")
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.green)
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                        
                        Spacer()
                    }
                    
                    Text("Status: \(stream.status.capitalized)")
                        .font(.caption)
                        .foregroundColor(statusColor(stream.status))
                }
                
                Spacer()
                
                // On Air Indicator
                if stream.onAir {
                    Text("🔴 ON AIR")
                        .font(.caption)
                        .foregroundColor(.red)
                        .fontWeight(.bold)
                }
            }
            
            // Progress Bar (for recorders)
            if stream.isRecorder && stream.status == "recording" {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Upload Progress: \(Int(stream.uploadProgress * 100))%")
                        .font(.caption)
                    
                    ProgressView(value: stream.uploadProgress)
                        .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                }
            }
            
            // Controls
            HStack(spacing: 10) {
                if stream.isRecorder {
                    // Recording controls
                    Button("Start Recording") {
                        ablyManager.startRecording(streamId: stream.streamId)
                    }
                    .disabled(stream.status == "recording")
                    
                    Button("Stop Recording") {
                        ablyManager.stopRecording(streamId: stream.streamId)
                    }
                    .disabled(stream.status != "recording")
                    
                    Button("View Recording") {
                        openRecording(stream)
                    }
                    .disabled(stream.status == "recording")
                }
                
                Button(stream.onAir ? "Off Air" : "On Air") {
                    ablyManager.toggleOnAir(streamId: stream.streamId)
                }
                
                Button("End Session") {
                    ablyManager.forceEndSession(streamId: stream.streamId)
                }
                .foregroundColor(.red)
                
                Spacer()
            }
            .buttonStyle(BorderedButtonStyle())
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(10)
    }
    
    private func statusColor(_ status: String) -> Color {
        switch status {
        case "recording": return .red
        case "ready": return .green
        case "stopped": return .orange
        default: return .gray
        }
    }
    
    private func openRecording(_ stream: AblyProducerManager.StreamInfo) {
        // Replace with your R2 domain
        let r2Domain = "https://your-r2-domain.com"
        let url = "\(r2Domain)/\(stream.room)/\(stream.streamId)/playlist.m3u8"
        
        if let nsUrl = URL(string: url) {
            NSWorkspace.shared.open(nsUrl)
        }
    }
}
```

## 4. App Integration

In your `App.swift`:

```swift
import SwiftUI

@main
struct ProducerApp: App {
    var body: some Scene {
        WindowGroup {
            ProducerView()
        }
        .windowStyle(DefaultWindowStyle())
    }
}
```

## 5. Info.plist Configuration

Add to suppress warnings:

```xml
<key>OS_ACTIVITY_MODE</key>
<string>disable</string>
```

## 6. R2 Configuration

Update with your R2 domain:

```swift
// In your StreamCard or a config file
struct R2Config {
    static let publicDomain = "https://your-r2-domain.com"  // Update this!
    
    static func getRecordingUrl(room: String, participantId: String) -> String {
        return "\(publicDomain)/\(room)/\(participantId)/playlist.m3u8"
    }
}
```

## 7. Features Included

- ✅ Real-time connection to Ably
- ✅ Automatic stream detection (recorders vs streamers)
- ✅ Remote recording control
- ✅ Upload progress monitoring
- ✅ On-air status management
- ✅ Force session termination
- ✅ HLS recording playback links

## 8. Usage

1. Enter room name (same as your recorder apps)
2. Click Connect
3. Mac recorders will appear automatically
4. Use controls to start/stop recording remotely
5. Monitor upload progress in real-time
6. Access recordings via generated URLs

## 9. Customization

You can extend this by adding:
- Stream preview thumbnails
- Multi-room management
- Recording scheduling
- User authentication
- Custom R2 bucket configuration
- OBS integration controls

This gives you a full native macOS producer app that can control your VoodooVideo recorders!