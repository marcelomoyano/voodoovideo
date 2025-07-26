import Foundation

class HLSUploader: NSObject {
    private let uploadEndpoint: String
    private let session: URLSession
    private var uploadQueue: DispatchQueue
    private var uploadTasks: [String: URLSessionUploadTask] = [:]
    
    var onUploadProgress: ((String, Double) -> Void)?
    var onUploadComplete: ((String) -> Void)?
    var onUploadError: ((String, Error) -> Void)?
    
    init(uploadEndpoint: String) {
        self.uploadEndpoint = uploadEndpoint
        self.uploadQueue = DispatchQueue(label: "hls.upload.queue", qos: .utility)
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: config)
        
        super.init()
        
        print("📡 HLSUploader: Initialized with endpoint: \(uploadEndpoint)")
    }
    
    // MARK: - Public Interface
    
    func uploadSegment(_ segmentURL: URL) {
        let filename = segmentURL.lastPathComponent
        
        uploadQueue.async { [weak self] in
            self?.performUpload(segmentURL: segmentURL, filename: filename)
        }
    }
    
    func uploadPlaylist(_ playlistURL: URL) {
        let filename = playlistURL.lastPathComponent
        
        uploadQueue.async { [weak self] in
            self?.performUpload(segmentURL: playlistURL, filename: filename)
        }
    }
    
    func cancelAllUploads() {
        uploadQueue.async { [weak self] in
            guard let self = self else { return }
            
            for (filename, task) in self.uploadTasks {
                task.cancel()
                print("🚫 HLSUploader: Cancelled upload for \(filename)")
            }
            
            self.uploadTasks.removeAll()
        }
    }
    
    // MARK: - Upload Implementation
    
    private func performUpload(segmentURL: URL, filename: String) {
        guard FileManager.default.fileExists(atPath: segmentURL.path) else {
            let error = UploadError.fileNotFound(filename)
            DispatchQueue.main.async {
                self.onUploadError?(filename, error)
            }
            return
        }
        
        // Create upload URL
        guard let uploadURL = URL(string: "\(uploadEndpoint)/\(filename)") else {
            let error = UploadError.invalidURL(uploadEndpoint)
            DispatchQueue.main.async {
                self.onUploadError?(filename, error)
            }
            return
        }
        
        // Create request
        var request = URLRequest(url: uploadURL)
        request.httpMethod = "PUT"
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        
        // Get file size for progress tracking
        do {
            let fileAttributes = try FileManager.default.attributesOfItem(atPath: segmentURL.path)
            let fileSize = fileAttributes[.size] as? Int64 ?? 0
            print("📤 HLSUploader: Starting upload of \(filename) (\(fileSize) bytes)")
        } catch {
            print("⚠️ HLSUploader: Could not get file size for \(filename)")
        }
        
        // Create upload task
        let uploadTask = session.uploadTask(with: request, fromFile: segmentURL) { [weak self] data, response, error in
            guard let self = self else { return }
            
            // Remove from active tasks
            self.uploadTasks.removeValue(forKey: filename)
            
            if let error = error {
                print("❌ HLSUploader: Upload failed for \(filename) - \(error.localizedDescription)")
                DispatchQueue.main.async {
                    self.onUploadError?(filename, error)
                }
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                let error = UploadError.invalidResponse
                print("❌ HLSUploader: Invalid response for \(filename)")
                DispatchQueue.main.async {
                    self.onUploadError?(filename, error)
                }
                return
            }
            
            if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                print("✅ HLSUploader: Successfully uploaded \(filename)")
                DispatchQueue.main.async {
                    self.onUploadComplete?(filename)
                }
            } else {
                let error = UploadError.httpError(httpResponse.statusCode)
                print("❌ HLSUploader: HTTP error \(httpResponse.statusCode) for \(filename)")
                DispatchQueue.main.async {
                    self.onUploadError?(filename, error)
                }
            }
        }
        
        // Store task for potential cancellation
        uploadTasks[filename] = uploadTask
        
        // Start upload
        uploadTask.resume()
    }
    
    // MARK: - Retry Logic
    
    func retryFailedUpload(_ segmentURL: URL, maxRetries: Int = 3) {
        uploadQueue.async { [weak self] in
            self?.performRetryUpload(segmentURL: segmentURL, attempt: 1, maxRetries: maxRetries)
        }
    }
    
    private func performRetryUpload(segmentURL: URL, attempt: Int, maxRetries: Int) {
        let filename = segmentURL.lastPathComponent
        
        print("🔄 HLSUploader: Retry attempt \(attempt)/\(maxRetries) for \(filename)")
        
        // Exponential backoff
        let delay = pow(2.0, Double(attempt - 1))
        
        uploadQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.performUpload(segmentURL: segmentURL, filename: filename)
        }
    }
}

// MARK: - URLSessionTaskDelegate

extension HLSUploader: URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        
        // Find filename from task
        let filename = task.originalRequest?.url?.lastPathComponent ?? "unknown"
        let progress = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        
        DispatchQueue.main.async {
            self.onUploadProgress?(filename, progress)
        }
    }
}

// MARK: - Error Types

enum UploadError: LocalizedError {
    case fileNotFound(String)
    case invalidURL(String)
    case invalidResponse
    case httpError(Int)
    
    var errorDescription: String? {
        switch self {
        case .fileNotFound(let filename):
            return "File not found: \(filename)"
        case .invalidURL(let url):
            return "Invalid upload URL: \(url)"
        case .invalidResponse:
            return "Invalid server response"
        case .httpError(let code):
            return "HTTP error: \(code)"
        }
    }
}