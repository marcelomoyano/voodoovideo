import Foundation
import AVFoundation
import VideoToolbox
#if os(macOS)
import AppKit
#endif

class LocalRecorder: NSObject {
    private var assetWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var recordingURL: URL?
    private var isRecording = false
    private var sessionStarted = false
    private var sessionStartTime: CMTime?
    private let sessionQueue = DispatchQueue(label: "recording.session", qos: .userInitiated)
    
    // Recording settings (will be configured dynamically)
    private var videoSettings: [String: Any] = [:]
    
    private let audioSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 48000,
        AVNumberOfChannelsKey: 2,
        AVEncoderBitRateKey: 128000
    ]
    
    var onRecordingStarted: (() -> Void)?
    var onRecordingStopped: ((URL) -> Void)?
    var onRecordingError: ((Error) -> Void)?
    
    // MARK: - Public Interface
    
    func startRecording(
        resolution: String = "1080p",
        frameRate: Int = 30,
        bitrate: Int = 10,
        dynamicRange: VideoManager.DynamicRange = .sdr
    ) -> Bool {
        print("🎬 LocalRecorder: startRecording() called")
        
        guard !isRecording else {
            print("❌ LocalRecorder: Already recording")
            return false
        }
        
        // Clean up any previous state
        cleanup()
        
        // Configure video settings based on parameters
        configureVideoSettings(resolution: resolution, frameRate: frameRate, bitrate: bitrate, dynamicRange: dynamicRange)
        
        do {
            try setupRecording()
            print("✅ LocalRecorder: Recording setup completed successfully")
            isRecording = true
            print("✅ LocalRecorder: isRecording flag set to true")
            onRecordingStarted?()
            return true
        } catch {
            print("❌ LocalRecorder: Failed to start recording - \(error)")
            cleanup() // Ensure clean state on failure
            onRecordingError?(error)
            return false
        }
    }
    
    func stopRecording() {
        print("🛑 LocalRecorder: stopRecording() called")
        
        guard isRecording else {
            print("❌ LocalRecorder: Not currently recording")
            return
        }
        
        print("🛑 LocalRecorder: Stopping recording...")
        isRecording = false
        print("🛑 LocalRecorder: isRecording flag set to false")
        
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        
        assetWriter?.finishWriting { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                if let url = self.recordingURL {
                    let fileManager = FileManager.default
                    let fileExists = fileManager.fileExists(atPath: url.path)
                    
                    print("✅ LocalRecorder: Recording finished successfully")
                    print("📁 LocalRecorder: File saved to: \(url.path)")
                    print("📁 LocalRecorder: File exists on disk: \(fileExists)")
                    
                    if fileExists {
                        do {
                            let attributes = try fileManager.attributesOfItem(atPath: url.path)
                            let fileSize = attributes[.size] as? UInt64 ?? 0
                            print("📁 LocalRecorder: File size: \(fileSize) bytes (\(Double(fileSize)/1024/1024) MB)")
                            
                            #if os(macOS)
                            let documentsPath = url.deletingLastPathComponent()
                            NSWorkspace.shared.open(documentsPath)
                            print("📁 LocalRecorder: Opened Documents folder in Finder")
                            #endif
                        } catch {
                            print("❌ LocalRecorder: Could not get file attributes: \(error)")
                        }
                    }
                    
                    self.onRecordingStopped?(url)
                } else {
                    print("❌ LocalRecorder: Recording finished but no URL available")
                }
                
                self.cleanup()
            }
        }
    }
    
    var recordingState: Bool {
        return isRecording
    }
    
    // MARK: - Configuration
    
    private func configureVideoSettings(resolution: String, frameRate: Int, bitrate: Int, dynamicRange: VideoManager.DynamicRange) {
        // Parse resolution
        let (width, height): (Int, Int)
        switch resolution {
        case "1080p":
            (width, height) = (1920, 1080)
        case "720p":
            (width, height) = (1280, 720)
        case "480p":
            (width, height) = (640, 480)
        default:
            (width, height) = (1920, 1080)
        }
        
        // Calculate bitrate in bits per second
        let bitrateInBps = bitrate * 1_000_000
        
        // Configure compression properties (SDR only for now - HEVC doesn't support AVVideoColorPropertiesKey)
        let compressionProperties: [String: Any] = [
            AVVideoAverageBitRateKey: bitrateInBps,
            AVVideoExpectedSourceFrameRateKey: frameRate
        ]
        
        // Note: HLG and PQ are not supported with HEVC codec
        if dynamicRange != .sdr {
            print("⚠️ LocalRecorder: HDR (HLG/PQ) not supported with HEVC codec, using SDR")
        }
        
        videoSettings = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: compressionProperties
        ]
        
        print("✅ LocalRecorder: Configured video settings - \(width)x\(height) @ \(frameRate)fps, \(bitrate)Mbps, \(dynamicRange) (SDR only supported)")
    }
    
    // MARK: - Setup
    
    private func setupRecording() throws {
        // Create unique filename with timestamp
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = formatter.string(from: Date())
        
        let filename = "VoodooVideo_\(timestamp).mov"
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        recordingURL = documentsPath.appendingPathComponent(filename)
        
        guard let url = recordingURL else {
            throw RecordingError.invalidURL
        }
        
        print("📁 LocalRecorder: Documents path: \(documentsPath.path)")
        print("📁 LocalRecorder: Full recording path: \(url.path)")
        print("📁 LocalRecorder: Filename: \(filename)")
        
        // Check if directory exists and is writable
        let fileManager = FileManager.default
        print("📁 LocalRecorder: Documents directory exists: \(fileManager.fileExists(atPath: documentsPath.path))")
        print("📁 LocalRecorder: Documents directory writable: \(fileManager.isWritableFile(atPath: documentsPath.path))")
        
        // Create asset writer
        assetWriter = try AVAssetWriter(outputURL: url, fileType: .mov)
        
        guard let writer = assetWriter else {
            throw RecordingError.failedToCreateWriter
        }
        
        // Setup video input
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput?.expectsMediaDataInRealTime = true
        
        if let videoInput = videoInput, writer.canAdd(videoInput) {
            writer.add(videoInput)
            print("✅ LocalRecorder: Added video input (HEVC 1080p 30fps 10Mbps)")
        } else {
            throw RecordingError.failedToAddVideoInput
        }
        
        // Setup audio input
        audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
        audioInput?.expectsMediaDataInRealTime = true
        
        if let audioInput = audioInput, writer.canAdd(audioInput) {
            writer.add(audioInput)
            print("✅ LocalRecorder: Added audio input (AAC 48kHz stereo)")
        } else {
            throw RecordingError.failedToAddAudioInput
        }
        
        // Start writing
        guard writer.startWriting() else {
            throw RecordingError.failedToStartWriting(writer.error)
        }
        
        print("✅ LocalRecorder: Asset writer ready (session will start with first sample buffer)")
    }
    
    // MARK: - Sample Buffer Processing
    
    func processVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        print("📹 LocalRecorder: Received video sample buffer")
        
        sessionQueue.sync {
            print("📹 LocalRecorder: Processing video sample on session queue")
            
            guard isRecording else {
                print("⚠️ LocalRecorder: Not recording, ignoring video sample")
                return
            }
            
            guard let assetWriter = assetWriter else {
                print("❌ LocalRecorder: No asset writer available")
                return
            }
            
            guard let videoInput = videoInput else {
                print("❌ LocalRecorder: No video input available")
                return
            }
            
            let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            print("📹 LocalRecorder: Video sample time: \(presentationTime)")
            
            // Start session with first sample buffer if not already started
            if !sessionStarted {
                print("🎬 LocalRecorder: STARTING SESSION with video sample at time: \(presentationTime)")
                print("🎬 LocalRecorder: Asset writer status: \(assetWriter.status.rawValue)")
                
                // Ensure writer is in writing state before starting session
                guard assetWriter.status == .writing else {
                    print("❌ LocalRecorder: Cannot start session - writer status is \(assetWriter.status.rawValue), expected \(AVAssetWriter.Status.writing.rawValue)")
                    if let error = assetWriter.error {
                        print("❌ LocalRecorder: Writer error: \(error)")
                    }
                    return
                }
                
                sessionStartTime = presentationTime
                assetWriter.startSession(atSourceTime: presentationTime)
                sessionStarted = true
                
                print("✅ LocalRecorder: Session started successfully with video stream")
                print("✅ LocalRecorder: Asset writer status after start: \(assetWriter.status.rawValue)")
            }
            
            // Ensure sample buffer timestamp is valid relative to session start
            guard let startTime = sessionStartTime,
                  CMTimeCompare(presentationTime, startTime) >= 0 else {
                print("⚠️ LocalRecorder: Video sample timestamp \(presentationTime) is before session start \(sessionStartTime ?? CMTime.zero)")
                return
            }
            
            guard videoInput.isReadyForMoreMediaData else {
                print("⚠️ LocalRecorder: Video input not ready for more data")
                return
            }
            
            print("📹 LocalRecorder: Appending video sample buffer...")
            videoInput.append(sampleBuffer)
            print("✅ LocalRecorder: Video sample buffer appended successfully")
        }
    }
    
    func processAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        print("🔊 LocalRecorder: Received audio sample buffer")
        
        sessionQueue.sync {
            print("🔊 LocalRecorder: Processing audio sample on session queue")
            
            guard isRecording else {
                print("⚠️ LocalRecorder: Not recording, ignoring audio sample")
                return
            }
            
            guard let assetWriter = assetWriter else {
                print("❌ LocalRecorder: No asset writer available")
                return
            }
            
            guard let audioInput = audioInput else {
                print("❌ LocalRecorder: No audio input available")
                return
            }
            
            let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            print("🔊 LocalRecorder: Audio sample time: \(presentationTime)")
            
            // Start session with first sample buffer if not already started
            if !sessionStarted {
                print("🎬 LocalRecorder: STARTING SESSION with audio sample at time: \(presentationTime)")
                print("🎬 LocalRecorder: Asset writer status: \(assetWriter.status.rawValue)")
                
                // Ensure writer is in writing state before starting session
                guard assetWriter.status == .writing else {
                    print("❌ LocalRecorder: Cannot start session - writer status is \(assetWriter.status.rawValue), expected \(AVAssetWriter.Status.writing.rawValue)")
                    if let error = assetWriter.error {
                        print("❌ LocalRecorder: Writer error: \(error)")
                    }
                    return
                }
                
                sessionStartTime = presentationTime
                assetWriter.startSession(atSourceTime: presentationTime)
                sessionStarted = true
                
                print("✅ LocalRecorder: Session started successfully with audio stream")
                print("✅ LocalRecorder: Asset writer status after start: \(assetWriter.status.rawValue)")
            }
            
            // Ensure sample buffer timestamp is valid relative to session start
            guard let startTime = sessionStartTime,
                  CMTimeCompare(presentationTime, startTime) >= 0 else {
                print("⚠️ LocalRecorder: Audio sample timestamp \(presentationTime) is before session start \(sessionStartTime ?? CMTime.zero)")
                return
            }
            
            guard audioInput.isReadyForMoreMediaData else {
                print("⚠️ LocalRecorder: Audio input not ready for more data")
                return
            }
            
            print("🔊 LocalRecorder: Appending audio sample buffer...")
            audioInput.append(sampleBuffer)
            print("✅ LocalRecorder: Audio sample buffer appended successfully")
        }
    }
    
    // MARK: - Cleanup
    
    private func cleanup() {
        print("🧹 LocalRecorder: Cleaning up recording resources")
        
        // Reset session state
        sessionQueue.sync {
            sessionStarted = false
            sessionStartTime = nil
        }
        
        // Clean up writer and inputs
        assetWriter = nil
        videoInput = nil
        audioInput = nil
        recordingURL = nil
        
        print("✅ LocalRecorder: Cleanup completed")
    }
}


// MARK: - Error Types

enum RecordingError: LocalizedError {
    case invalidURL
    case failedToCreateWriter
    case failedToAddVideoInput
    case failedToAddAudioInput
    case failedToStartWriting(Error?)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid recording URL"
        case .failedToCreateWriter:
            return "Failed to create asset writer"
        case .failedToAddVideoInput:
            return "Failed to add video input to writer"
        case .failedToAddAudioInput:
            return "Failed to add audio input to writer"
        case .failedToStartWriting(let error):
            return "Failed to start writing: \(error?.localizedDescription ?? "Unknown error")"
        }
    }
}
