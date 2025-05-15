import SwiftUI
import AVFoundation

struct ContentView: View {
    @StateObject private var videoManager = VideoManager()
    @State private var isSidebarVisible = true
    
    var body: some View {
        VStack(spacing: 0) {
            // Custom Draggable Title Bar
            HStack {
        
                Spacer()
            }
            .frame(height: 20)
            .background(Color(red: 24/255, green: 25/255, blue: 38/255))
            .contentShape(Rectangle())

            // Content Area
            ZStack(alignment: .leading) {
                VideoPreviewView(videoManager: videoManager)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                if isSidebarVisible {
                    VStack(spacing: 0) {
                        // THE PREVIOUS SIDEBAR HEADER (WITH "Voodoo Pro" AND A TOGGLE) IS REMOVED.
                        // Sidebar content now starts directly with the "Source" and "Capture/Display" toggles.

                        HStack {
                            Text("Source")
                                .padding(.horizontal)
                                .foregroundColor(.white)
                            Spacer()

                            HStack(spacing: 2) {
                                Text("Capture")
                                    .font(.system(size: 12))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Capsule().fill(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.5)))
                                    .foregroundColor(.white)

                                Text("Display")
                                    .font(.system(size: 12))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Capsule().fill(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.5)))
                                    .foregroundColor(.white)
                            }
                            .padding(.trailing, 10)
                        }
                        .padding(.vertical, 8)

                        Divider().background(Color(red: 48/255, green: 50/255, blue: 68/255))
                        
                        ScrollView {
                            VStack(spacing: 0) {
                                Text("Video Device")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                videoSourcePicker
                                videoSettingsPicker

                                Text("Audio Device")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                audioSourcePicker

                                Text("Settings")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                settingsTabs

                                Text("Video Output Quality")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                videoQualitySettings
                            }
                        }

                        Spacer()

                        outputURLField
                        startButton
                    }
                    .frame(width: 350)
                    .background(Color(red: 24/255, green: 25/255, blue: 38/255))
                    .transition(.move(edge: .leading))
                    .zIndex(1)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: 0.2), value: videoManager.isAudioMonitoringEnabled)
        .animation(.easeInOut(duration: 0.25), value: isSidebarVisible)
    }
    
    // Video Source Picker
    private var videoSourcePicker: some View {
        HStack {
            Text("Video")
                .frame(width: 50, alignment: .leading)
                .foregroundColor(.white)
            Picker("", selection: $videoManager.selectedVideoDevice) {
                ForEach(videoManager.videoDevices, id: \.uniqueID) { device in
                    Text(device.localizedName).tag(device.uniqueID)
                }
            }
            .frame(height: 25)
            .labelsHidden()
            Image(systemName: "chevron.down")
                .font(.system(size: 10))
                .padding(.trailing, 8)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 10)
    }
    
    // Video Settings Picker
    private var videoSettingsPicker: some View {
        Group {
            HStack {
                Text("Video Dimensions")
                    .frame(width: 130, alignment: .leading)
                    .foregroundColor(.white)
                Picker("", selection: $videoManager.selectedResolution) {
                    Text("1920x1080").tag("1920x1080")
                    Text("1280x720").tag("1280x720")
                    Text("640x480").tag("640x480")
                }
                .frame(height: 25)
                .labelsHidden()
                Image(systemName: "chevron.down")
                    .font(.system(size: 10))
                    .padding(.trailing, 8)
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
            
            HStack {
                Text("Frame Rate")
                    .frame(width: 130, alignment: .leading)
                    .foregroundColor(.white)
                Picker("", selection: $videoManager.selectedFrameRate) {
                    Text("60").tag(60)
                    Text("30").tag(30)
                    Text("24").tag(24)
                }
                .frame(height: 25)
                .labelsHidden()
                Image(systemName: "chevron.down")
                    .font(.system(size: 10))
                    .padding(.trailing, 8)
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
        }
    }
    
    // Audio Source Picker
    private var audioSourcePicker: some View {
        Group {
            HStack {
                Text("Audio")
                    .frame(width: 50, alignment: .leading)
                    .foregroundColor(.white)
                Picker("", selection: $videoManager.selectedAudioDevice) {
                    ForEach(videoManager.audioDevices, id: \.uniqueID) { device in
                        Text(device.localizedName).tag(device.uniqueID)
                    }
                }
                .frame(height: 25)
                .labelsHidden()
                Image(systemName: "chevron.down")
                    .font(.system(size: 10))
                    .padding(.trailing, 8)
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
            
            // Audio Monitoring Toggle
            HStack {
                Toggle(isOn: $videoManager.isAudioMonitoringEnabled) {
                    Text("Monitor Audio")
                        .frame(width: 130, alignment: .leading)
                        .foregroundColor(.white)
                }
                .toggleStyle(SwitchToggleStyle())
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
            
            // Audio Monitoring Volume Slider
            if videoManager.isAudioMonitoringEnabled {
                HStack {
                    Text("Volume")
                        .frame(width: 50, alignment: .leading)
                        .foregroundColor(.white)
                    Slider(value: $videoManager.audioMonitoringVolume, in: 0...1, step: 0.1)
                    Text("\(Int(videoManager.audioMonitoringVolume * 100))%")
                        .frame(width: 45, alignment: .trailing)
                        .font(.system(size: 12))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
                .transition(.opacity)
            }
        }
    }
    
    // Settings Tabs
    private var settingsTabs: some View {
        HStack(spacing: 0) {
            Button(action: { videoManager.settingsTab = .basic }) {
                Text("Basic")
                    .font(.system(size: 12))
                    .padding(.vertical, 6)
                    .padding(.horizontal, 15)
                    .background(videoManager.settingsTab == .basic ?
                                Color(red: 48/255, green: 50/255, blue: 68/255) : Color.clear)
                    .foregroundColor(.white)
            }
            .buttonStyle(PlainButtonStyle())
            
            Button(action: { videoManager.settingsTab = .advanced }) {
                Text("Advanced")
                    .font(.system(size: 12))
                    .padding(.vertical, 6)
                    .padding(.horizontal, 15)
                    .background(videoManager.settingsTab == .advanced ?
                                Color(red: 48/255, green: 50/255, blue: 68/255) : Color.clear)
                    .foregroundColor(.white)
            }
            .buttonStyle(PlainButtonStyle())
            
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.top, 4)
    }
    
    // Video Quality Settings
    private var videoQualitySettings: some View {
        Group {
            HStack {
                Text("Output Resolution")
                    .frame(width: 130, alignment: .leading)
                    .foregroundColor(.white)
                Picker("", selection: $videoManager.outputResolution) {
                    Text("1080p").tag("1080p")
                    Text("720p").tag("720p")
                    Text("480p").tag("480p")
                }
                .frame(height: 25)
                .labelsHidden()
                Image(systemName: "chevron.down")
                    .font(.system(size: 10))
                    .padding(.trailing, 8)
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
            
            HStack {
                Text("Video Bitrate(mbps)")
                    .frame(width: 130, alignment: .leading)
                    .foregroundColor(.white)
                Picker("", selection: $videoManager.bitrate) {
                    Text("5").tag(5)
                    Text("8").tag(8)
                    Text("10").tag(10)
                }
                .frame(height: 25)
                .labelsHidden()
                Image(systemName: "chevron.down")
                    .font(.system(size: 10))
                    .padding(.trailing, 8)
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
            
            HStack {
                Text("Dynamic Range")
                    .frame(width: 130, alignment: .leading)
                    .foregroundColor(.white)
                
                HStack(spacing: 0) {
                    Button(action: { videoManager.dynamicRange = .sdr }) {
                        Text("SDR")
                            .font(.system(size: 12))
                            .padding(.vertical, 5)
                            .padding(.horizontal, 10)
                            .background(videoManager.dynamicRange == .sdr ?
                                    Color(red: 48/255, green: 50/255, blue: 68/255) : Color.clear)
                            .foregroundColor(.white)
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Button(action: { videoManager.dynamicRange = .hlg }) {
                        Text("HLG")
                            .font(.system(size: 12))
                            .padding(.vertical, 5)
                            .padding(.horizontal, 10)
                            .background(videoManager.dynamicRange == .hlg ?
                                    Color(red: 48/255, green: 50/255, blue: 68/255) : Color.clear)
                            .foregroundColor(.white)
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Button(action: { videoManager.dynamicRange = .pq }) {
                        Text("PQ")
                            .font(.system(size: 12))
                            .padding(.vertical, 5)
                            .padding(.horizontal, 10)
                            .background(videoManager.dynamicRange == .pq ?
                                    Color(red: 48/255, green: 50/255, blue: 68/255) : Color.clear)
                            .foregroundColor(.white)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                )
                
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
        }
    }
    
    // Output URL Field
    private var outputURLField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Output")
                .font(.headline)
                .padding(.horizontal, 10)
                .foregroundColor(.white)
            
            HStack {
                Text("URL")
                    .frame(width: 30, alignment: .leading)
                    .foregroundColor(.white)
                
                TextField("rtmp://", text: $videoManager.outputURL)
                    .textFieldStyle(PlainTextFieldStyle())
                    .padding(4)
                    .background(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.8))
                    .cornerRadius(4)
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
        }
        .padding(.bottom, 10)
    }
    
    // Start Button
    private var startButton: some View {
        Button(action: {
            videoManager.isStreaming.toggle()
        }) {
            HStack {
                Image(systemName: "record.circle")
                    .foregroundColor(.white)
                
                Text(videoManager.isStreaming ? "Stop Stream" : "Start Stream")
                    .foregroundColor(.white)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .background(Color(red: 122/255, green: 162/255, blue: 247/255)) // Tokyo Night Accent
            .cornerRadius(6)
        }
        .buttonStyle(PlainButtonStyle())
        .padding(10)
    }
}

struct VideoPreviewView: View {
    @ObservedObject var videoManager: VideoManager
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Use the representable view for the actual video display
                VideoPreviewRepresentable(videoManager: videoManager)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .background(Color(red: 24/255, green: 25/255, blue: 38/255))
                    .edgesIgnoringSafeArea(.all)
                
                // Show the placeholder only if no device is selected
                if videoManager.currentVideoDevice == nil {
                    VStack {
                        Spacer()
                        Image(systemName: "video.slash")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 60, height: 60)
                            .foregroundColor(.white)
                        Text("No camera selected")
                            .foregroundColor(.gray)
                            .padding(.top, 10)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 0.1, green: 0.1, blue: 0.3))
                }
                
                // Source info overlay
                VStack {
                    HStack {
                        Spacer()
                        if let selectedDevice = videoManager.currentVideoDevice {
                            HStack {
                                Image(systemName: "video.fill")
                                    .foregroundColor(.white)
                                Text(selectedDevice.localizedName)
                                    .foregroundColor(.white)
                                    .font(.system(size: 12))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.black.opacity(0.6))
                            .cornerRadius(4)
                        }
                    }
                    .padding(10)
                    Spacer()
                }
            }
        }
    }
}

class VideoManager: ObservableObject {
    enum SettingsTab {
        case basic, advanced
    }
    
    enum DynamicRange {
        case sdr, hlg, pq
    }
    
    @Published var videoDevices: [AVCaptureDevice] = []
    @Published var audioDevices: [AVCaptureDevice] = []
    @Published var selectedVideoDevice: String = "" {
        didSet {
            print("Video device changed to: \(selectedVideoDevice)")
            objectWillChange.send()
        }
    }
    @Published var selectedAudioDevice: String = "" {
        didSet {
            print("Audio device changed to: \(selectedAudioDevice)")
            objectWillChange.send()
        }
    }
    @Published var selectedResolution: String = "1920x1080"
    @Published var selectedFrameRate: Int = 30
    @Published var outputResolution: String = "1080p"
    @Published var bitrate: Int = 5
    @Published var dynamicRange: DynamicRange = .sdr
    @Published var outputURL: String = "rtmp://104.237.145.49:8890?streamid=publish"
    @Published var isStreaming: Bool = false
    @Published var settingsTab: SettingsTab = .basic
    
    // Audio monitoring properties
    @Published var isAudioMonitoringEnabled: Bool = false
    @Published var audioMonitoringVolume: Double = 1.0
    
    var currentVideoDevice: AVCaptureDevice? {
        videoDevices.first(where: { $0.uniqueID == selectedVideoDevice })
    }
    
    var currentAudioDevice: AVCaptureDevice? {
        audioDevices.first(where: { $0.uniqueID == selectedAudioDevice })
    }
    
    init() {
        // Request permissions first
        requestCameraAndMicrophonePermissions()
    }
    
    func requestCameraAndMicrophonePermissions() {
        // Request camera permissions
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            if granted {
                DispatchQueue.main.async {
                    self?.refreshDevices()
                }
            } else {
                print("Camera permission denied")
            }
        }
        
        // Request microphone permissions
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if !granted {
                print("Microphone permission denied")
            }
        }
    }
    
    func refreshDevices() {
        print("Refreshing devices...")
        
        // Get video devices
        let videoDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .externalUnknown, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        )
        videoDevices = videoDiscoverySession.devices
        print("Found \(videoDevices.count) video devices")
        videoDevices.forEach { device in
            print("- Video device: \(device.localizedName) (ID: \(device.uniqueID))")
        }
        
        // Get audio devices
        let audioDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInMicrophone, .externalUnknown],
            mediaType: .audio,
            position: .unspecified
        )
        audioDevices = audioDiscoverySession.devices
        print("Found \(audioDevices.count) audio devices")
        audioDevices.forEach { device in
            print("- Audio device: \(device.localizedName) (ID: \(device.uniqueID))")
        }
        
        // Set default devices if available
        if let defaultVideo = videoDevices.first, selectedVideoDevice.isEmpty {
            selectedVideoDevice = defaultVideo.uniqueID
            print("Set default video device: \(defaultVideo.localizedName)")
        }
        
        if let defaultAudio = audioDevices.first, selectedAudioDevice.isEmpty {
            selectedAudioDevice = defaultAudio.uniqueID
            print("Set default audio device: \(defaultAudio.localizedName)")
        }
    }
}

#Preview {
    ContentView()
        .frame(width: 900, height: 600)
}
