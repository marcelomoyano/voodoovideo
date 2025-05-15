import Cocoa
import AVFoundation
import SwiftUI

class VideoPreviewManager: NSObject {
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var videoDeviceInput: AVCaptureDeviceInput?
    private var audioDeviceInput: AVCaptureDeviceInput?
    private var audioPreviewOutput: AVCaptureAudioPreviewOutput?
    private var hostView: NSView?
    
    deinit {
        stopCaptureSession()
    }
    
    func setupCaptureSession(in view: NSView) {
        // Store reference to the host view
        self.hostView = view
        
        // Initialize capture session
        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .high
        
        // Create preview layer
        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession!)
        previewLayer?.videoGravity = .resizeAspect
        
        // Configure view to display the preview layer
        view.wantsLayer = true
        if view.layer == nil {
            view.layer = CALayer()
        }
        
        // Remove any existing layers and add our preview layer
        if let existingLayers = view.layer?.sublayers {
            for layer in existingLayers {
                layer.removeFromSuperlayer()
            }
        }
        
        if let previewLayer = previewLayer {
            previewLayer.frame = view.bounds
            view.layer?.addSublayer(previewLayer)
            
            // Set autoresizing to maintain size with parent view
            previewLayer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        }
        
        // Set up resize notification
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(viewDidResize(_:)),
            name: NSView.frameDidChangeNotification,
            object: view
        )
        
        // Set up audio preview output for monitoring
        setupAudioPreviewOutput()
        
        // Start the session
        startCaptureSession()
        
        print("Capture session and preview layer setup completed")
    }
    
    @objc private func viewDidResize(_ notification: Notification) {
        if let view = notification.object as? NSView {
            updatePreviewLayerFrame(view.bounds)
            print("View resized: \(view.bounds.size)")
        }
    }
    
    func updatePreviewLayerFrame(_ bounds: CGRect) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        previewLayer?.frame = bounds
        CATransaction.commit()
    }
    
    private func setupAudioPreviewOutput() {
        guard let captureSession = captureSession else { return }
        
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
            // Initially disable monitoring
            audioPreviewOutput.volume = 0.0
            print("Added audio preview output for monitoring")
        }
    }
    
    func setAudioMonitoring(enabled: Bool, volume: Float = 1.0) {
        if let audioPreviewOutput = audioPreviewOutput {
            audioPreviewOutput.volume = enabled ? volume : 0.0
            print("Audio monitoring \(enabled ? "enabled" : "disabled") with volume \(volume)")
        }
    }
    
    func setVideoDevice(_ device: AVCaptureDevice) {
        guard let captureSession = captureSession else { return }
        
        // If it's the same device, don't reconfigure
        if let currentInput = videoDeviceInput, currentInput.device == device {
            return
        }
        
        captureSession.beginConfiguration()
        
        // Remove existing input if any
        if let currentInput = videoDeviceInput {
            captureSession.removeInput(currentInput)
            self.videoDeviceInput = nil
        }
        
        // Add new input
        do {
            let newVideoInput = try AVCaptureDeviceInput(device: device)
            
            if captureSession.canAddInput(newVideoInput) {
                captureSession.addInput(newVideoInput)
                self.videoDeviceInput = newVideoInput
                print("Successfully set video device: \(device.localizedName)")
                
                // Add video output if needed
                setupVideoOutput()
            } else {
                print("Cannot add video input for device: \(device.localizedName)")
            }
        } catch {
            print("Error setting up video device: \(error)")
        }
        
        captureSession.commitConfiguration()
    }
    
    private func setupVideoOutput() {
        guard let captureSession = captureSession else { return }
        
        // Only add video output if it's not already present
        if !captureSession.outputs.contains(where: { $0 is AVCaptureVideoDataOutput }) {
            let videoOutput = AVCaptureVideoDataOutput()
            if captureSession.canAddOutput(videoOutput) {
                captureSession.addOutput(videoOutput)
                print("Added video output to capture session")
            }
        }
    }
    
    func setAudioDevice(_ device: AVCaptureDevice) {
        guard let captureSession = captureSession else { return }
        
        // If it's the same device, don't reconfigure
        if let currentInput = audioDeviceInput, currentInput.device == device {
            return
        }
        
        captureSession.beginConfiguration()
        
        // Remove existing input if any
        if let currentInput = audioDeviceInput {
            captureSession.removeInput(currentInput)
            self.audioDeviceInput = nil
        }
        
        // Add new input
        do {
            let newAudioInput = try AVCaptureDeviceInput(device: device)
            
            if captureSession.canAddInput(newAudioInput) {
                captureSession.addInput(newAudioInput)
                self.audioDeviceInput = newAudioInput
                print("Successfully set audio device: \(device.localizedName)")
                
                // Ensure audio preview output is set up
                setupAudioPreviewOutput()
            } else {
                print("Cannot add audio input for device: \(device.localizedName)")
            }
        } catch {
            print("Error setting up audio device: \(error)")
        }
        
        captureSession.commitConfiguration()
    }
    
    func startCaptureSession() {
        if captureSession?.isRunning == false {
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.captureSession?.startRunning()
                print("Capture session started")
            }
        }
    }
    
    func stopCaptureSession() {
        if captureSession?.isRunning == true {
            captureSession?.stopRunning()
            print("Capture session stopped")
        }
        
        // Remove resize notification observer
        if let hostView = hostView {
            NotificationCenter.default.removeObserver(
                self,
                name: NSView.frameDidChangeNotification,
                object: hostView
            )
        }
    }
}

// SwiftUI wrapper for the NSView that contains the AVCaptureVideoPreviewLayer
struct VideoPreviewRepresentable: NSViewRepresentable {
    @ObservedObject var videoManager: VideoManager
    
    // Use a coordinator to maintain the VideoPreviewManager's lifecycle
    class Coordinator: NSObject {
        var parent: VideoPreviewRepresentable
        var previewManager: VideoPreviewManager
        
        init(parent: VideoPreviewRepresentable) {
            self.parent = parent
            self.previewManager = VideoPreviewManager()
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }
    
    func makeNSView(context: Context) -> NSView {
        // Create a view that will automatically resize with its superview
        let view = ResizableNSView(frame: .zero)
        view.autoresizingMask = [.width, .height]
        view.translatesAutoresizingMaskIntoConstraints = true
        
        let coordinator = context.coordinator
        
        // Setup capture session
        coordinator.previewManager.setupCaptureSession(in: view)
        
        // Check authorization status and request permissions if needed
        checkAndRequestCameraPermission()
        
        // Initialize with selected devices
        if let device = videoManager.currentVideoDevice {
            print("Setting up initial video device: \(device.localizedName)")
            coordinator.previewManager.setVideoDevice(device)
        }
        
        if let device = videoManager.currentAudioDevice {
            coordinator.previewManager.setAudioDevice(device)
        }
        
        // Set initial audio monitoring state
        coordinator.previewManager.setAudioMonitoring(
            enabled: videoManager.isAudioMonitoringEnabled, 
            volume: Float(videoManager.audioMonitoringVolume)
        )
        
        return view
    }
    
    func updateNSView(_ nsView: NSView, context: Context) {
        let coordinator = context.coordinator
        
        // Update the preview layer frame when the view size changes
        if nsView.frame.size != .zero {
            coordinator.previewManager.updatePreviewLayerFrame(nsView.bounds)
        }
        
        // Update video device if needed
        if let device = videoManager.currentVideoDevice {
            coordinator.previewManager.setVideoDevice(device)
        }
        
        // Update audio device if needed
        if let device = videoManager.currentAudioDevice {
            coordinator.previewManager.setAudioDevice(device)
        }
        
        // Update audio monitoring
        coordinator.previewManager.setAudioMonitoring(
            enabled: videoManager.isAudioMonitoringEnabled,
            volume: Float(videoManager.audioMonitoringVolume)
        )
    }
    
    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        // Clean up resources
        coordinator.previewManager.stopCaptureSession()
    }
    
    private func checkAndRequestCameraPermission() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            // Already authorized
            break
        case .notDetermined:
            // Request permission
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted {
                    // Permission granted, refresh devices
                    DispatchQueue.main.async {
                        self.videoManager.refreshDevices()
                    }
                }
            }
        case .denied, .restricted:
            // Alert user to change permissions
            print("Camera permissions denied or restricted")
        @unknown default:
            break
        }
        
        // Also check microphone permissions
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            // Already authorized
            break
        case .notDetermined:
            // Request permission
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                if granted {
                    // Permission granted, refresh devices
                    DispatchQueue.main.async {
                        self.videoManager.refreshDevices()
                    }
                }
            }
        case .denied, .restricted:
            // Alert user to change permissions
            print("Microphone permissions denied or restricted")
        @unknown default:
            break
        }
    }
}

// Custom NSView that properly handles resizing
class ResizableNSView: NSView {
    override func layout() {
        super.layout()
        // Notify when layout changes (including parent size changes)
        NotificationCenter.default.post(
            name: NSView.frameDidChangeNotification,
            object: self
        )
    }
} 