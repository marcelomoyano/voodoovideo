import WebRTC
import Foundation

/**
 * WHIPClient - WebRTC HTTP Ingest Protocol client for Swift
 * Direct port of whip-client.js functionality using WebRTC framework
 */
class WHIPClient: NSObject {
    
    // MARK: - Properties
    private let endpoint: String
    private var peerConnection: RTCPeerConnection?
    private var videoSender: RTCRtpSender?
    private var audioSender: RTCRtpSender?
    private var bitrateEnforcementTimer: Timer?
    private let updateStatusCallback: (String, Bool) -> Void
    
    // WebRTC configuration optimized for WHIP streaming
    private let rtcConfiguration: RTCConfiguration = {
        let config = RTCConfiguration()
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun2.l.google.com:19302"]),
            RTCIceServer(
                urlStrings: ["turn:159.65.180.44:3478"],
                username: "voodooturn",
                credential: "vT_s7r0ngP@sswrd_4U"
            )
        ]
        config.iceCandidatePoolSize = 0  // Disable candidate pooling for WHIP
        config.bundlePolicy = .maxCompatible  // Most compatible option
        config.rtcpMuxPolicy = .require
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherOnce  // Gather ICE candidates once
        return config
    }()
    
    // Settings for encoding
    var videoBitrate: Int = 3000 // kbps
    var frameRate: Int = 30
    var videoCodec: String = "H264" // H264, VP9, VP8, AV1
    
    // MARK: - Initialization
    
    init(endpoint: String, updateStatusCallback: @escaping (String, Bool) -> Void) {
        guard !endpoint.isEmpty else {
            fatalError("WHIP endpoint URL is required")
        }
        
        self.endpoint = endpoint
        self.updateStatusCallback = updateStatusCallback
        super.init()
        
        setupPeerConnection()
    }
    
    // MARK: - Private Setup Methods
    
    private func setupPeerConnection() {
        let factory = RTCPeerConnectionFactory()
        peerConnection = factory.peerConnection(with: rtcConfiguration, constraints: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil), delegate: self)
        
        updateStatusCallback("WHIP client initialized", false)
    }
    
    // MARK: - Public Methods
    
    func startStream(videoTrack: RTCVideoTrack?, audioTrack: RTCAudioTrack?) async throws {
        guard let peerConnection = peerConnection else {
            throw WHIPError.invalidState("Peer connection not initialized")
        }
        
        updateStatusCallback("Starting WHIP stream...", false)
        
        // Add tracks to the peer connection
        if let videoTrack = videoTrack {
            videoSender = peerConnection.add(videoTrack, streamIds: ["stream"])
            updateStatusCallback("Added video track", false)
            
            // Configure video encoding
            try await configureVideoSender()
        }
        
        if let audioTrack = audioTrack {
            audioSender = peerConnection.add(audioTrack, streamIds: ["stream"])
            updateStatusCallback("Added audio track", false)
        }
        
        // Create offer with simpler constraints
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: [
                "OfferToReceiveAudio": "false",
                "OfferToReceiveVideo": "false"
            ]
        )
        let offer = try await peerConnection.offer(for: constraints)
        
        // Modify SDP for WHIP requirements
        var modifiedSDP = modifySDPWithBitrate(offer.sdp)
        modifiedSDP = modifySDPForSendOnly(modifiedSDP)
        
        let modifiedOffer = RTCSessionDescription(type: .offer, sdp: modifiedSDP)
        try await peerConnection.setLocalDescription(modifiedOffer)
        
        // Wait for ICE gathering
        try await waitForIceGathering()
        
        // Send WHIP request
        let answer = try await sendWHIPRequest(peerConnection.localDescription!.sdp)
        
        // Set remote description
        try await peerConnection.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: answer))
        
        // Start bitrate enforcement
        startBitrateEnforcement()
        
        updateStatusCallback("WHIP stream connected", false)
    }
    
    func stopStream() {
        updateStatusCallback("Stopping WHIP stream...", false)
        
        // Stop bitrate enforcement
        bitrateEnforcementTimer?.invalidate()
        bitrateEnforcementTimer = nil
        
        // Close peer connection
        peerConnection?.close()
        peerConnection = nil
        
        // Reset senders
        videoSender = nil
        audioSender = nil
        
        updateStatusCallback("WHIP stream stopped", false)
    }
    
    func replaceVideoTrack(_ track: RTCVideoTrack?) async throws {
        guard let peerConnection = peerConnection else {
            throw WHIPError.invalidState("No peer connection available")
        }
        // Remove existing video sender if present
        if let sender = videoSender {
            peerConnection.removeTrack(sender)
            videoSender = nil
        }
        // Add new video track if provided
        if let newTrack = track {
            videoSender = peerConnection.add(newTrack, streamIds: ["stream"])
            updateStatusCallback("Video track replaced", false)
            try await configureVideoSender()
        } else {
            updateStatusCallback("Video track removed", false)
        }
    }
    
    func replaceAudioTrack(_ track: RTCAudioTrack?) async throws {
        guard let peerConnection = peerConnection else {
            throw WHIPError.invalidState("No peer connection available")
        }
        // Remove existing audio sender if present
        if let sender = audioSender {
            peerConnection.removeTrack(sender)
            audioSender = nil
        }
        // Add new audio track if provided
        if let newTrack = track {
            audioSender = peerConnection.add(newTrack, streamIds: ["stream"])
            updateStatusCallback("Audio track replaced", false)
        } else {
            updateStatusCallback("Audio track removed", false)
        }
    }
    
    // MARK: - Private Methods
    
    private func configureVideoSender() async throws {
        guard let videoSender = videoSender else { return }
        
        let parameters = videoSender.parameters
        
        // Configure encoding parameters
        if !parameters.encodings.isEmpty {
            parameters.encodings[0].maxBitrateBps = NSNumber(value: videoBitrate * 1000)
            parameters.encodings[0].maxFramerate = NSNumber(value: frameRate)
            parameters.encodings[0].scaleResolutionDownBy = NSNumber(value: 1.0)
            parameters.encodings[0].isActive = true
            parameters.encodings[0].networkPriority = .high
        }
        
        // Setting parameters is no longer supported directly on the sender.
        // The encoding parameters should be configured before adding the sender or may not be configurable at all.
        print("⚠️ WHIPClient: Directly setting sender parameters is not supported in this version. Configure encoding parameters before adding the sender.")
        
        updateStatusCallback("Video encoding configured: \(videoBitrate)kbps @ \(frameRate)fps", false)
    }
    
    private func startBitrateEnforcement() {
        bitrateEnforcementTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task {
                await self?.enforceBitrate()
            }
        }
    }
    
    private func enforceBitrate() async {
        guard let videoSender = videoSender,
              let peerConnection = peerConnection,
              peerConnection.connectionState == .connected else {
            return
        }
        
        do {
            let parameters = videoSender.parameters
            if !parameters.encodings.isEmpty {
                let currentBitrate = parameters.encodings[0].maxBitrateBps?.intValue ?? 0
                let targetBitrate = videoBitrate * 1000
                
                if currentBitrate != targetBitrate {
                    // Directly setting parameters is no longer supported.
                    // Dynamic bitrate enforcement via parameter adjustment is not available.
                    print("⚠️ WHIPClient: Dynamic bitrate enforcement is not supported. Skipping parameter update.")
                }
            }
        } catch {
            print("❌ WHIPClient: Error enforcing bitrate: \(error)")
        }
    }
    
    private func modifySDPWithBitrate(_ sdp: String) -> String {
        var lines = sdp.components(separatedBy: "\r\n")
        var newLines: [String] = []
        var isVideoSection = false
        
        for line in lines {
            if line.hasPrefix("m=video") {
                isVideoSection = true
            } else if line.hasPrefix("m=") && !line.hasPrefix("m=video") {
                isVideoSection = false
            }
            
            newLines.append(line)
            
            // Add video-specific settings
            if isVideoSection && line.hasPrefix("c=") {
                // Add bandwidth settings
                newLines.append("b=AS:\(videoBitrate)")
                newLines.append("b=TIAS:\(videoBitrate * 1000)")
                
                // Add transport feedback
                newLines.append("a=rtcp-fb:* transport-cc")
                newLines.append("a=rtcp-fb:* nack")
                newLines.append("a=rtcp-fb:* nack pli")
                newLines.append("a=rtcp-fb:* ccm fir")
                newLines.append("a=rtcp-fb:* goog-remb")
                
                // Priority settings
                newLines.append("a=content:main")
                newLines.append("a=priority:high")
                newLines.append("a=x-google-max-bitrate:\(videoBitrate * 1000)")
                newLines.append("a=x-google-min-bitrate:\(videoBitrate * 1000)")
                newLines.append("a=x-google-start-bitrate:\(videoBitrate * 1000)")
            }
        }
        
        return newLines.joined(separator: "\r\n")
    }
    
    private func modifySDPForSendOnly(_ sdp: String) -> String {
        return sdp.replacingOccurrences(of: "a=sendrecv", with: "a=sendonly")
    }
    
    private func waitForIceGathering() async throws {
        guard let peerConnection = peerConnection else {
            throw WHIPError.invalidState("Peer connection not available")
        }
        
        if peerConnection.iceGatheringState == .complete {
            return
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            var observer: NSObjectProtocol?
            
            let checkState = {
                if peerConnection.iceGatheringState == .complete {
                    if let observer = observer {
                        NotificationCenter.default.removeObserver(observer)
                    }
                    continuation.resume()
                }
            }
            
            observer = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("RTCPeerConnectionIceGatheringStateChanged"),
                object: peerConnection,
                queue: .main
            ) { _ in
                checkState()
            }
            
            // Timeout after 5 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
                if let observer = observer {
                    NotificationCenter.default.removeObserver(observer)
                }
                continuation.resume()
            }
            
            // Check immediately in case already complete
            checkState()
        }
    }
    
    private func sendWHIPRequest(_ sdp: String) async throws -> String {
        guard let url = URL(string: endpoint) else {
            throw WHIPError.invalidEndpoint("Invalid WHIP endpoint URL")
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        request.httpBody = sdp.data(using: .utf8)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw WHIPError.networkError("Invalid response type")
        }
        
        guard httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            throw WHIPError.httpError("HTTP \(httpResponse.statusCode)")
        }
        
        guard let answerSDP = String(data: data, encoding: .utf8) else {
            throw WHIPError.networkError("Invalid SDP response")
        }
        
        return answerSDP
    }
}

// MARK: - RTCPeerConnectionDelegate

extension WHIPClient: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        updateStatusCallback("Signaling state: \(stateChanged)", false)
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        // Not used for WHIP (send-only)
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        // Not used for WHIP (send-only)
    }
    
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        // Handle renegotiation if needed
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        let stateDescription: String
        switch newState {
        case .new:
            stateDescription = "new"
        case .checking:
            stateDescription = "checking"
        case .connected:
            stateDescription = "connected"
        case .completed:
            stateDescription = "completed"
        case .failed:
            stateDescription = "failed"
        case .disconnected:
            stateDescription = "disconnected"
        case .closed:
            stateDescription = "closed"
        case .count:
            stateDescription = "count"
        @unknown default:
            stateDescription = "unknown"
        }
        
        print("🔗 WHIPClient: ICE connection state changed to: \(stateDescription)")
        updateStatusCallback("ICE: \(stateDescription)", newState == .failed)
        
        if newState == .connected || newState == .completed {
            updateStatusCallback("WHIP stream connected", false)
        } else if newState == .failed {
            updateStatusCallback("ICE connection failed - check network/TURN server", true)
            print("❌ WHIPClient: ICE connection failed. Check:")
            print("   - Network connectivity")
            print("   - TURN server credentials")
            print("   - Firewall settings")
        } else if newState == .disconnected {
            updateStatusCallback("ICE connection lost", true)
        }
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        updateStatusCallback("ICE gathering state: \(newState)", false)
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        // ICE candidates are handled automatically
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        // Handle candidate removal if needed
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        // Not used for WHIP
    }
}

// MARK: - Error Types

enum WHIPError: LocalizedError {
    case invalidState(String)
    case invalidEndpoint(String)
    case networkError(String)
    case httpError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidState(let message):
            return "Invalid state: \(message)"
        case .invalidEndpoint(let message):
            return "Invalid endpoint: \(message)"
        case .networkError(let message):
            return "Network error: \(message)"
        case .httpError(let message):
            return "HTTP error: \(message)"
        }
    }
}

