import Foundation
import CryptoKit

class R2Uploader: NSObject {
    private let r2Endpoint: String
    private let accessKeyId: String
    private let secretAccessKey: String
    private let region: String = "auto"
    private let session: URLSession
    private var uploadQueue: DispatchQueue
    private var uploadTasks: [String: URLSessionUploadTask] = [:]
    
    var onUploadProgress: ((String, Double) -> Void)?
    var onUploadComplete: ((String) -> Void)?
    var onUploadError: ((String, Error) -> Void)?
    
    init(r2Endpoint: String, accessKeyId: String, secretAccessKey: String) {
        self.r2Endpoint = r2Endpoint
        self.accessKeyId = accessKeyId
        self.secretAccessKey = secretAccessKey
        self.uploadQueue = DispatchQueue(label: "r2.upload.queue", qos: .utility)
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: config)
        
        super.init()
        
        print("📡 R2Uploader: Initialized for endpoint: \(r2Endpoint)")
    }
    
    // MARK: - Public Interface
    
    func uploadSegment(_ segmentURL: URL) {
        let filename = segmentURL.lastPathComponent
        print("📁 R2Uploader: uploadSegment called for \(filename)")
        
        uploadQueue.async { [weak self] in
            print("📁 R2Uploader: On upload queue, calling performUpload")
            self?.performUpload(fileURL: segmentURL, key: filename, contentType: "text/plain")
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
        print("🔍 R2Uploader: performUpload called for \(key)")
        print("🔍 R2Uploader: File path: \(fileURL.path)")
        print("🔍 R2Uploader: File exists: \(FileManager.default.fileExists(atPath: fileURL.path))")
        
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            let error = R2Error.fileNotFound(key)
            print("❌ R2Uploader: File not found: \(fileURL.path)")
            DispatchQueue.main.async {
                self.onUploadError?(key, error)
            }
            return
        }
        
        do {
            // Get file data
            let fileData = try Data(contentsOf: fileURL)
            
            // Create R2 upload URL
            guard let uploadURL = URL(string: "\(r2Endpoint)/\(key)") else {
                throw R2Error.invalidURL
            }
            
            // Create request with AWS Signature V4
            var request = URLRequest(url: uploadURL)
            request.httpMethod = "PUT"
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            request.setValue("\(fileData.count)", forHTTPHeaderField: "Content-Length")
            
            // Add AWS Signature V4 headers
            print("🔐 R2Uploader: Signing request for \(key)...")
            let signedRequest = try signRequest(request, body: fileData)
            print("✅ R2Uploader: Request signed successfully")
            
            print("📤 R2Uploader: Starting upload of \(key) (\(fileData.count) bytes)")
            print("📤 R2Uploader: Upload URL: \(uploadURL)")
            print("📤 R2Uploader: Authorization header: \(signedRequest.value(forHTTPHeaderField: "Authorization") ?? "none")")
            
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
        signedRequest.setValue(amzDate, forHTTPHeaderField: "X-Amz-Date")
        signedRequest.setValue("UNSIGNED-PAYLOAD", forHTTPHeaderField: "X-Amz-Content-Sha256")
        
        guard let url = signedRequest.url else {
            throw R2Error.invalidURL
        }
        
        // Create canonical request
        let httpMethod = signedRequest.httpMethod ?? "PUT"
        let canonicalURI = url.path.isEmpty ? "/" : url.path
        let canonicalQueryString = ""
        let host = url.host ?? ""
        
        let canonicalHeaders = "host:\(host)\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:\(amzDate)\n"
        let signedHeaders = "host;x-amz-content-sha256;x-amz-date"
        let payloadHash = "UNSIGNED-PAYLOAD"
        
        let canonicalRequest = "\(httpMethod)\n\(canonicalURI)\n\(canonicalQueryString)\n\(canonicalHeaders)\n\(signedHeaders)\n\(payloadHash)"
        
        // Create string to sign
        let algorithm = "AWS4-HMAC-SHA256"
        let credentialScope = "\(dateStamp)/\(region)/s3/aws4_request"
        let stringToSign = "\(algorithm)\n\(amzDate)\n\(credentialScope)\n\(sha256(canonicalRequest))"
        
        // Calculate signature
        let signature = try calculateSignature(stringToSign: stringToSign, dateStamp: dateStamp)
        
        // Create authorization header
        let authHeader = "\(algorithm) Credential=\(accessKeyId)/\(credentialScope), SignedHeaders=\(signedHeaders), Signature=\(signature)"
        signedRequest.setValue(authHeader, forHTTPHeaderField: "Authorization")
        
        return signedRequest
    }
    
    private func calculateSignature(stringToSign: String, dateStamp: String) throws -> String {
        let kDate = try hmac(key: "AWS4\(secretAccessKey)".data(using: .utf8)!, data: dateStamp.data(using: .utf8)!)
        let kRegion = try hmac(key: kDate, data: region.data(using: .utf8)!)
        let kService = try hmac(key: kRegion, data: "s3".data(using: .utf8)!)
        let kSigning = try hmac(key: kService, data: "aws4_request".data(using: .utf8)!)
        let signature = try hmac(key: kSigning, data: stringToSign.data(using: .utf8)!)
        
        return signature.map { String(format: "%02x", $0) }.joined()
    }
    
    private func hmac(key: Data, data: Data) throws -> Data {
        let hmac = HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key))
        return Data(hmac)
    }
    
    private func sha256(_ string: String) -> String {
        let data = string.data(using: .utf8)!
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
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