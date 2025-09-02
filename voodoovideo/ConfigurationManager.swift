import Foundation

class ConfigurationManager: ObservableObject {
    private let userDefaults = UserDefaults.standard
    
    // MARK: - Ably Configuration
    private let ablyKeyKey = "AblyAPIKey"
    private let defaultRoomKey = "DefaultRoom"
    
    var ablyAPIKey: String {
        get {
            return userDefaults.string(forKey: ablyKeyKey) ?? ""
        }
        set {
            userDefaults.set(newValue, forKey: ablyKeyKey)
        }
    }
    
    var defaultRoom: String {
        get {
            return userDefaults.string(forKey: defaultRoomKey) ?? ""
        }
        set {
            userDefaults.set(newValue, forKey: defaultRoomKey)
        }
    }
    
    // MARK: - R2 Configuration
    private let r2AccessKeyKey = "R2AccessKey"
    private let r2SecretKeyKey = "R2SecretKey"
    private let r2EndpointKey = "R2Endpoint"
    
    var r2AccessKey: String {
        get {
            return userDefaults.string(forKey: r2AccessKeyKey) ?? ""
        }
        set {
            userDefaults.set(newValue, forKey: r2AccessKeyKey)
        }
    }
    
    var r2SecretKey: String {
        get {
            return userDefaults.string(forKey: r2SecretKeyKey) ?? ""
        }
        set {
            userDefaults.set(newValue, forKey: r2SecretKeyKey)
        }
    }
    
    var r2Endpoint: String {
        get {
            return userDefaults.string(forKey: r2EndpointKey) ?? "https://e561d71f6685e1ddd58b290d834f940e.r2.cloudflarestorage.com/vod"
        }
        set {
            userDefaults.set(newValue, forKey: r2EndpointKey)
        }
    }
    
    // MARK: - Device Configuration
    var participantId: String {
        // Generate a unique participant ID based on system info
        let deviceName = ProcessInfo.processInfo.hostName
        let uuid = UUID().uuidString.prefix(8)
        return "\(deviceName)-\(uuid)"
    }
    
    // MARK: - Initialization
    init() {
        // Set default credentials if not already set (for migration from hardcoded values)
        if ablyAPIKey.isEmpty {
            ablyAPIKey = "8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs"
        }
        if r2AccessKey.isEmpty {
            r2AccessKey = "e12d70affefd4d92da66c362013a6149"
        }
        if r2SecretKey.isEmpty {
            r2SecretKey = "cf72cea58cc8e1dc37e6723fbb825451d7864d97857dd36c3b643bc3a50b5e24"
        }
    }
    
    // MARK: - Validation
    var hasValidAblyConfig: Bool {
        return !ablyAPIKey.isEmpty
    }
    
    var hasValidR2Config: Bool {
        return !r2AccessKey.isEmpty && !r2SecretKey.isEmpty && !r2Endpoint.isEmpty
    }
}