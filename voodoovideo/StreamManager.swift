import Foundation
import WebRTC
import AVFoundation

/**
 * StreamManager - Manages WHIP streaming lifecycle
 * Mirrors stream-manager.js functionality for native Swift
 */
class StreamManager: ObservableObject {
    
    // MARK: - Published Properties
    @Published var isStreaming = false
    @Published var streamStatus = "Ready"
    @Published var whipEndpoint = ""
    
    // MARK: - Private Properties
    private var whipClient: WHIPClient?
    private var webRTCManager: WebRTCManager?
    private var currentVideoTrack: RTCVideoTrack?
    private var currentAudioTrack: RTCAudioTrack?
    
    // Stream settings (will be synced with VideoManager)
    var videoBitrate: Int = 3000 // kbps
    var frameRate: Int = 30
    var videoCodec: String = "H264"
    var resolution: String = "1080p"
    
    // MARK: - Initialization
    
    init() {
        webRTCManager = WebRTCManager()
        print("🎬 StreamManager: Initialized")
    }
    
    // MARK: - Public Methods
    
    func startStreaming(endpoint: String? = nil) async throws {
        guard !isStreaming else {
            throw StreamError.alreadyStreaming("Already streaming")
        }
        
        // Use provided endpoint or stored endpoint
        let streamEndpoint = endpoint ?? whipEndpoint
        guard !streamEndpoint.isEmpty else {
            throw StreamError.missingEndpoint("WHIP endpoint is required")
        }
        
        print("🎬 StreamManager: Starting stream to endpoint: \(streamEndpoint)")
        updateStatus("Starting stream...")
        
        isStreaming = true
        
        do {
            // Initialize WHIP client
            whipClient = WHIPClient(endpoint: streamEndpoint) { [weak self] message, isError in
                DispatchQueue.main.async {
                    if isError {
                        print("❌ StreamManager: WHIP Client Error - \(message)")
                        self?.updateStatus("Error: \(message)")
                    } else {
                        print("📡 StreamManager: WHIP Client - \(message)")
                        self?.updateStatus(message)
                    }
                }
            }
            
            // Configure WHIP client settings
            whipClient?.videoBitrate = videoBitrate
            whipClient?.frameRate = frameRate
            whipClient?.videoCodec = videoCodec
            
            // Get current tracks from WebRTC manager
            guard let webRTCManager = webRTCManager else {
                throw StreamError.invalidState("WebRTC manager not available")
            }
            
            currentVideoTrack = webRTCManager.getCurrentVideoTrack()
            currentAudioTrack = webRTCManager.getCurrentAudioTrack()
            
            // Start the WHIP stream
            try await whipClient?.startStream(
                videoTrack: currentVideoTrack,
                audioTrack: currentAudioTrack
            )
            
            updateStatus("Stream Connected")
            print("✅ StreamManager: WHIP streaming started successfully")
            
        } catch {
            print("❌ StreamManager: Failed to start streaming - \(error.localizedDescription)")
            isStreaming = false
            updateStatus("Failed: \(error.localizedDescription)")
            throw error
        }
    }
    
    func stopStreaming() {
        guard isStreaming else {
            print("⚠️ StreamManager: Not currently streaming")
            return
        }
        
        print("🛑 StreamManager: Stopping stream...")
        updateStatus("Stopping stream...")
        
        // Stop WHIP client
        whipClient?.stopStream()
        whipClient = nil
        
        // Clear tracks
        currentVideoTrack = nil
        currentAudioTrack = nil
        
        isStreaming = false
        updateStatus("Stream stopped")
        
        print("✅ StreamManager: Streaming stopped")
    }
    
    func replaceVideoTrack(_ track: RTCVideoTrack?) async throws {
        guard isStreaming, let whipClient = whipClient else {
            print("⚠️ StreamManager: Cannot replace video track - not streaming")
            return
        }
        
        print("🔄 StreamManager: Replacing video track")
        
        do {
            try await whipClient.replaceVideoTrack(track)
            currentVideoTrack = track
            print("✅ StreamManager: Video track replaced successfully")
        } catch {
            print("❌ StreamManager: Failed to replace video track - \(error.localizedDescription)")
            throw error
        }
    }
    
    func replaceAudioTrack(_ track: RTCAudioTrack?) async throws {
        guard isStreaming, let whipClient = whipClient else {
            print("⚠️ StreamManager: Cannot replace audio track - not streaming")
            return
        }
        
        print("🔄 StreamManager: Replacing audio track")
        
        do {
            try await whipClient.replaceAudioTrack(track)
            currentAudioTrack = track
            print("✅ StreamManager: Audio track replaced successfully")
        } catch {
            print("❌ StreamManager: Failed to replace audio track - \(error.localizedDescription)")
            throw error
        }
    }
    
    func updateSettings(
        endpoint: String? = nil,
        bitrate: Int? = nil,
        frameRate: Int? = nil,
        codec: String? = nil,
        resolution: String? = nil
    ) {
        if let endpoint = endpoint {
            whipEndpoint = endpoint
        }
        
        if let bitrate = bitrate {
            videoBitrate = bitrate
            whipClient?.videoBitrate = bitrate
        }
        
        if let frameRate = frameRate {
            self.frameRate = frameRate
            whipClient?.frameRate = frameRate
        }
        
        if let codec = codec {
            videoCodec = codec
            whipClient?.videoCodec = codec
        }
        
        if let resolution = resolution {
            self.resolution = resolution
        }
        
        print("🔧 StreamManager: Settings updated")
    }
    
    func processVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard isStreaming else { return }
        
        // Forward to WebRTC manager to create/update video track
        webRTCManager?.processVideoSampleBuffer(sampleBuffer) { [weak self] track in
            Task { @MainActor in
                if self?.currentVideoTrack != track {
                    do {
                        try await self?.replaceVideoTrack(track)
                    } catch {
                        print("❌ StreamManager: Failed to update video track from sample buffer")
                    }
                }
            }
        }
    }
    
    func processAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard isStreaming else { return }
        
        // Forward to WebRTC manager to create/update audio track
        webRTCManager?.processAudioSampleBuffer(sampleBuffer) { [weak self] track in
            Task { @MainActor in
                if self?.currentAudioTrack != track {
                    do {
                        try await self?.replaceAudioTrack(track)
                    } catch {
                        print("❌ StreamManager: Failed to update audio track from sample buffer")
                    }
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func updateStatus(_ status: String) {
        DispatchQueue.main.async { [weak self] in
            self?.streamStatus = status
        }
    }
    
    // MARK: - Ably Integration Callbacks
    
    func notifyStreamLive() {
        // This mirrors the JavaScript functionality where we notify 
        // other components that the stream is live
        print("📡 StreamManager: Stream is now live - notifying other components")
        
        // In the future, we can integrate with Ably here to send notifications
        // similar to the JavaScript version:
        // ablyManager.sendStreamLiveNotification(streamId: participantId, room: room, status: "live-and-ready")
    }
    
    deinit {
        print("💀 StreamManager: Deinitializing")
        if isStreaming {
            stopStreaming()
        }
    }
}

// MARK: - Error Types

enum StreamError: LocalizedError {
    case alreadyStreaming(String)
    case missingEndpoint(String)
    case invalidState(String)
    case trackCreationFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .alreadyStreaming(let message):
            return "Already streaming: \(message)"
        case .missingEndpoint(let message):
            return "Missing endpoint: \(message)"
        case .invalidState(let message):
            return "Invalid state: \(message)"
        case .trackCreationFailed(let message):
            return "Track creation failed: \(message)"
        }
    }
}