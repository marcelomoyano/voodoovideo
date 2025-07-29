import WebRTC
import AVFoundation
import CoreMedia

/**
 * WebRTCManager - Handles WebRTC track creation from AVFoundation sample buffers
 * Creates and manages video/audio tracks for WHIP streaming
 */
class WebRTCManager: NSObject {
    
    // MARK: - Properties
    private let factory: RTCPeerConnectionFactory
    private var videoSource: RTCVideoSource?
    private var videoCapturer: RTCVideoCapturer?
    private var audioSource: RTCAudioSource?
    private var currentVideoTrack: RTCVideoTrack?
    private var currentAudioTrack: RTCAudioTrack?
    
    // Track buffer management
    private let videoBufferQueue = DispatchQueue(label: "webrtc.video.buffer", qos: .userInitiated)
    private let audioBufferQueue = DispatchQueue(label: "webrtc.audio.buffer", qos: .userInitiated)
    
    // Settings
    private var videoSettings: VideoSettings = VideoSettings()
    private var lastVideoTimestamp: CMTime = CMTime.invalid
    private var lastAudioTimestamp: CMTime = CMTime.invalid
    
    // MARK: - Initialization
    
    override init() {
        // Initialize WebRTC factory
        factory = RTCPeerConnectionFactory()
        super.init()
        
        print("🔧 WebRTCManager: Initialized with WebRTC factory")
    }
    
    // MARK: - Public Methods
    
    func getCurrentVideoTrack() -> RTCVideoTrack? {
        return currentVideoTrack
    }
    
    func getCurrentAudioTrack() -> RTCAudioTrack? {
        return currentAudioTrack
    }
    
    func processVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer, completion: @escaping (RTCVideoTrack?) -> Void) {
        videoBufferQueue.async { [weak self] in
            self?.processVideoSampleBufferInternal(sampleBuffer, completion: completion)
        }
    }
    
    func processAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer, completion: @escaping (RTCAudioTrack?) -> Void) {
        audioBufferQueue.async { [weak self] in
            self?.processAudioSampleBufferInternal(sampleBuffer, completion: completion)
        }
    }
    
    func updateVideoSettings(resolution: String, fps: Int, bitrate: Int) {
        videoSettings.resolution = resolution
        videoSettings.fps = fps
        videoSettings.bitrate = bitrate
        
        print("🔧 WebRTCManager: Updated video settings - \(resolution) @ \(fps)fps, \(bitrate)kbps")
    }
    
    // MARK: - Private Video Processing
    
    private func processVideoSampleBufferInternal(_ sampleBuffer: CMSampleBuffer, completion: @escaping (RTCVideoTrack?) -> Void) {
        guard CMSampleBufferIsValid(sampleBuffer) else {
            print("❌ WebRTCManager: Invalid video sample buffer")
            return
        }
        
        // Create video source if needed
        if videoSource == nil {
            videoSource = factory.videoSource()
            videoCapturer = RTCVideoCapturer(delegate: videoSource!)
            print("📹 WebRTCManager: Created video source")
        }
        
        // Create video track if needed
        if currentVideoTrack == nil, let videoSource = videoSource {
            currentVideoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
            print("📹 WebRTCManager: Created video track")
        }
        
        // Always call completion with current track (even if it already existed)
        DispatchQueue.main.async {
            completion(self.currentVideoTrack)
        }
        
        // Convert sample buffer to RTCVideoFrame
        guard let videoSource = videoSource else { return }
        
        if let videoFrame = createRTCVideoFrame(from: sampleBuffer) {
            // Send frame to WebRTC video source
            if let capturer = videoCapturer {
                videoSource.capturer(capturer, didCapture: videoFrame)
            }
        }
    }
    
    private func createRTCVideoFrame(from sampleBuffer: CMSampleBuffer) -> RTCVideoFrame? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            print("❌ WebRTCManager: Could not get pixel buffer from sample buffer")
            return nil
        }
        
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let timestampNs = Int64(CMTimeGetSeconds(timestamp) * 1_000_000_000)
        
        // Create RTCCVPixelBuffer from CVPixelBuffer
        let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        
        // Get video dimensions
        let width = Int32(CVPixelBufferGetWidth(pixelBuffer))
        let height = Int32(CVPixelBufferGetHeight(pixelBuffer))
        
        // Create RTCVideoFrame
        let videoFrame = RTCVideoFrame(
            buffer: rtcPixelBuffer,
            rotation: RTCVideoRotation._0,
            timeStampNs: timestampNs
        )
        
        // Debug output for first frame or significant changes
        if CMTimeCompare(lastVideoTimestamp, timestamp) != 0 {
            let timeDiff = CMTimeGetSeconds(CMTimeSubtract(timestamp, lastVideoTimestamp))
            if lastVideoTimestamp.isValid && timeDiff > 0 {
                let currentFPS = 1.0 / timeDiff
                if abs(currentFPS - Double(videoSettings.fps)) > 5 { // Only log significant FPS changes
                    print("📹 WebRTCManager: Processing video frame \(width)x\(height) @ \(String(format: "%.1f", currentFPS))fps")
                }
            }
            lastVideoTimestamp = timestamp
        }
        
        return videoFrame
    }
    
    // MARK: - Private Audio Processing
    
    private func processAudioSampleBufferInternal(_ sampleBuffer: CMSampleBuffer, completion: @escaping (RTCAudioTrack?) -> Void) {
        guard CMSampleBufferIsValid(sampleBuffer) else {
            print("❌ WebRTCManager: Invalid audio sample buffer")
            return
        }
        
        // Create audio source if needed  
        if audioSource == nil {
            audioSource = factory.audioSource(with: createAudioConstraints())
            print("🔊 WebRTCManager: Created audio source")
        }
        
        // Create audio track if needed
        if currentAudioTrack == nil, let audioSource = audioSource {
            currentAudioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
            print("🔊 WebRTCManager: Created audio track")
        }
        
        // Always call completion with current track (even if it already existed)
        DispatchQueue.main.async {
            completion(self.currentAudioTrack)
        }
        
        // Process audio sample buffer
        processAudioSampleBuffer(sampleBuffer)
    }
    
    private func processAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        
        // Debug output for audio processing (less frequent)
        if CMTimeCompare(lastAudioTimestamp, timestamp) != 0 {
            let timeDiff = CMTimeGetSeconds(CMTimeSubtract(timestamp, lastAudioTimestamp))
            if lastAudioTimestamp.isValid && timeDiff > 1.0 { // Log every second
                print("🔊 WebRTCManager: Processing audio samples")
            }
            lastAudioTimestamp = timestamp
        }
        
        // Note: For audio, WebRTC expects us to provide the audio data through
        // the RTCAudioSource, but the iOS WebRTC implementation handles
        // the audio pipeline differently. We might need to use RTCAudioTrack
        // with custom audio processing, but for WHIP streaming, the
        // standard WebRTC audio pipeline should work with the microphone input.
        // 
        // If we need custom audio processing, we would implement:
        // - Audio format conversion (PCM)
        // - Sample rate conversion
        // - Channel configuration
        //
        // For now, we'll rely on the standard WebRTC audio capture
        // which should work with AVAudioEngine or AVCaptureSession
    }
    
    private func createAudioConstraints() -> RTCMediaConstraints {
        let mandatoryConstraints = [
            "googEchoCancellation": "false",
            "googNoiseSuppression": "false",
            "googAutoGainControl": "false",
            "googHighpassFilter": "false"
        ]
        
        return RTCMediaConstraints(
            mandatoryConstraints: mandatoryConstraints,
            optionalConstraints: nil
        )
    }
    
    // MARK: - Cleanup
    
    func cleanup() {
        print("🧹 WebRTCManager: Cleaning up resources")
        
        currentVideoTrack = nil
        currentAudioTrack = nil
        videoSource = nil
        audioSource = nil
        videoCapturer = nil
        
        print("✅ WebRTCManager: Cleanup completed")
    }
    
    deinit {
        print("💀 WebRTCManager: Deinitializing")
        cleanup()
    }
}

// MARK: - Supporting Types

private struct VideoSettings {
    var resolution: String = "1080p"
    var fps: Int = 30
    var bitrate: Int = 3000 // kbps
    
    var dimensions: (width: Int32, height: Int32) {
        switch resolution {
        case "2160p", "4K":
            return (3840, 2160)
        case "1440p", "2K":
            return (2560, 1440)
        case "1080p":
            return (1920, 1080)
        case "720p":
            return (1280, 720)
        case "480p":
            return (854, 480)
        case "360p":
            return (640, 360)
        default:
            return (1920, 1080) // Default to 1080p
        }
    }
}

// MARK: - Extensions

extension RTCVideoFrame {
    var customDebugDescription: String {
        return "RTCVideoFrame(width: \(width), height: \(height), rotation: \(rotation), timestamp: \(timeStampNs))"
    }
}
