/**
 * Device Manager - Handles device enumeration and selection
 */

// Helper function to identify preferred audio and video devices
function findPreferredDevice(devices, kind) {
    const preferenceOrder = [
        'VoodooCaster',
        'Virtual',
        'Aggregate',
        'NDI',
        'Elgato',
        'OBS',
        'Studio',
        'Pro',
        'Ultra',
        'High',
        'External',
        'USB'  // Added USB as many pro audio devices are USB
    ];
    
    // First, check if the last used device is still available
    const lastUsedId = localStorage.getItem(`last_working_${kind}`);
    if (lastUsedId) {
        const lastDevice = devices.find(d => d.deviceId === lastUsedId);
        if (lastDevice) {
            console.log(`Found last working ${kind} device:`, lastDevice.label);
            return lastDevice;
        }
    }

    for (const keyword of preferenceOrder) {
        const device = devices.find(d =>
            d.kind === kind &&
            d.label &&
            d.label.toLowerCase().includes(keyword.toLowerCase())
        );
        if (device) {
            console.log(`Found preferred ${kind} device:`, device.label);
            // Store as last working device
            localStorage.setItem(`last_working_${kind}`, device.deviceId);
            return device;
        }
    }
    
    // Avoid Bluetooth devices if possible (they can be unstable)
    const nonBluetooth = devices.find(d =>
        d.kind === kind &&
        d.label &&
        !d.label.toLowerCase().includes('bluetooth') &&
        !d.label.toLowerCase().includes('airpods') &&
        !d.label.toLowerCase().includes('built-in') &&
        !d.label.toLowerCase().includes('default')
    );
    if (nonBluetooth) {
        console.log(`Using non-Bluetooth ${kind} device:`, nonBluetooth.label);
        return nonBluetooth;
    }

    // If no preferred device found, return the first non-built-in device
    const nonBuiltIn = devices.find(d =>
        d.kind === kind &&
        d.label &&
        !d.label.toLowerCase().includes('built-in') &&
        !d.label.toLowerCase().includes('default')
    );
    if (nonBuiltIn) {
        console.log(`Using non-built-in ${kind} device:`, nonBuiltIn.label);
        return nonBuiltIn;
    }

    // Fallback to first device
    const firstDevice = devices.find(d => d.kind === kind);
    if (firstDevice) {
        console.log(`Using first available ${kind} device:`, firstDevice.label);
        return firstDevice;
    }

    console.log(`No ${kind} device found`);
    return null;
}

export function findPreferredAudioDevice(devices) {
    return findPreferredDevice(devices, 'audioinput');
}

export function findPreferredVideoDevice(devices) {
    return findPreferredDevice(devices, 'videoinput');
}

export async function loadDevices(updateStatusCallback) {
    const updateStatus = updateStatusCallback || (() => {});

    try {
        console.log('Starting device loading...');
        document.getElementById('loadDevicesButton').disabled = true;
        updateStatus('Requesting camera and microphone access...');

        // First, request permissions by getting initial streams
        // This is necessary to get proper device labels and access
        try {
            const permissionStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // Stop the permission stream immediately - we just needed it for permissions
            permissionStream.getTracks().forEach(track => track.stop());
            console.log('Permissions granted, now enumerating devices...');
        } catch (permissionError) {
            console.warn('Could not get full permissions, trying audio only:', permissionError);
            try {
                // Try audio only if video fails
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStream.getTracks().forEach(track => track.stop());
                console.log('Audio permission granted');
            } catch (audioError) {
                console.warn('Could not get audio permission either:', audioError);
                // Continue anyway - user might have some devices available
            }
        }

        updateStatus('Loading available devices...');

        // Now get list of devices with proper labels
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        console.log(`Found ${videoDevices.length} video devices and ${audioDevices.length} audio devices`);

        // Populate video source dropdown
        const videoSelect = document.getElementById('videoSource');
        videoSelect.innerHTML = '';
        
        // Add "System Default" option first
        const defaultVideoOption = document.createElement('option');
        defaultVideoOption.value = 'default';
        defaultVideoOption.text = 'System Default Camera';
        defaultVideoOption.selected = true; // Default selection
        videoSelect.appendChild(defaultVideoOption);

        // Add screen share option
        const screenOption = document.createElement('option');
        screenOption.value = 'screen';
        screenOption.text = 'Screen Share';
        videoSelect.appendChild(screenOption);

        // Add video devices
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${videoDevices.indexOf(device) + 1}`;
            videoSelect.appendChild(option);
        });

        // Populate audio source dropdown
        const audioSelect = document.getElementById('audioSource');
        audioSelect.innerHTML = '';

        // Add "System Default" option first
        const defaultAudioOption = document.createElement('option');
        defaultAudioOption.value = 'default';
        defaultAudioOption.text = 'System Default Microphone';
        audioSelect.appendChild(defaultAudioOption);

        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioDevices.indexOf(device) + 1}`;
            audioSelect.appendChild(option);
        });
        
        // Try to restore last selected audio device or find preferred one
        const lastSelectedAudio = localStorage.getItem('lastSelectedAudioDevice');
        if (lastSelectedAudio && audioDevices.find(d => d.deviceId === lastSelectedAudio)) {
            audioSelect.value = lastSelectedAudio;
            console.log(`Restored last selected audio device: ${lastSelectedAudio}`);
        } else {
            // Try to find a preferred device
            const preferredDevice = findPreferredAudioDevice(audioDevices);
            if (preferredDevice) {
                audioSelect.value = preferredDevice.deviceId;
                console.log(`Selected preferred audio device: ${preferredDevice.label}`);
            } else {
                // Default to first non-default device if available
                if (audioDevices.length > 0) {
                    audioSelect.value = audioDevices[0].deviceId;
                    console.log(`Selected first available audio device: ${audioDevices[0].label}`);
                }
            }
        }

        // Switch to main UI
        document.getElementById('initial-prompt').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        updateStatus(`Devices loaded successfully! Found ${videoDevices.length} cameras and ${audioDevices.length} microphones.`);

        console.log('Device loading completed successfully');

        // Don't automatically get any streams - let user select devices first
        return { videoDevices, audioDevices };

    } catch (error) {
        document.getElementById('loadDevicesButton').disabled = false;
        updateStatus(`Error loading devices: ${error.message}`, true);
        console.error('Device loading error:', error);

        // Provide helpful error messages based on error type
        if (error.name === 'NotAllowedError') {
            updateStatus('Camera/microphone access denied. Please allow access and try again.', true);
        } else if (error.name === 'NotFoundError') {
            updateStatus('No camera or microphone found. Please connect devices and try again.', true);
        } else if (error.name === 'NotReadableError') {
            updateStatus('Camera/microphone is being used by another application. Please close other apps and try again.', true);
        }

        throw error;
    }
}

export async function getVideoStream(deviceId, fps = 30, resolution = '1080p') {
    console.log(`📹 getVideoStream called with: deviceId=${deviceId}, fps=${fps}, resolution=${resolution}`);

    // Resolution mapping
    const resolutionMap = {
        '2160p': { width: 3840, height: 2160 },
        '1440p': { width: 2560, height: 1440 },
        '1080p': { width: 1920, height: 1080 },
        '720p': { width: 1280, height: 720 },
        '540p': { width: 960, height: 540 },
        '480p': { width: 854, height: 480 },
        '360p': { width: 640, height: 360 }
    };

    const { width, height } = resolutionMap[resolution] || resolutionMap['1080p'];
    console.log(`📹 Target resolution: ${width}x${height} (${resolution})`);

    const constraints = {
        video: {
            // For "default", don't specify deviceId to use system default
            deviceId: (deviceId && deviceId !== 'default') ? { exact: deviceId } : undefined,
            width: { min: width, ideal: width, max: width },
            height: { min: height, ideal: height, max: height },
            frameRate: { ideal: fps }
        }
    };

    console.log(`📹 Video constraints:`, constraints);

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log(`📹 Actual video settings:`, {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId
        });
        return stream;
    } catch (error) {
        console.error(`📹 Failed to get video stream with strict constraints, trying with ideal only:`, error);

        // Fallback to ideal constraints if strict fails
        const fallbackConstraints = {
            video: {
                deviceId: (deviceId && deviceId !== 'default') ? { exact: deviceId } : undefined,
                width: { ideal: width },
                height: { ideal: height },
                frameRate: { ideal: fps }
            }
        };

        console.log(`📹 Fallback constraints:`, fallbackConstraints);
        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log(`📹 Fallback video settings:`, {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId
        });
        return stream;
    }
}

export async function getAudioStream(deviceId, studioSound = false) {
    console.log(`🎵 getAudioStream called with deviceId: ${deviceId}, studioSound: ${studioSound}`);
    
    // Store the attempted device ID for recovery
    let attemptedDeviceId = deviceId;
    
    // If deviceId is 'default' or not provided, try to use the last selected device
    if (!deviceId || deviceId === 'default') {
        const lastSelected = localStorage.getItem('lastSelectedAudioDevice');
        if (lastSelected) {
            // Verify the device still exists
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(d => d.kind === 'audioinput');
            if (audioDevices.find(d => d.deviceId === lastSelected)) {
                console.log(`🎵 Using last selected device instead of default: ${lastSelected}`);
                deviceId = lastSelected;
            } else {
                console.log(`🎵 Last selected device no longer available: ${lastSelected}`);
                // Try to find a similar device (same label prefix)
                const lastDevice = await getDeviceInfoFromStorage(lastSelected);
                if (lastDevice && lastDevice.label) {
                    const similarDevice = audioDevices.find(d => 
                        d.label && d.label.startsWith(lastDevice.label.split(' ')[0])
                    );
                    if (similarDevice) {
                        console.log(`🎵 Found similar device: ${similarDevice.label}`);
                        deviceId = similarDevice.deviceId;
                    }
                }
            }
        }
    }

    const constraints = {
        audio: {
            // For "default", don't specify deviceId to use system default
            deviceId: (deviceId && deviceId !== 'default') ? { exact: deviceId } : undefined,
            autoGainControl: !studioSound,
            echoCancellation: !studioSound,
            noiseSuppression: !studioSound,
            channelCount: studioSound ? 2 : 1,
            sampleRate: studioSound ? 48000 : 44100,
            sampleSize: studioSound ? 24 : 16
        }
    };

    console.log(`🎵 Audio constraints:`, constraints);

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const audioTrack = stream.getAudioTracks()[0];
        const actualDeviceId = audioTrack.getSettings().deviceId;
        console.log(`🎵 Got audio track: ${audioTrack.label} (deviceId: ${actualDeviceId})`);
        
        // Store device info for recovery
        if (actualDeviceId && actualDeviceId !== 'default') {
            await storeDeviceInfo(actualDeviceId, audioTrack.label, 'audioinput');
            // Only update last selected if it was explicitly chosen
            if (attemptedDeviceId && attemptedDeviceId !== 'default') {
                localStorage.setItem('lastSelectedAudioDevice', actualDeviceId);
            }
        }
        
        return stream;
    } catch (error) {
        console.error(`🎵 Error getting audio stream for deviceId ${deviceId}:`, error);
        
        // If specific device fails, try fallback options
        if (deviceId && deviceId !== 'default' && error.name === 'NotFoundError') {
            console.log(`🎵 Device not found, trying fallback options`);
            
            // Try without deviceId constraint (system default)
            const fallbackConstraints = {
                audio: {
                    autoGainControl: !studioSound,
                    echoCancellation: !studioSound,
                    noiseSuppression: !studioSound,
                    channelCount: studioSound ? 2 : 1,
                    sampleRate: studioSound ? 48000 : 44100,
                    sampleSize: studioSound ? 24 : 16
                }
            };
            
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                const fallbackTrack = fallbackStream.getAudioTracks()[0];
                console.log(`🎵 Fallback successful: ${fallbackTrack.label}`);
                
                // Store the new device for future use
                const newDeviceId = fallbackTrack.getSettings().deviceId;
                if (newDeviceId) {
                    await storeDeviceInfo(newDeviceId, fallbackTrack.label, 'audioinput');
                }
                
                return fallbackStream;
            } catch (fallbackError) {
                console.error(`🎵 Fallback also failed:`, fallbackError);
                throw fallbackError;
            }
        }
        
        throw error;
    }
}

// Helper functions for device persistence
async function storeDeviceInfo(deviceId, label, kind) {
    try {
        const deviceInfo = {
            deviceId,
            label,
            kind,
            lastSeen: Date.now()
        };
        localStorage.setItem(`device_${deviceId}`, JSON.stringify(deviceInfo));
    } catch (e) {
        console.warn('Could not store device info:', e);
    }
}

async function getDeviceInfoFromStorage(deviceId) {
    try {
        const stored = localStorage.getItem(`device_${deviceId}`);
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.warn('Could not retrieve device info:', e);
        return null;
    }
}

export async function getScreenStream(includeAudio = false, resolution = '1080p', fps = 30) {
    console.log(`🖥️ getScreenStream called with: includeAudio=${includeAudio}, resolution=${resolution}, fps=${fps}`);

    // Resolution mapping
    const resolutionMap = {
        '2160p': { width: 3840, height: 2160 },
        '1440p': { width: 2560, height: 1440 },
        '1080p': { width: 1920, height: 1080 },
        '720p': { width: 1280, height: 720 },
        '540p': { width: 960, height: 540 },
        '480p': { width: 854, height: 480 },
        '360p': { width: 640, height: 360 }
    };

    const { width, height } = resolutionMap[resolution] || resolutionMap['1080p'];
    console.log(`🖥️ Target screen resolution: ${width}x${height} (${resolution})`);

    const constraints = {
        video: {
            cursor: "always",
            width: { min: width, ideal: width, max: width },
            height: { min: height, ideal: height, max: height },
            frameRate: { ideal: fps }
        },
        audio: includeAudio
    };

    console.log(`🖥️ Screen constraints:`, constraints);

    try {
        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log(`🖥️ Actual screen settings:`, {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate
        });
        return stream;
    } catch (error) {
        console.error(`🖥️ Failed to get screen stream with strict constraints, trying with ideal only:`, error);

        // Fallback to ideal constraints if strict fails
        const fallbackConstraints = {
            video: {
                cursor: "always",
                width: { ideal: width },
                height: { ideal: height },
                frameRate: { ideal: fps }
            },
            audio: includeAudio
        };

        console.log(`🖥️ Fallback screen constraints:`, fallbackConstraints);
        const stream = await navigator.mediaDevices.getDisplayMedia(fallbackConstraints);
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log(`🖥️ Fallback screen settings:`, {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate
        });
        return stream;
    }
}