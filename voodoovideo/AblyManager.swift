import Foundation
import Ably
import AVFoundation

class AblyManager: ObservableObject {
    private var ably: ARTRealtime?
    private var channel: ARTRealtimeChannel?
    private let configManager: ConfigurationManager
    private var reconnectionTimer: Timer?
    private var reconnectionAttempts = 0
    private let maxReconnectionAttempts = 5
    
    @Published var isConnected = false
    @Published var connectionStatus = "Disconnected"
    @Published var currentRoom: String?
    @Published var participantId: String?
    
    // Callbacks for remote commands
    var onStartRecording: (() -> Void)?
    var onStopRecording: (() -> Void)?
    var onForceEndSession: ((String) -> Void)?
    
    // Device swap callbacks
    var onChangeVideoDevice: ((String) -> Void)?
    var onChangeAudioDevice: ((String) -> Void)?
    
    // Quality change callbacks
    var onChangeResolution: ((String) -> Void)?
    var onChangeBitrate: ((Int) -> Void)?
    var onChangeFramerate: ((Int) -> Void)?
    var onChangeDynamicRange: ((String) -> Void)?
    
    init(configManager: ConfigurationManager) {
        self.configManager = configManager
        self.participantId = configManager.participantId
    }
    
    func connect(to room: String, as participantId: String) {
        self.currentRoom = room
        self.participantId = participantId
        
        connectionStatus = "Connecting..."
        
        // Initialize Ably with configured key
        guard configManager.hasValidAblyConfig else {
            connectionStatus = "Configuration Error"
            return
        }
        
        let options = ARTClientOptions()
        options.key = configManager.ablyAPIKey
        options.autoConnect = true
        options.dispatchQueue = DispatchQueue(label: "ably.background", qos: .background)
        
        ably = ARTRealtime(options: options)
        
        ably?.connection.on { [weak self] stateChange in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                switch stateChange.current {
                case .connected:
                    self.isConnected = true
                    self.connectionStatus = "Connected"
                    self.reconnectionAttempts = 0
                    self.reconnectionTimer?.invalidate()
                    self.reconnectionTimer = nil
                    self.setupChannels()
                    self.registerStream()
                    // Send device info after a short delay to ensure channels are ready
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                        self.sendDeviceInformation()
                    }
                    
                case .disconnected:
                    self.isConnected = false
                    self.connectionStatus = "Disconnected"
                    self.scheduleReconnection()
                    
                case .failed:
                    self.isConnected = false
                    self.connectionStatus = "Failed: \(stateChange.reason?.message ?? "Unknown error")"
                    self.scheduleReconnection()
                    
                default:
                    break
                }
            }
        }
    }
    
    private func setupChannels() {
        guard let ably = ably, let room = currentRoom else { return }
        
        // Subscribe to room channel
        channel = ably.channels.get(room)
        
        // Listen for producer commands
        channel?.subscribe("producer-command") { [weak self] message in
            guard let self = self,
                  let data = message.data as? [String: Any],
                  let command = data["command"] as? String else { return }
            
            if let targetStreamId = data["streamId"] as? String,
               targetStreamId == self.participantId {
                self.handleProducerCommand(command: command, data: data)
            }
        }
        
        // Listen for room state requests
        channel?.subscribe("producer-request") { [weak self] message in
            guard let self = self,
                  let data = message.data as? [String: Any],
                  let command = data["command"] as? String else { return }
            
            switch command {
            case "GET_ROOM_STREAMS":
                self.sendStreamStatus()
            case "GET_RECORDER_STATUS":
                // Check if this request is for us
                if let targetId = data["streamId"] as? String,
                   targetId == self.participantId {
                    self.sendStreamStatus()
                    self.sendDeviceInformation()
                }
            default:
                break
            }
        }
        
        // Also listen on device channel for device requests
        let deviceChannel = ably.channels.get("\(room)-devices")
        deviceChannel.subscribe("request-devices") { [weak self] (message: ARTMessage) in
            guard let self = self,
                  let data = message.data as? [String: Any] else { return }
            
            // Check if this request is for us
            if let targetId = data["streamId"] as? String,
               targetId == self.participantId {
                print("📱 Device request received, sending device info...")
                self.sendDeviceInformation()
            }
        }
        
    }
    
    private func registerStream() {
        guard let channel = channel, let participantId = participantId else { return }
        
        let deviceName = ProcessInfo.processInfo.hostName
        let streamData: [String: Any] = [
            "streamId": participantId,
            "streamName": "\(deviceName) Recorder",
            "status": "ready",
            "room": currentRoom ?? "",
            "type": "recorder",
            "platform": "macOS",
            "timestamp": Date().timeIntervalSince1970
        ]
        
        channel.publish("stream-registered", data: streamData) { error in
            if let error = error {
                print("❌ Failed to register stream: \(error)")
            } else {
                print("✅ Stream registered as: \(participantId)")
            }
        }
        
        // Also send initial status update
        updateStreamStatus("ready")
        
        // Send device information for remote control
        sendDeviceInformation()
    }
    
    func sendDeviceInformation() {
        guard let channel = channel, let participantId = participantId else { return }
        
        // Get video devices
        let videoDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        ).devices.map { device in
            return [
                "deviceId": device.uniqueID,
                "label": device.localizedName
            ]
        }
        
        // Get audio devices
        let audioDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
            mediaType: .audio,
            position: .unspecified
        ).devices.map { device in
            return [
                "deviceId": device.uniqueID,
                "label": device.localizedName
            ]
        }
        
        let deviceData: [String: Any] = [
            "streamId": participantId,
            "videoDevices": videoDevices,
            "audioDevices": audioDevices,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        // Publish to device sync channel for discovery
        if let deviceSyncChannel = ably?.channels.get("\(currentRoom ?? "")-devices") {
            deviceSyncChannel.publish("jitsi-device-update", data: deviceData) { error in
                if let error = error {
                    print("❌ Failed to send device info: \(error)")
                } else {
                    print("📱 Device information sent: \(videoDevices.count) video, \(audioDevices.count) audio devices")
                }
            }
        }
    }
    
    // Callbacks to get current selections
    var onGetCurrentVideoDevice: (() -> (String, String)?)?
    var onGetCurrentAudioDevice: (() -> (String, String)?)?
    
    func sendDeviceInformationWithCurrent() {
        guard let channel = channel, let participantId = participantId else { return }
        
        // Get video devices
        let videoDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        ).devices.map { device in
            return [
                "deviceId": device.uniqueID,
                "label": device.localizedName
            ]
        }
        
        // Get audio devices
        let audioDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
            mediaType: .audio,
            position: .unspecified
        ).devices.map { device in
            return [
                "deviceId": device.uniqueID,
                "label": device.localizedName
            ]
        }
        
        var deviceData: [String: Any] = [
            "streamId": participantId,
            "videoDevices": videoDevices,
            "audioDevices": audioDevices,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        // Add current selections if available
        if let currentVideo = onGetCurrentVideoDevice?() {
            deviceData["videoDeviceId"] = currentVideo.0
            deviceData["videoDeviceLabel"] = currentVideo.1
            print("📹 Current video device: \(currentVideo.1)")
        }
        
        if let currentAudio = onGetCurrentAudioDevice?() {
            deviceData["audioDeviceId"] = currentAudio.0
            deviceData["audioDeviceLabel"] = currentAudio.1
            print("🎤 Current audio device: \(currentAudio.1)")
        }
        
        // Publish to device sync channel for discovery
        if let deviceSyncChannel = ably?.channels.get("\(currentRoom ?? "")-devices") {
            deviceSyncChannel.publish("jitsi-device-update", data: deviceData) { error in
                if let error = error {
                    print("❌ Failed to send device info: \(error)")
                } else {
                    print("✅ Device information with current selections sent")
                }
            }
        }
    }
    
    private func handleProducerCommand(command: String, data: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            switch command {
            case "START_RECORDING":
                print("🎬 Remote command: Start Recording")
                self?.onStartRecording?()
                
            case "STOP_RECORDING":
                print("⏹️ Remote command: Stop Recording")
                self?.onStopRecording?()
                
            case "END_SESSION":
                let reason = data["reason"] as? String ?? "Session ended by producer"
                print("🛑 Remote command: End Session - \(reason)")
                self?.onForceEndSession?(reason)
                self?.disconnect()
                
            case "CHANGE_VIDEO_DEVICE":
                if let deviceId = data["deviceId"] as? String {
                    print("📹 Remote command: Change Video Device to \(deviceId)")
                    self?.onChangeVideoDevice?(deviceId)
                }
                
            case "CHANGE_AUDIO_DEVICE":
                if let deviceId = data["deviceId"] as? String {
                    print("🎤 Remote command: Change Audio Device to \(deviceId)")
                    self?.onChangeAudioDevice?(deviceId)
                }
                
            case "CHANGE_RESOLUTION":
                if let resolution = data["resolution"] as? String {
                    print("📺 Remote command: Change Resolution to \(resolution)")
                    self?.onChangeResolution?(resolution)
                    // Send confirmation back
                    self?.sendResolutionConfirmation(resolution)
                }
                
            case "CHANGE_BITRATE":
                if let bitrate = data["bitrate"] as? Int {
                    print("📊 Remote command: Change Bitrate to \(bitrate) Mbps")
                    self?.onChangeBitrate?(bitrate)
                    // Send confirmation back
                    self?.sendBitrateConfirmation(bitrate)
                }
                
            case "CHANGE_FRAMERATE":
                if let framerate = data["framerate"] as? Int {
                    print("🎬 Remote command: Change Framerate to \(framerate) fps")
                    self?.onChangeFramerate?(framerate)
                    // Send confirmation back
                    self?.sendFramerateConfirmation(framerate)
                }
                
            case "CHANGE_DYNAMIC_RANGE":
                if let dynamicRange = data["dynamicRange"] as? String {
                    print("🌈 Remote command: Change Dynamic Range to \(dynamicRange)")
                    self?.onChangeDynamicRange?(dynamicRange)
                }
                
            case "SYNC_DEVICES":
                print("🔄 Remote command: Sync Devices")
                self?.sendDeviceInformationWithCurrent()
                
            default:
                print("❓ Unknown remote command: \(command)")
                break
            }
        }
    }
    
    func updateStreamStatus(_ status: String) {
        guard let channel = channel, let participantId = participantId else {
            print("⚠️ Cannot update stream status - no channel or participant ID")
            return
        }
        
        let deviceName = ProcessInfo.processInfo.hostName
        let statusData: [String: Any] = [
            "streamId": participantId,
            "streamName": "\(deviceName) Recorder",
            "status": status,
            "room": currentRoom ?? "",
            "type": "recorder",
            "platform": "macOS",
            "timestamp": Date().timeIntervalSince1970
        ]
        
        channel.publish("stream-status-update", data: statusData) { error in
            if let error = error {
                print("Failed to update stream status: \(error)")
            }
        }
    }
    
    private func sendStreamStatus() {
        guard let channel = channel, let participantId = participantId else { return }
        
        // Get device name for a friendlier display name
        let deviceName = ProcessInfo.processInfo.hostName
        let streamData: [String: Any] = [
            "streamId": participantId,
            "streamName": "\(deviceName) Recorder",
            "status": "ready",
            "room": currentRoom ?? "",
            "type": "recorder",
            "platform": "macOS"
        ]
        
        channel.publish("room-streams-response", data: ["streams": [streamData]]) { error in
            if let error = error {
                print("❌ Failed to send stream status: \(error)")
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
    
    func sendBitrateConfirmation(_ bitrate: Int) {
        guard let channel = channel, let participantId = participantId else { return }
        
        let confirmationData: [String: Any] = [
            "streamId": participantId,
            "bitrate": bitrate,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        channel.publish("bitrate-changed", data: confirmationData) { error in
            if let error = error {
                print("❌ Failed to send bitrate confirmation: \(error)")
            } else {
                print("✅ Bitrate change confirmed: \(bitrate) Mbps")
            }
        }
    }
    
    func sendResolutionConfirmation(_ resolution: String) {
        guard let channel = channel, let participantId = participantId else { return }
        
        let confirmationData: [String: Any] = [
            "streamId": participantId,
            "resolution": resolution,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        channel.publish("resolution-changed", data: confirmationData) { error in
            if let error = error {
                print("❌ Failed to send resolution confirmation: \(error)")
            } else {
                print("✅ Resolution change confirmed: \(resolution)")
            }
        }
    }
    
    func sendFramerateConfirmation(_ framerate: Int) {
        guard let channel = channel, let participantId = participantId else { return }
        
        let confirmationData: [String: Any] = [
            "streamId": participantId,
            "framerate": framerate,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        channel.publish("framerate-changed", data: confirmationData) { error in
            if let error = error {
                print("❌ Failed to send framerate confirmation: \(error)")
            } else {
                print("✅ Framerate change confirmed: \(framerate) fps")
            }
        }
    }
    
    func disconnect() {
        print("🔌 AblyManager: Disconnecting...")
        
        // Cancel any pending reconnection
        reconnectionTimer?.invalidate()
        reconnectionTimer = nil
        
        // Unsubscribe from channels
        channel?.unsubscribe()
        
        // Close connection
        ably?.close()
        ably = nil
        channel = nil
        
        DispatchQueue.main.async { [weak self] in
            self?.isConnected = false
            self?.connectionStatus = "Disconnected"
            self?.currentRoom = nil
            self?.participantId = nil
        }
    }
    
    private func scheduleReconnection() {
        guard reconnectionAttempts < maxReconnectionAttempts,
              let room = currentRoom,
              let participantId = participantId else {
            if reconnectionAttempts >= maxReconnectionAttempts {
                print("❌ AblyManager: Max reconnection attempts reached")
                connectionStatus = "Connection failed - check network"
            }
            return
        }
        
        reconnectionAttempts += 1
        let delay = min(pow(2.0, Double(reconnectionAttempts)), 30.0) // Exponential backoff, max 30s
        
        print("🔄 AblyManager: Scheduling reconnection attempt \(reconnectionAttempts) in \(delay) seconds")
        connectionStatus = "Reconnecting in \(Int(delay))s..."
        
        reconnectionTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            print("🔄 AblyManager: Attempting reconnection \(self?.reconnectionAttempts ?? 0)")
            self?.connect(to: room, as: participantId)
        }
    }
    
    deinit {
        disconnect()
    }
}
