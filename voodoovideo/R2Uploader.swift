import Foundation
import CryptoKit

class R2Uploader: NSObject {
    private let accountId: String
    private let bucketName: String
    private let accessKeyId: String
    private let secretAccessKey: String
    private let region: String = "auto"
    private let session: URLSession
    private var uploadQueue: DispatchQueue
    private var uploadTasks: [String: URLSessionUploadTask] = [:]
    
    var onUploadProgress: ((String, Double) -> Void)?
    var onUploadComplete: ((String) -> Void)?
    var onUploadError: ((String, Error) -> Void)?
    
    init(accountId: String, bucketName: String, accessKeyId: String, secretAccessKey: String) {
        self.accountId = accountId
        self.bucketName = bucketName
        self.accessKeyId = accessKeyId
        self.secretAccessKey = secretAccessKey
        self.uploadQueue = DispatchQueue(label: "r2.upload.queue", qos: .utility)
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: config)
        
        super.init()
        
        print("📡 R2Uploader: Initialized for bucket: \(bucketName)")
    }
    
    // MARK: - Public Interface
    
    func uploadSegment(_ segmentURL: URL) {
        let filename = segmentURL.lastPathComponent
        
        uploadQueue.async { [weak self] in
            self?.performUpload(fileURL: segmentURL, key: filename, contentType: "video/mp2t")
        }
    }
    
    func uploadPlaylist(_ playlistURL: URL) {
        let filename = playlistURL.lastPathComponent
        
        uploadQueue.async { [weak self] in
            self?.performUpload(fileURL: playlistURL, key: filename, contentType: "application/vnd.apple.mpegurl")
        }
    }
    
    func cancelAllUploads() {
        uploadQueue.async { [weak self] in
            guard let self = self else { return }
            
            for (filename, task) in self.uploadTasks {
                task.cancel()
                print("🚫 R2Uploader: Cancelled upload for \(filename)")
            }
            
            self.uploadTasks.removeAll()
        }
    }
    
    // MARK: - Upload Implementation
    
    private func performUpload(fileURL: URL, key: String, contentType: String) {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            let error = R2Error.fileNotFound(key)
            DispatchQueue.main.async {
                self.onUploadError?(key, error)
            }
            return
        }
        
        do {
            // Get file data
            let fileData = try Data(contentsOf: fileURL)
            
            // Create R2 endpoint URL
            let r2Endpoint = "https://\(accountId).r2.cloudflarestorage.com"
            guard let uploadURL = URL(string: "\(r2Endpoint)/\(bucketName)/\(key)") else {
                throw R2Error.invalidURL
            }
            
            // Create request with AWS Signature V4
            var request = URLRequest(url: uploadURL)
            request.httpMethod = "PUT"
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            request.setValue("\(fileData.count)", forHTTPHeaderField: "Content-Length")
            
            // Add AWS Signature V4 headers
            let signedRequest = try signRequest(request, body: fileData)
            
            print("📤 R2Uploader: Starting upload of \(key) (\(fileData.count) bytes)")
            
            // Create upload task
            let uploadTask = session.uploadTask(with: signedRequest, from: fileData) { [weak self] data, response, error in
                guard let self = self else { return }
                
                // Remove from active tasks
                self.uploadTasks.removeValue(forKey: key)
                
                if let error = error {
                    print("❌ R2Uploader: Upload failed for \(key) - \(error.localizedDescription)")
                    DispatchQueue.main.async {
                        self.onUploadError?(key, error)
                    }
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    let error = R2Error.invalidResponse
                    print("❌ R2Uploader: Invalid response for \(key)")
                    DispatchQueue.main.async {
                        self.onUploadError?(key, error)
                    }
                    return
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    print("✅ R2Uploader: Successfully uploaded \(key)")
                    DispatchQueue.main.async {
                        self.onUploadComplete?(key)
                    }
                } else {
                    let error = R2Error.httpError(httpResponse.statusCode)
                    print("❌ R2Uploader: HTTP error \(httpResponse.statusCode) for \(key)")
                    if let responseData = data, let responseString = String(data: responseData, encoding: .utf8) {
                        print("❌ R2Uploader: Response: \(responseString)")
                    }
                    DispatchQueue.main.async {
                        self.onUploadError?(key, error)
                    }
                }
            }
            
            // Store task for potential cancellation
            uploadTasks[key] = uploadTask
            
            // Start upload
            uploadTask.resume()
            
        } catch {
            print("❌ R2Uploader: Failed to prepare upload for \(key) - \(error)")
            DispatchQueue.main.async {
                self.onUploadError?(key, error)
            }
        }
    }
    
    // MARK: - AWS Signature V4
    
    private func signRequest(_ request: URLRequest, body: Data) throws -> URLRequest {
        var signedRequest = request
        
        let now = Date()
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        dateFormatter.timeZone = TimeZone(identifier: "UTC")
        let amzDate = dateFormatter.string(from: now)
        
        dateFormatter.dateFormat = "yyyyMMdd"
        let dateStamp = dateFormatter.string(from: now)
        
        // Add required headers
        signedRequest.setValue("AWS4-HMAC-SHA256", forHTTPHeaderField: "Authorization")
        signedRequest.setValue(amzDate, forHTTPHeaderField: "X-Amz-Date")
        signedRequest.setValue("\(accessKeyId)/\(dateStamp)/\(region)/s3/aws4_request", forHTTPHeaderField: "X-Amz-Credential")
        
        // For simplicity, using a basic signature approach
        // In production, implement full AWS Signature V4 algorithm
        let auth = "AWS4-HMAC-SHA256 Credential=\(accessKeyId)/\(dateStamp)/\(region)/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=dummy"
        signedRequest.setValue(auth, forHTTPHeaderField: "Authorization")
        
        return signedRequest
    }
}

// MARK: - URLSessionTaskDelegate

extension R2Uploader: URLSessionTaskDelegate {
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

enum R2Error: LocalizedError {
    case fileNotFound(String)
    case invalidURL
    case invalidResponse
    case httpError(Int)
    case signingError(String)
    
    var errorDescription: String? {
        switch self {
        case .fileNotFound(let filename):
            return "File not found: \(filename)"
        case .invalidURL:
            return "Invalid R2 URL"
        case .invalidResponse:
            return "Invalid server response"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .signingError(let message):
            return "Request signing error: \(message)"
        }
    }
}