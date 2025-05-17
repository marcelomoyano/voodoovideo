import AVFoundation
import VideoToolbox
import Cocoa
import SwiftUI

class VideoPreviewManager: NSObject, ObservableObject {
    @Published private(set) var captureSession = AVCaptureSession()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let audioOutput = AVCaptureAudioDataOutput()
    private let encoder = VideoEncoder()
    private let audioEncoder = AudioEncoder()
    @Published var isSessionRunning = false
    
    // Audio monitoring properties
    private var audioMonitoringEnabled = false
    private var audioMonitoringVolume: Float = 1.0
    private var audioPreviewOutput: AVCaptureAudioPreviewOutput?

    @Published var selectedVideoDevice: String = "" {
        didSet {
            print("📹 PreviewManager: Video device changed to: \(selectedVideoDevice)")
            updateCaptureSession()
        }
    }
    
    @Published var selectedAudioDevice: String = "" {
        didSet {
            print("🔊 PreviewManager: Audio device changed to: \(selectedAudioDevice)")
            updateCaptureSession()
        }
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
            deviceTypes: [.builtInWideAngleCamera, .externalUnknown, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        )
        
        let audioDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInMicrophone, .externalUnknown],
            mediaType: .audio,
            position: .unspecified
        )
        
        // Find selected video device
        let videoDevice = videoDiscoverySession.devices.first(where: { $0.uniqueID == selectedVideoDevice })
        
        // Find selected audio device
        let audioDevice = audioDiscoverySession.devices.first(where: { $0.uniqueID == selectedAudioDevice })
        
        if videoDevice == nil && audioDevice == nil {
            print("⚠️ PreviewManager: No video or audio device selected")
            return
        }
        
        if let videoDevice = videoDevice {
            print("✅ PreviewManager: Updating with video device: \(videoDevice.localizedName)")
        }
        
        if let audioDevice = audioDevice {
            print("✅ PreviewManager: Updating with audio device: \(audioDevice.localizedName)")
        }
        
        // Create a new session to avoid conflicts
        let newSession = AVCaptureSession()
        newSession.beginConfiguration()

        // Add video input if available
        if let videoDevice = videoDevice {
            if let videoInput = try? AVCaptureDeviceInput(device: videoDevice) {
                if newSession.canAddInput(videoInput) {
                    newSession.addInput(videoInput)
                    print("✅ PreviewManager: Added video input for device: \(videoDevice.localizedName)")
                } else {
                    print("❌ PreviewManager: Session cannot add video input for device: \(videoDevice.localizedName)")
                }
            } else {
                print("❌ PreviewManager: Failed to create video input for device: \(videoDevice.localizedName)")
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

        // Add video output
        if newSession.canAddOutput(videoOutput) {
            newSession.addOutput(videoOutput)
            print("✅ PreviewManager: Added video output to session")
        }
        
        // Add audio output
        if newSession.canAddOutput(audioOutput) {
            newSession.addOutput(audioOutput)
            print("✅ PreviewManager: Added audio output to session")
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
        
        // Find default devices
        let videoDevice = AVCaptureDevice.default(for: .video)
        let audioDevice = AVCaptureDevice.default(for: .audio)
        
        // Start with empty session
        captureSession.beginConfiguration()
        captureSession.commitConfiguration()
        
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
    
    deinit {
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension VideoPreviewManager: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output is AVCaptureVideoDataOutput {
            encoder.encode(sampleBuffer: sampleBuffer)
        } else if output is AVCaptureAudioDataOutput {
            audioEncoder.encode(sampleBuffer: sampleBuffer)
        }
    }
}
