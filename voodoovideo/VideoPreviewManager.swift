import AVFoundation
import VideoToolbox
import Cocoa
import SwiftUI

extension NSNotification.Name {
    static let captureSessionUpdated = NSNotification.Name("captureSessionUpdated")
}

class VideoPreviewManager: NSObject, ObservableObject {
    @Published private(set) var captureSession = AVCaptureSession()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let audioOutput = AVCaptureAudioDataOutput()
    @Published var isSessionRunning = false
    
    // Permissions
    @Published var cameraPermissionStatus: AVAuthorizationStatus = .notDetermined
    @Published var microphonePermissionStatus: AVAuthorizationStatus = .notDetermined
    @Published var permissionsGranted = false
    
    // Recording components
    private let localRecorder = LocalRecorder()
    private let hlsSegmenter = HLSSegmenter()
    private var r2Uploader: R2Uploader?
    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    private var recordingTimer: Timer?
    private var recordingStartTime: Date?
    
    // Upload progress tracking
    @Published var uploadProgress: [String: Double] = [:]
    @Published var completedUploads: Set<String> = []
    @Published var failedUploads: Set<String> = []
    @Published var totalSegmentCount: Int = 0
    @Published var overallUploadProgress: Double = 0.0
    
    // Audio monitoring properties
    private var audioMonitoringEnabled = false
    private var audioMonitoringVolume: Float = 1.0
    private var audioPreviewOutput: AVCaptureAudioPreviewOutput?

    @Published var selectedVideoDevice: String = "" {
        didSet {
            print("📹 PreviewManager: Video device changed to: \(selectedVideoDevice)")
            if !selectedVideoDevice.isEmpty && permissionsGranted {
                print("📹 PreviewManager: Updating capture session for new device")
                updateCaptureSession()
            } else {
                print("⚠️ PreviewManager: Not updating session - device empty or no permissions")
            }
        }
    }
    
    @Published var selectedAudioDevice: String = "" {
        didSet {
            print("🔊 PreviewManager: Audio device changed to: \(selectedAudioDevice)")
            updateCaptureSession()
        }
    }
    
    var currentVideoDevice: AVCaptureDevice? {
        let session = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        )
        return session.devices.first(where: { $0.uniqueID == selectedVideoDevice })
    }
    
    // MARK: - Public methods for audio monitoring
    
    func setAudioMonitoring(enabled: Bool) {
        print("🔊 PreviewManager: Setting audio monitoring to \(enabled)")
        audioMonitoringEnabled = enabled
        
        if let audioPreviewOutput = audioPreviewOutput {
            audioPreviewOutput.volume = enabled ? audioMonitoringVolume : 0.0
            print("🔊 PreviewManager: Audio monitoring \(enabled ? "enabled" : "disabled") with volume \(audioMonitoringVolume)")
        }
    }
    
    func setAudioMonitoringVolume(_ volume: Double) {
        audioMonitoringVolume = Float(volume)
        
        if audioMonitoringEnabled, let audioPreviewOutput = audioPreviewOutput {
            audioPreviewOutput.volume = audioMonitoringVolume
            print("🔊 PreviewManager: Set audio monitoring volume to \(volume)")
        }
    }
    
    // MARK: - Private audio monitoring methods
    
    private func setupAudioPreviewOutput() {
        // Remove any existing audio preview output
        captureSession.outputs.forEach { output in
            if output is AVCaptureAudioPreviewOutput {
                captureSession.removeOutput(output)
            }
        }
        
        // Add new audio preview output
        audioPreviewOutput = AVCaptureAudioPreviewOutput()
        if let audioPreviewOutput = audioPreviewOutput, captureSession.canAddOutput(audioPreviewOutput) {
            captureSession.addOutput(audioPreviewOutput)
            // Set initial volume based on monitoring state
            audioPreviewOutput.volume = audioMonitoringEnabled ? audioMonitoringVolume : 0.0
            print("✅ PreviewManager: Added audio preview output for monitoring")
        } else {
            print("❌ PreviewManager: Failed to add audio preview output")
        }
    }

    func updateCaptureSession() {
        print("🔄 PreviewManager: Updating capture session...")
        
        // Use discovery session instead of deprecated devices() method
        let videoDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        )
        
        let audioDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
            mediaType: .audio,
            position: .unspecified
        )
        
        // Find selected video device
        let videoDevice = videoDiscoverySession.devices.first(where: { $0.uniqueID == selectedVideoDevice })
        
        // Find selected audio device
        let audioDevice = audioDiscoverySession.devices.first(where: { $0.uniqueID == selectedAudioDevice })
        
        print("🔍 PreviewManager: Looking for video device ID: '\(selectedVideoDevice)'")
        print("🔍 PreviewManager: Available video devices:")
        videoDiscoverySession.devices.forEach { device in
            print("  - \(device.localizedName) (ID: '\(device.uniqueID)') Type: \(device.deviceType)")
        }
        
        if videoDevice == nil && audioDevice == nil {
            print("⚠️ PreviewManager: No video or audio device selected")
            return
        }
        
        if let videoDevice = videoDevice {
            print("✅ PreviewManager: Updating with video device: \(videoDevice.localizedName)")
            print("✅ PreviewManager: Device type: \(videoDevice.deviceType)")
            print("✅ PreviewManager: Manufacturer: \(videoDevice.manufacturer)")
            print("✅ PreviewManager: Model ID: \(videoDevice.modelID)")
        } else if !selectedVideoDevice.isEmpty {
            print("❌ PreviewManager: Could not find video device with ID: '\(selectedVideoDevice)'")
        }
        
        if let audioDevice = audioDevice {
            print("✅ PreviewManager: Updating with audio device: \(audioDevice.localizedName)")
        }
        
        // Create a new session to avoid conflicts
        let newSession = AVCaptureSession()
        
        // Remove outputs from current session before reusing them
        if captureSession.outputs.contains(videoOutput) {
            captureSession.removeOutput(videoOutput)
            print("🔄 PreviewManager: Removed video output from old session")
        }
        if captureSession.outputs.contains(audioOutput) {
            captureSession.removeOutput(audioOutput)
            print("🔄 PreviewManager: Removed audio output from old session")
        }
        
        newSession.beginConfiguration()
        
        // Set a high-quality preset for capture cards
        if newSession.canSetSessionPreset(.high) {
            newSession.sessionPreset = .high
            print("📹 PreviewManager: Set session preset to high quality")
        } else if newSession.canSetSessionPreset(.medium) {
            newSession.sessionPreset = .medium
            print("📹 PreviewManager: Set session preset to medium quality")
        }

        // Add video input if available
        if let videoDevice = videoDevice {
            do {
                let videoInput = try AVCaptureDeviceInput(device: videoDevice)
                if newSession.canAddInput(videoInput) {
                    newSession.addInput(videoInput)
                    print("✅ PreviewManager: Added video input for device: \(videoDevice.localizedName)")
                    
                    // Try to configure the device for optimal capture card settings
                    try videoDevice.lockForConfiguration()
                    
                    // Set the active format to a supported one if needed
                    let formats = videoDevice.formats
                    print("📹 PreviewManager: Device has \(formats.count) formats available")
                    
                    // Log all available formats for debugging
                    formats.enumerated().forEach { index, format in
                        let desc = format.formatDescription
                        let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                        let frameRateRanges = format.videoSupportedFrameRateRanges
                        let frameRates = frameRateRanges.map { "\($0.minFrameRate)-\($0.maxFrameRate)fps" }.joined(separator: ", ")
                        let pixelFormat = CMFormatDescriptionGetMediaSubType(desc)
                        let pixelFormatString = String(format: "%c%c%c%c", 
                                                     (pixelFormat >> 24) & 0xFF,
                                                     (pixelFormat >> 16) & 0xFF, 
                                                     (pixelFormat >> 8) & 0xFF,
                                                     pixelFormat & 0xFF)
                        print("  Format \(index): \(dimensions.width)x\(dimensions.height) @ \(frameRates) - \(pixelFormatString)")
                    }
                    
                    // For Elgato and external capture cards, find the best format
                    var preferredFormat: AVCaptureDevice.Format?
                    
                    if videoDevice.deviceType == .external {
                        print("📹 PreviewManager: Configuring external capture device: \(videoDevice.localizedName)")
                        
                        // For Elgato 4K X, prefer NV12 format which is what it uses
                        let preferredPixelFormats: [OSType] = [
                            kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,  // NV12
                            kCVPixelFormatType_422YpCbCr8,                     // YUY2
                            kCVPixelFormatType_32BGRA                          // BGRA fallback
                        ]
                        
                        // Priority order matching Elgato 4K X formats from OBS
                        let preferredSpecs = [
                            (1920, 1080, 60.0), (1920, 1080, 30.0), (1920, 1080, 59.94),
                            (1280, 720, 60.0), (1280, 720, 59.94), (1280, 720, 30.0),
                            (720, 480, 60.0), (720, 480, 59.94), (720, 480, 30.0),
                            (640, 480, 60.0), (640, 480, 59.94), (640, 480, 30.0),
                            (720, 576, 50.0)
                        ]
                        
                        // Try each preferred spec with preferred pixel formats
                        for (width, height, fps) in preferredSpecs {
                            for pixelFormat in preferredPixelFormats {
                                preferredFormat = formats.first { format in
                                    let desc = format.formatDescription
                                    let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                                    let frameRateRanges = format.videoSupportedFrameRateRanges
                                    let formatPixelFormat = CMFormatDescriptionGetMediaSubType(desc)
                                    
                                    let dimensionMatch = dimensions.width == width && dimensions.height == height
                                    let pixelFormatMatch = formatPixelFormat == pixelFormat
                                    let frameRateMatch = frameRateRanges.contains { abs($0.maxFrameRate - fps) < 0.1 || $0.maxFrameRate >= fps }
                                    
                                    return dimensionMatch && pixelFormatMatch && frameRateMatch
                                }
                                if preferredFormat != nil {
                                    print("📹 PreviewManager: Found preferred format: \(width)x\(height) @ \(fps)fps")
                                    break
                                }
                            }
                            if preferredFormat != nil { break }
                        }
                        
                        // If no exact match, try without pixel format restriction
                        if preferredFormat == nil {
                            print("📹 PreviewManager: No exact format match, trying without pixel format restriction")
                            for (width, height, fps) in preferredSpecs {
                                preferredFormat = formats.first { format in
                                    let desc = format.formatDescription
                                    let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                                    let frameRateRanges = format.videoSupportedFrameRateRanges
                                    
                                    return dimensions.width == width &&
                                           dimensions.height == height &&
                                           frameRateRanges.contains { abs($0.maxFrameRate - fps) < 0.1 || $0.maxFrameRate >= fps }
                                }
                                if preferredFormat != nil { break }
                            }
                        }
                        
                        // Final fallback: any format with decent resolution and frame rate
                        if preferredFormat == nil {
                            print("📹 PreviewManager: Using fallback format selection")
                            preferredFormat = formats.filter { format in
                                let desc = format.formatDescription
                                let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                                let frameRateRanges = format.videoSupportedFrameRateRanges
                                return dimensions.width >= 640 && 
                                       dimensions.height >= 480 &&
                                       frameRateRanges.contains { $0.maxFrameRate >= 30.0 }
                            }.first
                        }
                    } else {
                        // For built-in cameras, prefer 1080p or highest available
                        preferredFormat = formats.first { format in
                            let desc = format.formatDescription
                            let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                            return dimensions.width >= 1920 && dimensions.height >= 1080
                        } ?? formats.last
                    }
                    
                    if let format = preferredFormat {
                        videoDevice.activeFormat = format
                        let desc = format.formatDescription
                        let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                        let frameRateRanges = format.videoSupportedFrameRateRanges
                        let maxFPS = frameRateRanges.map { $0.maxFrameRate }.max() ?? 0
                        let pixelFormat = CMFormatDescriptionGetMediaSubType(desc)
                        let pixelFormatString = String(format: "%c%c%c%c", 
                                                     (pixelFormat >> 24) & 0xFF,
                                                     (pixelFormat >> 16) & 0xFF, 
                                                     (pixelFormat >> 8) & 0xFF,
                                                     pixelFormat & 0xFF)
                        print("📹 PreviewManager: Set active format to \(dimensions.width)x\(dimensions.height) @ \(maxFPS)fps - \(pixelFormatString)")
                        
                        // Set frame rate to maximum for capture cards
                        if videoDevice.deviceType == .external && !frameRateRanges.isEmpty {
                            // Find the best frame rate range (prefer 60fps or highest available)
                            let bestRange = frameRateRanges.max { range1, range2 in
                                // Prefer 60fps if available, otherwise highest
                                let rate1 = abs(range1.maxFrameRate - 60.0) < 0.1 ? 1000 : range1.maxFrameRate
                                let rate2 = abs(range2.maxFrameRate - 60.0) < 0.1 ? 1000 : range2.maxFrameRate
                                return rate1 < rate2
                            }
                            
                            if let range = bestRange {
                                // Use the exact CMTime from the supported range
                                videoDevice.activeVideoMinFrameDuration = range.minFrameDuration
                                videoDevice.activeVideoMaxFrameDuration = range.maxFrameDuration
                                print("📹 PreviewManager: Set frame rate to \(range.maxFrameRate)fps using exact range")
                            } else {
                                print("⚠️ PreviewManager: No valid frame rate range found")
                            }
                        }
                    } else {
                        print("❌ PreviewManager: No suitable format found for \(videoDevice.localizedName)")
                    }
                    
                    videoDevice.unlockForConfiguration()
                } else {
                    print("❌ PreviewManager: Session cannot add video input for device: \(videoDevice.localizedName)")
                    print("❌ PreviewManager: Session preset: \(newSession.sessionPreset)")
                }
            } catch {
                print("❌ PreviewManager: Failed to create video input for device: \(videoDevice.localizedName) - Error: \(error)")
            }
        }
        
        // Add audio input if available
        if let audioDevice = audioDevice {
            if let audioInput = try? AVCaptureDeviceInput(device: audioDevice) {
                if newSession.canAddInput(audioInput) {
                    newSession.addInput(audioInput)
                    print("✅ PreviewManager: Added audio input for device: \(audioDevice.localizedName)")
                } else {
                    print("❌ PreviewManager: Session cannot add audio input for device: \(audioDevice.localizedName)")
                }
            } else {
                print("❌ PreviewManager: Failed to create audio input for device: \(audioDevice.localizedName)")
            }
        }

        // Debug output connections
        print("🔍 PreviewManager: Current video output connections: \(videoOutput.connections.count)")
        print("🔍 PreviewManager: Current audio output connections: \(audioOutput.connections.count)")
        print("🔍 PreviewManager: Video output connected input: \(String(describing: videoOutput.connections.first?.inputPorts.first?.input))")
        print("🔍 PreviewManager: Audio output connected input: \(String(describing: audioOutput.connections.first?.inputPorts.first?.input))")
        
        // Add video output
        if newSession.canAddOutput(videoOutput) {
            newSession.addOutput(videoOutput)
            print("✅ PreviewManager: Added video output to session")
        } else {
            print("❌ PreviewManager: Cannot add video output - it may already belong to another session")
        }
        
        // Add audio output
        if newSession.canAddOutput(audioOutput) {
            newSession.addOutput(audioOutput)
            print("✅ PreviewManager: Added audio output to session")
        } else {
            print("❌ PreviewManager: Cannot add audio output - it may already belong to another session")
        }
        
        // Add audio preview output for monitoring
        newSession.commitConfiguration()
        
        // Stop current session
        if captureSession.isRunning {
            captureSession.stopRunning()
            print("🛑 PreviewManager: Stopped previous session")
        }
        
        // Update session reference and start
        captureSession = newSession
        
        // Setup audio preview output after session is created but before starting
        setupAudioPreviewOutput()
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = self?.captureSession.isRunning ?? false
                print("▶️ PreviewManager: Started new session, running: \(self?.captureSession.isRunning ?? false)")
                
                // Force UI update after session starts
                self?.objectWillChange.send()
            }
        }
        
        // Notify listeners about the new session
        DispatchQueue.main.async {
            print("📣 PreviewManager: Broadcasting session update notification")
            NotificationCenter.default.post(name: .captureSessionUpdated, object: newSession)
        }
    }

    override init() {
        super.init()
        print("🚀 PreviewManager: Initializing")
        
        // Configure outputs
        videoOutput.setSampleBufferDelegate(self, queue: DispatchQueue(label: "video.queue"))
        audioOutput.setSampleBufferDelegate(self, queue: DispatchQueue(label: "audio.queue"))
        
        // Start with empty session
        captureSession.beginConfiguration()
        captureSession.commitConfiguration()
        
        // Check permissions first
        checkPermissions()
        
        // Only set up devices if permissions are already granted
        if permissionsGranted {
            setupDefaultDevices()
        }
    }
    
    private func setupDefaultDevices() {
        // Find default devices
        let videoDevice = AVCaptureDevice.default(for: .video)
        let audioDevice = AVCaptureDevice.default(for: .audio)
        
        // Set device IDs
        if let videoDevice = videoDevice {
            print("✅ PreviewManager: Found default video device: \(videoDevice.localizedName)")
            selectedVideoDevice = videoDevice.uniqueID
        } else {
            print("⚠️ PreviewManager: No default video device available")
        }
        
        if let audioDevice = audioDevice {
            print("✅ PreviewManager: Found default audio device: \(audioDevice.localizedName)")
            selectedAudioDevice = audioDevice.uniqueID
        } else {
            print("⚠️ PreviewManager: No default audio device available")
        }
    }
    
    // MARK: - Permission Management
    
    func checkPermissions() {
        cameraPermissionStatus = AVCaptureDevice.authorizationStatus(for: .video)
        microphonePermissionStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        updatePermissionsStatus()
        
        print("📹 PreviewManager: Camera permission: \(cameraPermissionStatus.description)")
        print("🎤 PreviewManager: Microphone permission: \(microphonePermissionStatus.description)")
    }
    
    func requestCameraPermission() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async { [weak self] in
                self?.cameraPermissionStatus = AVCaptureDevice.authorizationStatus(for: .video)
                self?.updatePermissionsStatus()
                if granted {
                    print("✅ PreviewManager: Camera permission granted")
                    self?.setupDefaultDevices()
                    self?.startPreviewIfReady()
                } else {
                    print("❌ PreviewManager: Camera permission denied")
                }
            }
        }
    }
    
    func requestMicrophonePermission() {
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.microphonePermissionStatus = AVCaptureDevice.authorizationStatus(for: .audio)
                self.updatePermissionsStatus()
                if granted {
                    print("✅ PreviewManager: Microphone permission granted")
                    self.setupDefaultDevices()
                } else {
                    print("❌ PreviewManager: Microphone permission denied")
                }
            }
        }
    }
    
    private func updatePermissionsStatus() {
        permissionsGranted = cameraPermissionStatus == .authorized && microphonePermissionStatus == .authorized
        print("📋 PreviewManager: Permissions granted: \(permissionsGranted)")
    }
    
    // MARK: - Preview Control
    
    func startPreview() {
        guard permissionsGranted else {
            print("❌ PreviewManager: Cannot start preview - permissions not granted")
            return
        }
        
        guard !selectedVideoDevice.isEmpty else {
            print("❌ PreviewManager: Cannot start preview - no video device selected")
            return
        }
        
        startPreviewIfReady()
    }
    
    private func startPreviewIfReady() {
        guard permissionsGranted && !captureSession.isRunning && !selectedVideoDevice.isEmpty else { 
            print("⚠️ PreviewManager: Not ready to start preview - permissions: \(permissionsGranted), running: \(captureSession.isRunning), device: \(selectedVideoDevice)")
            return 
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = self?.captureSession.isRunning ?? false
                print("📹 PreviewManager: Preview session started - running: \(self?.isSessionRunning ?? false)")
            }
        }
    }
    
    func stopPreview() {
        if captureSession.isRunning {
            captureSession.stopRunning()
            isSessionRunning = false
            print("📹 PreviewManager: Preview session stopped")
        }
    }
    
    // MARK: - Recording Control
    
    func startRecording(
        uploadEndpoint: String? = nil,
        resolution: String = "1080p",
        frameRate: Int = 30,
        bitrate: Int = 10,
        dynamicRange: VideoManager.DynamicRange = .sdr,
        r2AccessKey: String? = nil,
        r2SecretKey: String? = nil
    ) -> Bool {
        guard !isRecording else {
            print("❌ PreviewManager: Already recording")
            return false
        }
        
        print("🎬 PreviewManager: Starting recording...")
        
        // Ensure clean state before starting new recording
        cleanupRecordingState()
        
        // Setup R2 uploader if credentials provided
        if let accessKey = r2AccessKey, let secretKey = r2SecretKey,
           !accessKey.isEmpty, !secretKey.isEmpty {
            // Use default R2 endpoint for now - could be configurable later
            let r2Endpoint = "https://e561d71f6685e1ddd58b290d834f940e.r2.cloudflarestorage.com/vod"
            r2Uploader = R2Uploader(
                r2Endpoint: r2Endpoint,
                accessKeyId: accessKey,
                secretAccessKey: secretKey
            )
            setupR2UploaderCallbacks()
            print("✅ PreviewManager: R2 uploader initialized for HLS streaming")
            print("🔧 PreviewManager: R2 callbacks configured for progress tracking")
        } else {
            print("⚠️ PreviewManager: No R2 credentials provided, skipping R2 upload")
        }
        
        // Setup recording callbacks
        setupRecordingCallbacks()
        
        // Start local recording with settings
        guard localRecorder.startRecording(
            resolution: resolution,
            frameRate: frameRate,
            bitrate: bitrate,
            dynamicRange: dynamicRange
        ) else {
            print("❌ PreviewManager: Failed to start local recording")
            cleanupRecordingState()
            return false
        }
        
        // Start HLS segmentation
        hlsSegmenter.startSegmenting()
        
        // Update state
        isRecording = true
        recordingStartTime = Date()
        
        // Start recording timer
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.updateRecordingDuration()
        }
        
        print("✅ PreviewManager: Recording started successfully")
        return true
    }
    
    func stopRecording() {
        guard isRecording else {
            print("❌ PreviewManager: Not currently recording")
            return
        }
        
        print("🛑 PreviewManager: Stopping recording...")
        
        // Stop recording
        localRecorder.stopRecording()
        hlsSegmenter.stopSegmenting()
        
        // Clean up state
        cleanupRecordingState()
        
        print("✅ PreviewManager: Recording stopped")
    }
    
    private func cleanupRecordingState() {
        print("🧹 PreviewManager: Cleaning up recording state")
        
        // Stop and clean up timer
        recordingTimer?.invalidate()
        recordingTimer = nil
        
        // Reset state variables
        isRecording = false
        recordingStartTime = nil
        recordingDuration = 0
        
        // Clean up uploaders handled above
        
        print("✅ PreviewManager: Recording state cleanup completed")
    }
    
    private func updateRecordingDuration() {
        guard let startTime = recordingStartTime else { return }
        recordingDuration = Date().timeIntervalSince(startTime)
    }
    
    private func setupRecordingCallbacks() {
        localRecorder.onRecordingStarted = {
            print("📹 PreviewManager: Local recording started")
        }
        
        localRecorder.onRecordingStopped = { url in
            print("📹 PreviewManager: Local recording saved to: \(url.path)")
        }
        
        localRecorder.onRecordingError = { [weak self] error in
            print("❌ PreviewManager: Recording error - \(error.localizedDescription)")
            DispatchQueue.main.async {
                self?.isRecording = false
                self?.recordingTimer?.invalidate()
                self?.recordingTimer = nil
            }
        }
        
        hlsSegmenter.onSegmentReady = { [weak self] segmentURL in
            print("📺 PreviewManager: HLS segment ready: \(segmentURL.lastPathComponent)")
            print("🚀 PreviewManager: Starting R2 upload for segment: \(segmentURL.lastPathComponent)")
            self?.r2Uploader?.uploadSegment(segmentURL)
            
            // Update total segment count for progress calculation
            DispatchQueue.main.async {
                self?.totalSegmentCount += 1
                self?.updateOverallProgress()
                print("📊 PreviewManager: Total segments now: \(self?.totalSegmentCount ?? 0)")
            }
        }
        
        hlsSegmenter.onPlaylistUpdated = { [weak self] playlistURL in
            print("📺 PreviewManager: HLS playlist updated")
            self?.r2Uploader?.uploadPlaylist(playlistURL)
            // Note: Don't count playlist in segment count for progress calculation
        }
        
        hlsSegmenter.onError = { error in
            print("❌ PreviewManager: HLS segmentation error - \(error.localizedDescription)")
        }
    }
    
    private func setupR2UploaderCallbacks() {
        r2Uploader?.onUploadProgress = { [weak self] filename, progress in
            print("📤 PreviewManager: Upload progress for \(filename): \(Int(progress * 100))%")
            DispatchQueue.main.async {
                self?.uploadProgress[filename] = progress
                self?.updateOverallProgress()
            }
        }
        
        r2Uploader?.onUploadComplete = { [weak self] filename in
            print("✅ PreviewManager: Upload complete for \(filename)")
            DispatchQueue.main.async {
                self?.completedUploads.insert(filename)
                self?.uploadProgress[filename] = 1.0
                self?.updateOverallProgress()
            }
        }
        
        r2Uploader?.onUploadError = { [weak self] filename, error in
            print("❌ PreviewManager: Upload error for \(filename) - \(error.localizedDescription)")
            DispatchQueue.main.async {
                self?.failedUploads.insert(filename)
                self?.uploadProgress[filename] = 0.0
                self?.updateOverallProgress()
            }
        }
    }
    
    private func updateOverallProgress() {
        guard totalSegmentCount > 0 else {
            overallUploadProgress = 0.0
            return
        }
        
        // Only count segment uploads, not playlist uploads for progress calculation
        let segmentProgress = uploadProgress.filter { !$0.key.contains(".m3u8") }
        let segmentCompleted = completedUploads.filter { !$0.contains(".m3u8") }
        
        let totalProgress = segmentProgress.values.reduce(0.0, +)
        overallUploadProgress = min(totalProgress / Double(totalSegmentCount), 1.0) // Cap at 100%
        
        print("📊 PreviewManager: Overall upload progress: \(Int(overallUploadProgress * 100))% (\(segmentCompleted.count)/\(totalSegmentCount) segments)")
    }
    
    deinit {
        print("💀 PreviewManager: Deinitializing")
        stopRecording()
        cleanupRecordingState()
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension VideoPreviewManager: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // Only process samples if we're actively recording
        guard isRecording else { return }
        
        if output is AVCaptureVideoDataOutput {
            // Ensure both recorders are in valid state before processing
            if localRecorder.recordingState {
                localRecorder.processVideoSampleBuffer(sampleBuffer)
                hlsSegmenter.processVideoSampleBuffer(sampleBuffer)
            }
        } else if output is AVCaptureAudioDataOutput {
            // Ensure both recorders are in valid state before processing  
            if localRecorder.recordingState {
                localRecorder.processAudioSampleBuffer(sampleBuffer)
                hlsSegmenter.processAudioSampleBuffer(sampleBuffer)
            }
        }
    }
}

// MARK: - AVAuthorizationStatus Extension

extension AVAuthorizationStatus {
    var description: String {
        switch self {
        case .notDetermined:
            return "Not Determined"
        case .restricted:
            return "Restricted"
        case .denied:
            return "Denied"
        case .authorized:
            return "Authorized"
        @unknown default:
            return "Unknown"
        }
    }
}

