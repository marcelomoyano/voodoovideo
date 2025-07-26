import Foundation
import AVFoundation

class HLSSegmenter: NSObject {
    private var segmentIndex = 0
    private var currentSegmentURL: URL?
    private var segmentWriter: AVAssetWriter?
    private var segmentVideoInput: AVAssetWriterInput?
    private var segmentAudioInput: AVAssetWriterInput?
    private var segmentStartTime: CMTime = .zero
    private var segmentSessionStarted = false
    private let segmentDuration: Double = 6.0 // 6 second segments
    private var playlistURL: URL?
    private var segmentURLs: [URL] = []
    
    // HLS directory
    private let hlsDirectory: URL
    private let playlistName = "playlist.m3u8"
    
    var onSegmentReady: ((URL) -> Void)?
    var onPlaylistUpdated: ((URL) -> Void)?
    var onError: ((Error) -> Void)?
    
    override init() {
        // Create HLS directory in Documents
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let timestamp = DateFormatter().apply {
            $0.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        }.string(from: Date())
        hlsDirectory = documentsPath.appendingPathComponent("HLS_\(timestamp)")
        
        super.init()
        
        // Create HLS directory
        do {
            try FileManager.default.createDirectory(at: hlsDirectory, withIntermediateDirectories: true)
            playlistURL = hlsDirectory.appendingPathComponent(playlistName)
            print("📁 HLSSegmenter: Created HLS directory at: \(hlsDirectory.path)")
        } catch {
            print("❌ HLSSegmenter: Failed to create HLS directory - \(error)")
        }
    }
    
    // MARK: - Public Interface
    
    func startSegmenting() {
        print("🎬 HLSSegmenter: Starting HLS segmentation")
        segmentIndex = 0
        segmentURLs.removeAll()
        segmentSessionStarted = false
        createNewSegment()
    }
    
    func stopSegmenting() {
        print("🛑 HLSSegmenter: Stopping HLS segmentation")
        finishCurrentSegment()
        updatePlaylist(isEnd: true)
        resetSegmenter()
    }
    
    private func resetSegmenter() {
        print("🧹 HLSSegmenter: Resetting segmenter state")
        
        // Reset all state variables
        segmentIndex = 0
        currentSegmentURL = nil
        segmentWriter = nil
        segmentVideoInput = nil
        segmentAudioInput = nil
        segmentStartTime = .zero
        segmentSessionStarted = false
        segmentURLs.removeAll()
        
        print("✅ HLSSegmenter: Reset completed")
    }
    
    func processVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let segmentVideoInput = segmentVideoInput,
              segmentVideoInput.isReadyForMoreMediaData else {
            return
        }
        
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        
        // Start session if not started
        if !segmentSessionStarted {
            // Ensure writer is ready before starting session
            guard let writer = segmentWriter, writer.status == .writing else {
                print("❌ HLSSegmenter: Cannot start session - writer status is \(segmentWriter?.status.rawValue ?? -1)")
                return
            }
            
            segmentStartTime = presentationTime
            writer.startSession(atSourceTime: presentationTime)
            segmentSessionStarted = true
            print("🎬 HLSSegmenter: Started session with video sample at time: \(presentationTime)")
        } else {
            // Check if we need to start a new segment
            let elapsed = CMTimeGetSeconds(CMTimeSubtract(presentationTime, segmentStartTime))
            if elapsed >= segmentDuration {
                finishCurrentSegment()
                createNewSegment()
                segmentStartTime = presentationTime
                segmentWriter?.startSession(atSourceTime: presentationTime)
                segmentSessionStarted = true
                print("🎬 HLSSegmenter: Started new segment with video sample at time: \(presentationTime)")
            }
        }
        
        segmentVideoInput.append(sampleBuffer)
    }
    
    func processAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let segmentAudioInput = segmentAudioInput,
              segmentAudioInput.isReadyForMoreMediaData else {
            return
        }
        
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        
        // Start session if not started
        if !segmentSessionStarted {
            // Ensure writer is ready before starting session
            guard let writer = segmentWriter, writer.status == .writing else {
                print("❌ HLSSegmenter: Cannot start session - writer status is \(segmentWriter?.status.rawValue ?? -1)")
                return
            }
            
            segmentStartTime = presentationTime
            writer.startSession(atSourceTime: presentationTime)
            segmentSessionStarted = true
            print("🎬 HLSSegmenter: Started session with audio sample at time: \(presentationTime)")
        } else {
            // Check if we need to start a new segment
            let elapsed = CMTimeGetSeconds(CMTimeSubtract(presentationTime, segmentStartTime))
            if elapsed >= segmentDuration {
                finishCurrentSegment()
                createNewSegment()
                segmentStartTime = presentationTime
                segmentWriter?.startSession(atSourceTime: presentationTime)
                segmentSessionStarted = true
                print("🎬 HLSSegmenter: Started new segment with audio sample at time: \(presentationTime)")
            }
        }
        
        segmentAudioInput.append(sampleBuffer)
    }
    
    // MARK: - Segment Management
    
    private func createNewSegment() {
        let segmentFilename = String(format: "segment_%04d.ts", segmentIndex)
        currentSegmentURL = hlsDirectory.appendingPathComponent(segmentFilename)
        segmentSessionStarted = false // Reset session started flag for new segment
        
        guard let segmentURL = currentSegmentURL else {
            print("❌ HLSSegmenter: Failed to create segment URL")
            return
        }
        
        do {
            // Create new segment writer
            segmentWriter = try AVAssetWriter(outputURL: segmentURL, fileType: .mp4)
            
            // Video settings for HLS (H.264 for compatibility)
            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: 1920,
                AVVideoHeightKey: 1080,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: 5_000_000, // 5 Mbps for HLS
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
                    AVVideoExpectedSourceFrameRateKey: 30
                ]
            ]
            
            let audioSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 128000
            ]
            
            // Create inputs
            segmentVideoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
            segmentVideoInput?.expectsMediaDataInRealTime = true
            
            segmentAudioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            segmentAudioInput?.expectsMediaDataInRealTime = true
            
            // Add inputs to writer
            if let videoInput = segmentVideoInput, segmentWriter!.canAdd(videoInput) {
                segmentWriter!.add(videoInput)
            }
            
            if let audioInput = segmentAudioInput, segmentWriter!.canAdd(audioInput) {
                segmentWriter!.add(audioInput)
            }
            
            // Start writing
            guard segmentWriter!.startWriting() else {
                throw HLSError.failedToStartSegmentWriting(segmentWriter!.error)
            }
            
            print("✅ HLSSegmenter: Created segment \(segmentIndex): \(segmentFilename)")
            
        } catch {
            print("❌ HLSSegmenter: Failed to create segment - \(error)")
            onError?(error)
        }
    }
    
    private func finishCurrentSegment() {
        guard let writer = segmentWriter,
              let segmentURL = currentSegmentURL else {
            return
        }
        
        segmentVideoInput?.markAsFinished()
        segmentAudioInput?.markAsFinished()
        
        writer.finishWriting { [weak self] in
            guard let self = self else { return }
            
            if writer.status == .completed {
                print("✅ HLSSegmenter: Finished segment \(self.segmentIndex)")
                self.segmentURLs.append(segmentURL)
                
                DispatchQueue.main.async {
                    self.onSegmentReady?(segmentURL)
                    self.updatePlaylist(isEnd: false)
                }
                
                self.segmentIndex += 1
            } else {
                print("❌ HLSSegmenter: Failed to finish segment - \(writer.error?.localizedDescription ?? "Unknown error")")
            }
        }
    }
    
    private func updatePlaylist(isEnd: Bool) {
        guard let playlistURL = playlistURL else { return }
        
        var playlistContent = "#EXTM3U\n"
        playlistContent += "#EXT-X-VERSION:3\n"
        playlistContent += "#EXT-X-TARGETDURATION:7\n"
        playlistContent += "#EXT-X-MEDIA-SEQUENCE:0\n"
        
        // Add segments
        for segmentURL in segmentURLs {
            playlistContent += "#EXTINF:6.0,\n"
            playlistContent += segmentURL.lastPathComponent + "\n"
        }
        
        if isEnd {
            playlistContent += "#EXT-X-ENDLIST\n"
        }
        
        do {
            try playlistContent.write(to: playlistURL, atomically: true, encoding: .utf8)
            print("✅ HLSSegmenter: Updated playlist with \(segmentURLs.count) segments")
            onPlaylistUpdated?(playlistURL)
        } catch {
            print("❌ HLSSegmenter: Failed to update playlist - \(error)")
            onError?(error)
        }
    }
    
    // MARK: - Cleanup
    
    func cleanup() {
        // Remove HLS directory and all segments
        do {
            try FileManager.default.removeItem(at: hlsDirectory)
            print("🗑️ HLSSegmenter: Cleaned up HLS directory")
        } catch {
            print("❌ HLSSegmenter: Failed to cleanup HLS directory - \(error)")
        }
    }
}

// MARK: - Extensions

extension DateFormatter {
    func apply(closure: (DateFormatter) -> Void) -> DateFormatter {
        closure(self)
        return self
    }
}

// MARK: - Error Types

enum HLSError: LocalizedError {
    case failedToStartSegmentWriting(Error?)
    
    var errorDescription: String? {
        switch self {
        case .failedToStartSegmentWriting(let error):
            return "Failed to start segment writing: \(error?.localizedDescription ?? "Unknown error")"
        }
    }
}