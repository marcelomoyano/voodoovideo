import SwiftUI
import AVFoundation

struct ContentView: View {
    @StateObject private var videoManager = VideoManager()
    @StateObject private var videoPreviewManager = VideoPreviewManager()
    @StateObject private var ablyManager = AblyManager()
    @State private var isSidebarVisible = true
    @State private var testR2Uploader: R2Uploader?
    @State private var room: String = ""
    @State private var participantId: String = ""
    
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
                VideoPreviewView(videoManager: videoManager, videoPreviewManager: videoPreviewManager)
                    .frame(maxWidth: CGFloat.infinity, maxHeight: CGFloat.infinity)
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isSidebarVisible = false
                        }
                    }
                
                // Burger menu button when sidebar is hidden
                if !isSidebarVisible {
                    VStack {
                        HStack {
                            Button(action: {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    isSidebarVisible = true
                                }
                            }) {
                                Image(systemName: "line.horizontal.3")
                                    .font(.system(size: 20))
                                    .foregroundColor(.white)
                                    .padding(12)
                                    .background(Color.black.opacity(0.6))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(PlainButtonStyle())
                            .padding(.leading, 16)
                            .padding(.top, 16)
                            Spacer()
                        }
                        Spacer()
                    }
                    .transition(.opacity)
                    .zIndex(2)
                }

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
                                // Ably Connection Section
                                Text("Remote Control")
                                    .font(.headline)
                                    .frame(maxWidth: CGFloat.infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                ablyConnectionSection
                                
                                // Permissions Section
                                Text("Permissions")
                                    .font(.headline)
                                    .frame(maxWidth: CGFloat.infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                permissionsSection
                                
                                Text("Video Device")
                                    .font(.headline)
                                    .frame(maxWidth: CGFloat.infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                videoSourcePicker
                                videoSettingsPicker

                                Text("Audio Device")
                                    .font(.headline)
                                    .frame(maxWidth: CGFloat.infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                audioSourcePicker

                                Text("Settings")
                                    .font(.headline)
                                    .frame(maxWidth: CGFloat.infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                settingsTabs

                                Text("Video Output Quality")
                                    .font(.headline)
                                    .frame(maxWidth: CGFloat.infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.top, 15)
                                    .padding(.bottom, 5)
                                    .foregroundColor(.white)

                                videoQualitySettings
                            }
                        }

                        Spacer()

                        recordingControls
                    }
                    .frame(width: 350)
                    .background(Color(red: 24/255, green: 25/255, blue: 38/255))
                    .transition(.move(edge: .leading))
                    .zIndex(1)
                }
            }
        }
        .frame(maxWidth: CGFloat.infinity, maxHeight: CGFloat.infinity)
        .animation(.easeInOut(duration: 0.2), value: videoManager.isAudioMonitoringEnabled)
        .animation(.easeInOut(duration: 0.25), value: isSidebarVisible)
        .onReceive(videoManager.$selectedVideoDevice) { deviceID in
            videoPreviewManager.selectedVideoDevice = deviceID
        }
        .onReceive(videoManager.$selectedAudioDevice) { deviceID in
            videoPreviewManager.selectedAudioDevice = deviceID
        }
        .onReceive(videoManager.$isAudioMonitoringEnabled) { enabled in
            videoPreviewManager.setAudioMonitoring(enabled: enabled)
        }
        .onReceive(videoManager.$audioMonitoringVolume) { volume in
            videoPreviewManager.setAudioMonitoringVolume(volume)
        }
        .onReceive(videoPreviewManager.$overallUploadProgress) { progress in
            // Send upload progress via Ably
            if ablyManager.isConnected {
                ablyManager.sendRecordingProgress(
                    completedUploads: videoPreviewManager.completedUploads.count,
                    totalSegments: videoPreviewManager.totalSegmentCount,
                    progress: progress
                )
            }
        }
        .onAppear {
            // Check permissions when the view appears
            videoPreviewManager.checkPermissions()
            if videoPreviewManager.permissionsGranted {
                videoPreviewManager.startPreview()
            }
        }
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
    
    // Recording Controls
    private var recordingControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recording")
                .font(.headline)
                .padding(.horizontal, 10)
                .foregroundColor(.white)
            
            // Recording Status
            HStack {
                Circle()
                    .fill(videoPreviewManager.isRecording ? Color.red : Color.gray)
                    .frame(width: 8, height: 8)
                
                Text(videoPreviewManager.isRecording ? "RECORDING" : "READY")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(videoPreviewManager.isRecording ? .red : .gray)
                
                Spacer()
                
                if videoPreviewManager.isRecording {
                    Text(formatDuration(videoPreviewManager.recordingDuration))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.white)
                }
            }
            .padding(.horizontal, 10)
            
            // R2 Upload Configuration
            VStack(alignment: .leading, spacing: 4) {
                Text("R2 Upload (Optional)")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .padding(.horizontal, 10)
                
                TextField("R2 Access Key", text: $videoManager.r2AccessKey)
                    .textFieldStyle(PlainTextFieldStyle())
                    .padding(6)
                    .background(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.8))
                    .cornerRadius(4)
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                
                SecureField("R2 Secret Key", text: $videoManager.r2SecretKey)
                    .textFieldStyle(PlainTextFieldStyle())
                    .padding(6)
                    .background(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.8))
                    .cornerRadius(4)
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.top, 4)
                
                // R2 Upload Status Indicator
                if !videoManager.r2AccessKey.isEmpty && !videoManager.r2SecretKey.isEmpty {
                    HStack {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                        Text("R2 Upload Ready")
                            .font(.caption)
                            .foregroundColor(.green)
                        Spacer()
                    }
                    .padding(.horizontal, 10)
                    .padding(.top, 2)
                }
            }
            
            // R2 Test Button
            Button(action: {
                testR2Upload()
            }) {
                Text("Test R2 Upload")
                    .foregroundColor(.white)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .background(Color.blue)
                    .cornerRadius(4)
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, 10)
            .padding(.top, 4)
            
            // Upload Progress Display
            if videoPreviewManager.isRecording && (!videoManager.r2AccessKey.isEmpty && !videoManager.r2SecretKey.isEmpty) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Upload Progress")
                            .font(.caption)
                            .foregroundColor(.gray)
                        
                        Spacer()
                        
                        Text("\(Int(videoPreviewManager.overallUploadProgress * 100))%")
                            .font(.caption)
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 10)
                    
                    ProgressView(value: videoPreviewManager.overallUploadProgress)
                        .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                        .padding(.horizontal, 10)
                    
                    Text("\(videoPreviewManager.completedUploads.filter { !$0.contains(".m3u8") }.count)/\(videoPreviewManager.totalSegmentCount) segments uploaded")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .padding(.horizontal, 10)
                }
                .padding(.top, 4)
            }
            
            // Record Button
            Button(action: {
                if videoPreviewManager.isRecording {
                    videoPreviewManager.stopRecording()
                    // Update Ably status when manually stopping
                    if ablyManager.isConnected {
                        ablyManager.updateStreamStatus("stopped")
                    }
                } else {
                    let r2AccessKey = videoManager.r2AccessKey.isEmpty ? nil : videoManager.r2AccessKey
                    let r2SecretKey = videoManager.r2SecretKey.isEmpty ? nil : videoManager.r2SecretKey
                    
                    // Update Ably status when manually starting
                    if ablyManager.isConnected {
                        ablyManager.updateStreamStatus("recording")
                    }
                    
                    _ = videoPreviewManager.startRecording(
                        uploadEndpoint: nil,
                        resolution: videoManager.outputResolution,
                        frameRate: videoManager.selectedFrameRate,
                        bitrate: videoManager.bitrate,
                        dynamicRange: videoManager.dynamicRange,
                        r2AccessKey: r2AccessKey,
                        r2SecretKey: r2SecretKey,
                        room: ablyManager.currentRoom,
                        participantId: ablyManager.participantId
                    )
                }
            }) {
                HStack {
                    Image(systemName: videoPreviewManager.isRecording ? "stop.circle.fill" : "record.circle")
                        .foregroundColor(.white)
                    
                    Text(videoPreviewManager.isRecording ? "Stop Recording" : "Start Recording")
                        .foregroundColor(.white)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .frame(maxWidth: CGFloat.infinity)
                .background(videoPreviewManager.isRecording ? Color.red : Color(red: 122/255, green: 162/255, blue: 247/255))
                .cornerRadius(6)
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, 10)
            .disabled(!videoPreviewManager.permissionsGranted && !videoPreviewManager.isRecording)
            .opacity((!videoPreviewManager.permissionsGranted && !videoPreviewManager.isRecording) ? 0.5 : 1.0)
            
            // Recording Info
            VStack(alignment: .leading, spacing: 4) {
                Text("• Local: HEVC \(videoManager.outputResolution) \(videoManager.selectedFrameRate)fps \(videoManager.bitrate)Mbps")
                    .font(.caption)
                    .foregroundColor(.gray)
                
                Text("• HLS: H.264 segments for R2 upload")
                    .font(.caption)
                    .foregroundColor(.gray)
                
                Text("• Files saved to Documents folder")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .padding(.horizontal, 10)
        }
        .padding(.bottom, 10)
    }
    
    // Permissions Section
    private var permissionsSection: some View {
        VStack(spacing: 8) {
            // Camera Permission
            HStack {
                Circle()
                    .fill(videoPreviewManager.cameraPermissionStatus == .authorized ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                
                Text("Camera")
                    .frame(width: 60, alignment: .leading)
                    .foregroundColor(.white)
                
                Text(videoPreviewManager.cameraPermissionStatus.description)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                if videoPreviewManager.cameraPermissionStatus != .authorized {
                    Button("Grant") {
                        videoPreviewManager.requestCameraPermission()
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(4)
                    .font(.caption)
                }
            }
            .padding(.horizontal, 10)
            
            // Microphone Permission
            HStack {
                Circle()
                    .fill(videoPreviewManager.microphonePermissionStatus == .authorized ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                
                Text("Audio")
                    .frame(width: 60, alignment: .leading)
                    .foregroundColor(.white)
                
                Text(videoPreviewManager.microphonePermissionStatus.description)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                if videoPreviewManager.microphonePermissionStatus != .authorized {
                    Button("Grant") {
                        videoPreviewManager.requestMicrophonePermission()
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(4)
                    .font(.caption)
                }
            }
            .padding(.horizontal, 10)
            
            // Overall status
            if videoPreviewManager.permissionsGranted {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("All permissions granted")
                        .font(.caption)
                        .foregroundColor(.green)
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
            } else {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                    Text("Camera and microphone access required")
                        .font(.caption)
                        .foregroundColor(.orange)
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
            }
        }
        .padding(.bottom, 8)
    }
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60
        let seconds = Int(duration) % 60
        
        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d", minutes, seconds)
        }
    }
    
    private func testR2Upload() {
        print("🧪 ContentView: Testing R2 upload...")
        
        // Create test data
        let testData = "Hello from VoodooVideo R2 test!".data(using: .utf8)!
        let tempURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("r2_test.txt")
        
        do {
            try testData.write(to: tempURL)
            print("✅ R2 Test: Created test file at \(tempURL.path)")
            
            // Initialize R2 uploader with your credentials and store reference
            testR2Uploader = R2Uploader(
                r2Endpoint: "https://e561d71f6685e1ddd58b290d834f940e.r2.cloudflarestorage.com/vod",
                accessKeyId: "e12d70affefd4d92da66c362013a6149",
                secretAccessKey: "cf72cea58cc8e1dc37e6723fbb825451d7864d97857dd36c3b643bc3a50b5e24",
                room: ablyManager.currentRoom ?? "test",
                participantId: ablyManager.participantId ?? "test-recorder"
            )
            
            testR2Uploader?.onUploadComplete = { filename in
                print("✅ R2 Test: Successfully uploaded \(filename)")
            }
            
            testR2Uploader?.onUploadError = { filename, error in
                print("❌ R2 Test: Failed to upload \(filename) - \(error.localizedDescription)")
            }
            
            testR2Uploader?.onUploadProgress = { filename, progress in
                print("📤 R2 Test: Upload progress for \(filename): \(Int(progress * 100))%")
            }
            
            // Start upload
            print("🚀 R2 Test: Starting upload...")
            testR2Uploader?.uploadSegment(tempURL)
            print("📤 R2 Test: Upload request submitted")
            
        } catch {
            print("❌ R2 Test: Failed to create test file - \(error)")
        }
    }
    
    // Ably Connection Section
    private var ablyConnectionSection: some View {
        VStack(spacing: 8) {
            // Connection Status
            HStack {
                Circle()
                    .fill(ablyManager.isConnected ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                
                Text(ablyManager.connectionStatus)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 10)
            
            // Room Input
            HStack {
                Text("Room")
                    .frame(width: 60, alignment: .leading)
                    .foregroundColor(.white)
                
                TextField("Enter room name", text: $room)
                    .textFieldStyle(PlainTextFieldStyle())
                    .padding(6)
                    .background(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.8))
                    .cornerRadius(4)
                    .foregroundColor(.white)
                    .disabled(ablyManager.isConnected)
            }
            .padding(.horizontal, 10)
            
            // Participant ID Input
            HStack {
                Text("ID")
                    .frame(width: 60, alignment: .leading)
                    .foregroundColor(.white)
                
                TextField("Enter your ID", text: $participantId)
                    .textFieldStyle(PlainTextFieldStyle())
                    .padding(6)
                    .background(Color(red: 48/255, green: 50/255, blue: 68/255).opacity(0.8))
                    .cornerRadius(4)
                    .foregroundColor(.white)
                    .disabled(ablyManager.isConnected)
            }
            .padding(.horizontal, 10)
            
            // Connect/Disconnect Button
            Button(action: {
                if ablyManager.isConnected {
                    ablyManager.disconnect()
                } else if !room.isEmpty && !participantId.isEmpty {
                    connectToAbly()
                }
            }) {
                Text(ablyManager.isConnected ? "Disconnect" : "Connect")
                    .foregroundColor(.white)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity)
                    .background(ablyManager.isConnected ? Color.red : Color.blue)
                    .cornerRadius(4)
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, 10)
            .disabled(!ablyManager.isConnected && (room.isEmpty || participantId.isEmpty))
            .opacity((!ablyManager.isConnected && (room.isEmpty || participantId.isEmpty)) ? 0.5 : 1.0)
            
            // Current Room Display
            if ablyManager.isConnected, let currentRoom = ablyManager.currentRoom {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Connected to: \(currentRoom)")
                        .font(.caption)
                        .foregroundColor(.green)
                    Text("as: \(ablyManager.participantId ?? "")")
                        .font(.caption)
                        .foregroundColor(.green)
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
            }
        }
        .padding(.bottom, 8)
    }
    
    private func connectToAbly() {
        ablyManager.connect(to: room, as: participantId)
        
        // Set up callbacks
        ablyManager.onStartRecording = {
            if !videoPreviewManager.isRecording {
                startRecordingWithAbly()
            }
        }
        
        ablyManager.onStopRecording = {
            if videoPreviewManager.isRecording {
                videoPreviewManager.stopRecording()
            }
        }
        
        ablyManager.onForceEndSession = { reason in
            print("⚠️ Session ended by producer: \(reason)")
            if videoPreviewManager.isRecording {
                videoPreviewManager.stopRecording()
            }
        }
    }
    
    private func startRecordingWithAbly() {
        let r2AccessKey = videoManager.r2AccessKey.isEmpty ? nil : videoManager.r2AccessKey
        let r2SecretKey = videoManager.r2SecretKey.isEmpty ? nil : videoManager.r2SecretKey
        
        // Update status to "recording" via Ably
        ablyManager.updateStreamStatus("recording")
        
        _ = videoPreviewManager.startRecording(
            uploadEndpoint: nil,
            resolution: videoManager.outputResolution,
            frameRate: videoManager.selectedFrameRate,
            bitrate: videoManager.bitrate,
            dynamicRange: videoManager.dynamicRange,
            r2AccessKey: r2AccessKey,
            r2SecretKey: r2SecretKey,
            room: ablyManager.currentRoom,
            participantId: ablyManager.participantId
        )
    }
}

struct VideoPreviewView: View {
    @ObservedObject var videoManager: VideoManager
    @ObservedObject var videoPreviewManager: VideoPreviewManager
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Use the representable view for the actual video display
                VideoPreviewRepresentable(videoPreviewManager: videoPreviewManager)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .background(Color(red: 24/255, green: 25/255, blue: 38/255))
                    .ignoresSafeArea()
                    .id(videoPreviewManager.selectedVideoDevice) // Force update when device changes
                
                // Show the placeholder only if no device is selected
                if videoPreviewManager.currentVideoDevice == nil {
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
                    .frame(maxWidth: CGFloat.infinity, maxHeight: CGFloat.infinity)
                    .background(Color(red: 0.1, green: 0.1, blue: 0.3))
                }
                
                // Source info overlay
                VStack {
                    HStack {
                        Spacer()
                        if let selectedDevice = videoPreviewManager.currentVideoDevice {
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
    @Published var r2AccessKey: String = "e12d70affefd4d92da66c362013a6149"
    @Published var r2SecretKey: String = "cf72cea58cc8e1dc37e6723fbb825451d7864d97857dd36c3b643bc3a50b5e24"
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
        
        // Get video devices - include more device types for capture cards
        let videoDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external, .deskViewCamera, .continuityCamera],
            mediaType: .video,
            position: .unspecified
        )
        videoDevices = videoDiscoverySession.devices
        print("Found \(videoDevices.count) video devices")
        videoDevices.forEach { device in
            print("- Video device: \(device.localizedName) (ID: \(device.uniqueID))")
            print("  - Device type: \(device.deviceType)")
            print("  - Model ID: \(device.modelID)")
            print("  - Manufacturer: \(device.manufacturer)")
            
            // Check supported formats
            let formats = device.formats
            print("  - Supported formats: \(formats.count)")
            formats.prefix(3).forEach { format in
                let desc = format.formatDescription
                let dimensions = CMVideoFormatDescriptionGetDimensions(desc)
                print("    - \(dimensions.width)x\(dimensions.height)")
            }
        }
        
        // Get audio devices
        let audioDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
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
