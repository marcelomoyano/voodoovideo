import Foundation
import Ably

class AblyManager: ObservableObject {
    private var ably: ARTRealtime?
    private var channel: ARTRealtimeChannel?
    private var obsControlChannel: ARTRealtimeChannel?
    
    @Published var isConnected = false
    @Published var connectionStatus = "Disconnected"
    @Published var currentRoom: String?
    @Published var participantId: String?
    
    // Callbacks for remote commands
    var onStartRecording: (() -> Void)?
    var onStopRecording: (() -> Void)?
    var onForceEndSession: ((String) -> Void)?
    
    init() {
        // Initialize with empty state
    }
    
    func connect(to room: String, as participantId: String) {
        self.currentRoom = room
        self.participantId = participantId
        
        print("🔌 AblyManager: Connecting to room '\(room)' as '\(participantId)'")
        connectionStatus = "Connecting..."
        
        // Initialize Ably with the same key as the producer panel
        let options = ARTClientOptions()
        options.key = "8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs"
        options.autoConnect = true
        
        // Use a background queue to reduce priority inversion warnings
        options.dispatchQueue = DispatchQueue(label: "ably.background", qos: .background)
        
        ably = ARTRealtime(options: options)
        
        ably?.connection.on { [weak self] stateChange in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                switch stateChange.current {
                case .connected:
                    print("✅ Ably connected")
                    self.isConnected = true
                    self.connectionStatus = "Connected"
                    self.setupChannels()
                    self.registerStream()
                    
                case .disconnected:
                    print("❌ Ably disconnected")
                    self.isConnected = false
                    self.connectionStatus = "Disconnected"
                    
                case .failed:
                    print("❌ Ably connection failed: \(stateChange.reason?.message ?? "Unknown error")")
                    self.isConnected = false
                    self.connectionStatus = "Failed"
                    
                default:
                    print("🔄 Ably connection state: \(stateChange.current)")
                }
            }
        }
    }
    
    private func setupChannels() {
        guard let ably = ably, let room = currentRoom else { return }
        
        // Subscribe to room channel
        channel = ably.channels.get(room)
        
        // Subscribe to OBS control channel
        obsControlChannel = ably.channels.get("obs-control-\(room)")
        
        // Listen for producer commands
        channel?.subscribe("producer-command") { [weak self] message in
            guard let self = self,
                  let data = message.data as? [String: Any],
                  let command = data["command"] as? String else { return }
            
            print("📨 Received producer command: \(command)")
            
            if let targetStreamId = data["streamId"] as? String,
               targetStreamId == self.participantId {
                // Command is for us
                self.handleProducerCommand(command: command, data: data)
            }
        }
        
        // Listen for room state requests
        channel?.subscribe("producer-request") { [weak self] message in
            guard let self = self,
                  let data = message.data as? [String: Any],
                  let command = data["command"] as? String else { return }
            
            if command == "GET_ROOM_STREAMS" {
                self.sendStreamStatus()
            }
        }
        
        print("📡 Subscribed to Ably channels for room: \(room)")
    }
    
    private func registerStream() {
        guard let channel = channel, let participantId = participantId else { return }
        
        // Register as a stream
        let streamData: [String: Any] = [
            "streamId": participantId,
            "streamName": "\(participantId)'s Mac Recorder",
            "status": "ready",
            "room": currentRoom ?? "",
            "type": "recorder", // Identify as a recorder, not a streamer
            "platform": "macOS"
        ]
        
        channel.publish("stream-registered", data: streamData) { error in
            if let error = error {
                print("❌ Failed to register stream: \(error)")
            } else {
                print("✅ Stream registered as: \(participantId)")
            }
        }
    }
    
    private func handleProducerCommand(command: String, data: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            switch command {
            case "START_STREAM", "START_RECORDING":
                print("🎬 Received START command")
                self?.onStartRecording?()
                
            case "STOP_STREAM", "STOP_RECORDING":
                print("🛑 Received STOP command")
                self?.onStopRecording?()
                
            case "FORCE_END_SESSION", "END_SESSION":
                print("❌ Received END_SESSION command")
                let reason = data["reason"] as? String ?? "Producer ended session"
                self?.onForceEndSession?(reason)
                self?.disconnect()
                
            default:
                print("⚠️ Unknown command: \(command)")
            }
        }
    }
    
    func updateStreamStatus(_ status: String) {
        guard let channel = channel, let participantId = participantId else { return }
        
        let statusData: [String: Any] = [
            "streamId": participantId,
            "status": status,
            "room": currentRoom ?? ""
        ]
        
        channel.publish("stream-status-update", data: statusData) { error in
            if let error = error {
                print("❌ Failed to update stream status: \(error)")
            } else {
                print("✅ Stream status updated to: \(status)")
            }
        }
    }
    
    private func sendStreamStatus() {
        guard let channel = channel, let participantId = participantId else { return }
        
        // Respond with our current status
        let streamData: [String: Any] = [
            "streamId": participantId,
            "streamName": "\(participantId)'s Mac Recorder",
            "status": "ready", // or "recording" if recording
            "room": currentRoom ?? "",
            "type": "recorder"
        ]
        
        channel.publish("room-streams-response", data: ["streams": [streamData]]) { error in
            if let error = error {
                print("❌ Failed to send stream status: \(error)")
            } else {
                print("✅ Sent stream status")
            }
        }
    }
    
    func sendRecordingProgress(completedUploads: Int, totalSegments: Int, progress: Double) {
        guard let channel = channel, let participantId = participantId else { return }
        
        let progressData: [String: Any] = [
            "streamId": participantId,
            "completedUploads": completedUploads,
            "totalSegments": totalSegments,
            "progress": progress,
            "type": "hls-upload-progress"
        ]
        
        channel.publish("recording-progress", data: progressData)
    }
    
    func disconnect() {
        print("🔌 AblyManager: Disconnecting...")
        
        // Unsubscribe from channels
        channel?.unsubscribe()
        obsControlChannel?.unsubscribe()
        
        // Close connection
        ably?.close()
        ably = nil
        channel = nil
        obsControlChannel = nil
        
        DispatchQueue.main.async { [weak self] in
            self?.isConnected = false
            self?.connectionStatus = "Disconnected"
            self?.currentRoom = nil
            self?.participantId = nil
        }
    }
    
    deinit {
        disconnect()
    }
}