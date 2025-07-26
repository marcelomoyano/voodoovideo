import SwiftUI
import AVFoundation

/// A SwiftUI representable for displaying a live AVCaptureVideoPreviewLayer.
struct VideoPreviewRepresentable: NSViewRepresentable {
    var videoPreviewManager: VideoPreviewManager
    
    class PreviewView: NSView {
        private var previewLayer: AVCaptureVideoPreviewLayer?

        func setSession(_ session: AVCaptureSession) {
            if let layer = previewLayer {
                layer.removeFromSuperlayer()
            }
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            self.wantsLayer = true
            self.layer?.backgroundColor = NSColor.black.cgColor
            self.layer?.sublayers?.forEach { $0.removeFromSuperlayer() }
            self.layer?.addSublayer(layer)
            layer.frame = bounds
            previewLayer = layer
        }

        override func layout() {
            super.layout()
            previewLayer?.frame = bounds
        }
    }

    func makeNSView(context: Context) -> PreviewView {
        let view = PreviewView()
        context.coordinator.previewView = view
        updatePreview(view)
        NotificationCenter.default.addObserver(context.coordinator,
                                               selector: #selector(Coordinator.sessionUpdated(_:)),
                                               name: NSNotification.Name("captureSessionUpdated"),
                                               object: nil)
        return view
    }

    func updateNSView(_ nsView: PreviewView, context: Context) {
        updatePreview(nsView)
    }
    
    private func updatePreview(_ view: PreviewView) {
        print("📹 VideoPreviewRepresentable: Updating preview - device: \(videoPreviewManager.currentVideoDevice?.localizedName ?? "none"), session running: \(videoPreviewManager.captureSession.isRunning)")
        
        if videoPreviewManager.currentVideoDevice != nil && videoPreviewManager.permissionsGranted {
            view.setSession(videoPreviewManager.captureSession)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(videoPreviewManager: videoPreviewManager)
    }

    class Coordinator: NSObject {
        var videoPreviewManager: VideoPreviewManager
        var previewView: PreviewView?
        
        init(videoPreviewManager: VideoPreviewManager) {
            self.videoPreviewManager = videoPreviewManager
        }
        
        @objc func sessionUpdated(_ note: Notification) {
            print("📹 VideoPreviewRepresentable: Session updated notification received")
            DispatchQueue.main.async { [weak self] in
                guard let self = self, let view = self.previewView else { return }
                view.setSession(self.videoPreviewManager.captureSession)
            }
        }
    }
}
