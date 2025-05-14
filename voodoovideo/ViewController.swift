//
//  ViewController.swift
//  voodoovideo
//
//  Created by Marcelo Moyano on 5/14/25.
//

import Cocoa
import AVFoundation

class ViewController: NSViewController {
    
    // MARK: - Properties
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var videoDeviceInput: AVCaptureDeviceInput?
    private var audioDeviceInput: AVCaptureDeviceInput?
    
    // MARK: - IBOutlets
    @IBOutlet weak var videoSourcePopUp: NSPopUpButton!
    @IBOutlet weak var audioSourcePopUp: NSPopUpButton!
    @IBOutlet weak var previewView: NSView!
    
    // Splash screen elements
    private var splashView: NSView?
    private var permissionsGranted = false
    
    // Video devices and audio devices
    private var videoDevices: [AVCaptureDevice] = []
    private var audioDevices: [AVCaptureDevice] = []
    
    // MARK: - View Lifecycle
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Set up UI elements first
        setupUIElements()
        
        // Check permissions and show splash if needed
        checkPermissionsAndShowSplash()
    }
    
    override func viewDidAppear() {
        super.viewDidAppear()
        if permissionsGranted {
            startCaptureSession()
        }
    }
    
    override func viewWillDisappear() {
        super.viewWillDisappear()
        stopCaptureSession()
    }
    
    // MARK: - Permission Handling
    private func checkPermissionsAndShowSplash() {
        let cameraAuthStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let micAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        
        if cameraAuthStatus == .authorized && micAuthStatus == .authorized {
            // Permissions already granted
            permissionsGranted = true
            initializeCaptureSession()
        } else {
            // Show splash screen
            showSplashScreen()
        }
    }
    
    private func showSplashScreen() {
        // Create splash view
        splashView = NSView(frame: view.bounds)
        guard let splashView = splashView else { return }
        
        // Set background
        splashView.wantsLayer = true
        splashView.layer?.backgroundColor = NSColor(calibratedWhite: 0.0, alpha: 0.7).cgColor
        
        // Welcome panel
        let welcomePanel = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 300))
        welcomePanel.wantsLayer = true
        welcomePanel.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        welcomePanel.layer?.cornerRadius = 10.0
        welcomePanel.frame.origin = CGPoint(
            x: (view.bounds.width - welcomePanel.frame.width) / 2,
            y: (view.bounds.height - welcomePanel.frame.height) / 2
        )
        
        // Title
        let titleLabel = NSTextField(labelWithString: "Welcome to Voodoo Video")
        titleLabel.font = NSFont.boldSystemFont(ofSize: 18)
        titleLabel.alignment = .center
        titleLabel.frame = NSRect(x: 20, y: 250, width: 360, height: 30)
        
        // Description
        let descLabel = NSTextField(wrappingLabelWithString: "This app needs access to your camera and microphone to display video and audio sources. Please grant permissions to continue.")
        descLabel.frame = NSRect(x: 20, y: 170, width: 360, height: 70)
        descLabel.alignment = .center
        
        // Camera permission button
        let cameraButton = NSButton(title: "Grant Camera Permission", target: self, action: #selector(requestCameraPermission))
        cameraButton.bezelStyle = .rounded
        cameraButton.frame = NSRect(x: 100, y: 120, width: 200, height: 32)
        
        // Microphone permission button
        let micButton = NSButton(title: "Grant Microphone Permission", target: self, action: #selector(requestMicrophonePermission))
        micButton.bezelStyle = .rounded
        micButton.frame = NSRect(x: 100, y: 70, width: 200, height: 32)
        
        // Status indicators
        let cameraStatus = NSTextField(labelWithString: "Camera: Not Authorized")
        cameraStatus.frame = NSRect(x: 20, y: 30, width: 180, height: 20)
        cameraStatus.font = NSFont.systemFont(ofSize: 12)
        cameraStatus.identifier = NSUserInterfaceItemIdentifier("cameraStatus")
        
        let micStatus = NSTextField(labelWithString: "Microphone: Not Authorized")
        micStatus.frame = NSRect(x: 200, y: 30, width: 180, height: 20)
        micStatus.font = NSFont.systemFont(ofSize: 12)
        micStatus.identifier = NSUserInterfaceItemIdentifier("micStatus")
        
        // Add elements to welcome panel
        welcomePanel.addSubview(titleLabel)
        welcomePanel.addSubview(descLabel)
        welcomePanel.addSubview(cameraButton)
        welcomePanel.addSubview(micButton)
        welcomePanel.addSubview(cameraStatus)
        welcomePanel.addSubview(micStatus)
        
        // Add welcome panel to splash view
        splashView.addSubview(welcomePanel)
        
        // Add splash view to main view
        view.addSubview(splashView)
        
        // Update permission status initially
        updatePermissionStatus()
    }
    
    @objc private func requestCameraPermission() {
        // Ensure we're on the main thread before requesting permissions
        DispatchQueue.main.async {
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.updatePermissionStatus()
                    if granted {
                        self?.checkIfAllPermissionsGranted()
                    }
                }
            }
        }
    }
    
    @objc private func requestMicrophonePermission() {
        // Ensure we're on the main thread before requesting permissions
        DispatchQueue.main.async {
            AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.updatePermissionStatus()
                    if granted {
                        self?.checkIfAllPermissionsGranted()
                    }
                }
            }
        }
    }
    
    private func updatePermissionStatus() {
        // Update the status indicators
        guard let splashView = splashView else { return }
        
        let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        
        for subview in splashView.subviews {
            for innerView in subview.subviews {
                if let textField = innerView as? NSTextField {
                    if textField.identifier?.rawValue == "cameraStatus" {
                        textField.stringValue = "Camera: \(authStatusString(cameraStatus))"
                        textField.textColor = authStatusColor(cameraStatus)
                    } else if textField.identifier?.rawValue == "micStatus" {
                        textField.stringValue = "Microphone: \(authStatusString(micStatus))"
                        textField.textColor = authStatusColor(micStatus)
                    }
                }
            }
        }
    }
    
    private func authStatusString(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "Authorized"
        case .denied: return "Denied"
        case .notDetermined: return "Not Determined"
        case .restricted: return "Restricted"
        @unknown default: return "Unknown"
        }
    }
    
    private func authStatusColor(_ status: AVAuthorizationStatus) -> NSColor {
        switch status {
        case .authorized: return .systemGreen
        case .denied: return .systemRed
        case .notDetermined, .restricted: return .systemOrange
        @unknown default: return .systemGray
        }
    }
    
    private func checkIfAllPermissionsGranted() {
        let cameraAuthorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let micAuthorized = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        
        if cameraAuthorized && micAuthorized {
            permissionsGranted = true
            
            // Add a slight delay to ensure OS has fully processed permission changes
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.removeSplashScreen()
                self?.initializeCaptureSession()
            }
        }
    }
    
    private func removeSplashScreen() {
        NSView.animate(withDuration: 0.3, animations: {
            self.splashView?.alphaValue = 0
        }) { _ in
            self.splashView?.removeFromSuperview()
            self.splashView = nil
        }
    }
    
    private func initializeCaptureSession() {
        setupCaptureSession()
        populateVideoSources()
        populateAudioSources()
        startCaptureSession()
    }
    
    // MARK: - Setup Methods
    private func setupUIElements() {
        // Make sure UI elements are initialized but don't start the capture yet
        previewView.wantsLayer = true
    }
    
    private func setupCaptureSession() {
        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .high
        
        // Create and add preview layer
        if let captureSession = captureSession {
            previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
            previewLayer?.videoGravity = .resizeAspect
            
            if let previewLayer = previewLayer {
                previewView.layer = CALayer()
                previewView.wantsLayer = true
                previewLayer.frame = previewView.bounds
                previewView.layer?.addSublayer(previewLayer)
            }
        }
    }
    
    private func populateVideoSources() {
        videoSourcePopUp.removeAllItems()
        
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .externalUnknown],
            mediaType: .video,
            position: .unspecified
        )
        videoDevices = discoverySession.devices
        
        for device in videoDevices {
            videoSourcePopUp.addItem(withTitle: device.localizedName)
        }
        
        if !videoDevices.isEmpty {
            videoSourcePopUp.selectItem(at: 0)
            selectVideoSource(0)
        }
    }
    
    private func populateAudioSources() {
        audioSourcePopUp.removeAllItems()
        
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInMicrophone, .externalUnknown],
            mediaType: .audio,
            position: .unspecified
        )
        audioDevices = discoverySession.devices
        
        for device in audioDevices {
            audioSourcePopUp.addItem(withTitle: device.localizedName)
        }
        
        if !audioDevices.isEmpty {
            audioSourcePopUp.selectItem(at: 0)
            selectAudioSource(0)
        }
    }
    
    private func selectVideoSource(_ index: Int) {
        guard index >= 0 && index < videoDevices.count else { return }
        guard let captureSession = captureSession else { return }
        
        captureSession.beginConfiguration()
        
        // Remove existing input if any
        if let currentInput = videoDeviceInput {
            captureSession.removeInput(currentInput)
            self.videoDeviceInput = nil
        }
        
        // Add new input
        do {
            let selectedDevice = videoDevices[index]
            let newVideoInput = try AVCaptureDeviceInput(device: selectedDevice)
            
            if captureSession.canAddInput(newVideoInput) {
                captureSession.addInput(newVideoInput)
                self.videoDeviceInput = newVideoInput
            }
        } catch {
            print("Error setting up video device: \(error)")
        }
        
        captureSession.commitConfiguration()
    }
    
    private func selectAudioSource(_ index: Int) {
        guard index >= 0 && index < audioDevices.count else { return }
        guard let captureSession = captureSession else { return }
        
        captureSession.beginConfiguration()
        
        // Remove existing input if any
        if let currentInput = audioDeviceInput {
            captureSession.removeInput(currentInput)
            self.audioDeviceInput = nil
        }
        
        // Add new input
        do {
            let selectedDevice = audioDevices[index]
            let newAudioInput = try AVCaptureDeviceInput(device: selectedDevice)
            
            if captureSession.canAddInput(newAudioInput) {
                captureSession.addInput(newAudioInput)
                self.audioDeviceInput = newAudioInput
            }
        } catch {
            print("Error setting up audio device: \(error)")
        }
        
        captureSession.commitConfiguration()
    }
    
    private func startCaptureSession() {
        if captureSession?.isRunning == false {
            DispatchQueue.global(qos: .userInitiated).async {
                self.captureSession?.startRunning()
            }
        }
    }
    
    private func stopCaptureSession() {
        if captureSession?.isRunning == true {
            captureSession?.stopRunning()
        }
    }
    
    // MARK: - IBActions
    @IBAction func videoSourceChanged(_ sender: NSPopUpButton) {
        selectVideoSource(sender.indexOfSelectedItem)
    }
    
    @IBAction func audioSourceChanged(_ sender: NSPopUpButton) {
        selectAudioSource(sender.indexOfSelectedItem)
    }
    
    override func viewDidLayout() {
        super.viewDidLayout()
        previewLayer?.frame = previewView.bounds
        
        // Update splash view if needed
        if let splashView = splashView {
            splashView.frame = view.bounds
            
            // Update welcome panel position
            if let welcomePanel = splashView.subviews.first {
                welcomePanel.frame.origin = CGPoint(
                    x: (view.bounds.width - welcomePanel.frame.width) / 2,
                    y: (view.bounds.height - welcomePanel.frame.height) / 2
                )
            }
        }
    }
}

// MARK: - Extensions
extension NSView {
    static func animate(withDuration duration: TimeInterval, animations: @escaping () -> Void, completion: ((Bool) -> Void)? = nil) {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = duration
            context.allowsImplicitAnimation = true
            animations()
        }, completionHandler: {
            completion?(true)
        })
    }
}


