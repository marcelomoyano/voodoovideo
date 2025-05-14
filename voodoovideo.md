# Voodoo Video - Fixing macOS Camera & Microphone Permissions

## The Problem

The app was crashing with the following error when trying to access camera or microphone:

```
This app has crashed because it attempted to access privacy-sensitive data without a usage description. The app's Info.plist must contain an NSCameraUsageDescription key with a string value explaining to the user how the app uses this data.
```

This is a common issue in macOS/iOS apps that relates to privacy permissions and how they're defined in the app bundle.

## Root Causes

We identified several issues that were causing the app to crash:

1. **Missing Info.plist Reference**: The Xcode project was set to auto-generate an Info.plist file (`GENERATE_INFOPLIST_FILE = YES`), but our custom Info.plist with the permission descriptions wasn't properly included in the app bundle.

2. **Permission Request Timing**: The app was attempting to access camera/microphone even before permissions were granted.

3. **Project Configuration**: The Info.plist file wasn't properly referenced in the Xcode project file, so it wasn't being included in the final app bundle.

## The Solution: Step by Step

### 1. Project Settings Changes

We made several changes to the Xcode project settings to ensure the Info.plist file is properly included:

- **Added explicit reference to Info.plist** in the project file:
  ```xml
  /* Begin PBXFileReference section */
      9C0FE3172DD468EB00119437 /* voodoovideo.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = voodoovideo.app; sourceTree = BUILT_PRODUCTS_DIR; };
      9C0FE3292DD468EC00119437 /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
  /* End PBXFileReference section */
  ```

- **Added Info.plist to project group**:
  ```xml
  /* Begin PBXFileSystemSynchronizedRootGroup section */
      9C0FE3192DD468EB00119437 /* voodoovideo */ = {
          isa = PBXFileSystemSynchronizedRootGroup;
          children = (
              9C0FE3292DD468EC00119437 /* Info.plist */,
          );
          path = voodoovideo;
          sourceTree = "<group>";
      };
  /* End PBXFileSystemSynchronizedRootGroup section */
  ```

- **Disabled auto-generation of Info.plist** and pointed to our custom file:
  ```xml
  GENERATE_INFOPLIST_FILE = NO;
  INFOPLIST_FILE = voodoovideo/Info.plist;
  ```

- **Added Info.plist to Resources phase** to ensure it gets copied to the app bundle:
  ```xml
  /* Begin PBXResourcesBuildPhase section */
      9C0FE3152DD468EB00119437 /* Resources */ = {
          isa = PBXResourcesBuildPhase;
          buildActionMask = 2147483647;
          files = (
              9C0FE32A2DD468EC00119437 /* Info.plist in Resources */,
          );
          runOnlyForDeploymentPostprocessing = 0;
      };
  /* End PBXResourcesBuildPhase section */
  ```

### 2. Info.plist Configuration

We updated the Info.plist file to include the proper permission keys with clear descriptions:

```xml
<!-- Camera and microphone permissions -->
<key>NSCameraUsageDescription</key>
<string>Voodoo Video needs access to your camera to display video sources.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Voodoo Video needs access to your microphone to use audio sources.</string>
```

We also ensured other required app keys were present:
- Added `NSMainStoryboardFile` key
- Properly configured the app identity keys (bundle ID, etc.)

### 3. Code Changes for Permission Handling

We made several code improvements to ensure permissions are handled safely:

- **Added a splash screen** to guide users through the permission process
- **Separated permission requests** for camera and microphone
- **Added thread safety** by ensuring permission requests run on the main thread:
  ```swift
  @objc private func requestCameraPermission() {
      // Ensure we're on the main thread before requesting permissions
      DispatchQueue.main.async {
          AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
              // Handle response
          }
      }
  }
  ```

- **Added delay after permissions granted** to ensure OS fully processes them:
  ```swift
  // Add a slight delay to ensure OS has fully processed permission changes
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.removeSplashScreen()
      self?.initializeCaptureSession()
  }
  ```

- **Created visual status indicators** to show current permission status

### 4. Permission Flow Redesign

We redesigned the permission flow to follow these steps:

1. First launch: Show splash screen with permission explanations
2. User explicitly requests each permission via buttons
3. Track permission status and update UI accordingly
4. Only initialize camera/mic access when both permissions are granted
5. Gracefully handle permission denials

## Best Practices Learned

1. **Always include explicit usage descriptions** for privacy-sensitive APIs (camera, microphone, location, etc.)

2. **Check permission status before accessing hardware**:
   ```swift
   if AVCaptureDevice.authorizationStatus(for: .video) == .authorized {
       // Safe to access camera
   }
   ```

3. **Request permissions on main thread** and handle responses asynchronously

4. **Add delay after permission changes** as the OS sometimes needs time to register them

5. **Provide clear visual feedback** to users about permission status

6. **Structure permissions as a guided process** rather than overwhelming users with system alerts

## Why This Fix Works

The fix works because it addresses both the technical and user-experience aspects of permissions:

1. **Technical**: Properly including the Info.plist with required permission keys in the app bundle
2. **UX**: Guiding users through permissions with clear explanations
3. **Timing**: Ensuring we only access hardware after permissions are granted
4. **Robustness**: Adding safety delays and thread-safe code

By following these changes, your app now properly requests and handles permissions for camera and microphone access on macOS. 