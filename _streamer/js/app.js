/**
 * Main Application Entry Point
 */

import { loadDevices, getVideoStream, getAudioStream, getScreenStream } from './device-manager.js';
import { setupAudioMonitoring, toggleAudioInput, toggleAudioMonitor, updateMonitorVolume, cleanupAudioMonitoring, isAudioInputEnabled } from './audio-manager.js';
import { handleStartStreaming, stopStreaming, isCurrentlyStreaming, replaceTrack } from './stream-manager.js';
import { updateStatus, initializeUI, updateVideoPreview } from './ui-manager.js';
import { parseWhipEndpoint, hasWebRTCSupport } from './utils.js';

// Global variables
let mediaStream = null;
let room = null;
let participantId = null;
let wsConnection = null;
let ablyConnection = null;
let ablyChannel = null;
let isRemoteControlled = false;

// Make mediaStream globally accessible for mute functionality
window.mediaStream = null;

// Initialize isAudioInputEnabled globally (default true)
window.isAudioInputEnabled = true;

// Make functions available globally for onclick handlers
window.toggleAudioInput = toggleAudioInput;
window.toggleAudioMonitor = toggleAudioMonitor;
window.updateMonitorVolume = updateMonitorVolume;
window.updateStatus = updateStatus;
window.sendStatusUpdate = null; // Will be set after Socket.IO connection
window.sendMuteStateUpdate = null; // Will be set after Socket.IO connection


// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('StreamVoodoo Mobile initializing...');
    
    // Check WebRTC support
    if (!hasWebRTCSupport()) {
        updateStatus('Your browser does not support WebRTC', true);
        return;
    }
    
    // Initialize UI
    initializeUI();
    
    // Parse WHIP endpoint from URL
    parseWhipEndpoint();
    
    // Monitor device changes
    setupDeviceChangeMonitoring();

    // Get room and participantId from global variables set by parseWhipEndpoint
    room = window.room;
    participantId = window.participantId;
    
    console.log('Parsed URL parameters:', { room, participantId });

    // Update page title with participant name
    if (participantId) {
        updatePageTitle(participantId);
    }

    // Set up Socket.IO connection if room and participantId are detected
    if (room && participantId) {
        console.log('Detected room and participantId:', { room, participantId });
        initializeSocketIO();
        // Also initialize Ably for producer communication
        console.log('🚀 ABOUT TO CALL initializeAbly()...');
        console.log('🚀 DEBUG: room =', room, 'participantId =', participantId);
        initializeAbly();
        console.log('🚀 FINISHED CALLING initializeAbly()');
    }
    
    // Auto-load devices when room and participantId are present
    if (room && participantId) {
        console.log('Auto-loading devices for producer-controlled stream');
        // Simulate clicking Load Devices button after a short delay
        setTimeout(() => {
            const loadDevicesBtn = document.getElementById('loadDevicesButton');
            if (loadDevicesBtn && !loadDevicesBtn.disabled) {
                console.log('Auto-clicking Load Devices button');
                loadDevicesBtn.click();
            }
        }, 1000);
    }
    
    // Auto-start if requested (but only after devices are loaded)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('autostart') && urlParams.get('autostart') === 'true') {
        setTimeout(() => {
            const startBtn = document.getElementById('startButton');
            if (startBtn && !startBtn.disabled && devicesLoaded && mediaStream) {
                console.log('Auto-starting stream as requested');
                handleStartStreaming(mediaStream);
            } else if (!devicesLoaded) {
                console.log('Cannot auto-start - devices not loaded yet');
                updateStatus('Auto-start waiting for devices to be loaded', true);
            }
        }, 3000);
    }
});

// Add this RIGHT AFTER the existing DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... your existing code ...
    
    // ADD THIS: Set up event listeners for buttons
    setupEventListeners();
});

// ADD THIS FUNCTION to your app.js:
function setupEventListeners() {
    // Load Devices button
    const loadDevicesBtn = document.getElementById('loadDevicesButton');
    if (loadDevicesBtn) {
        loadDevicesBtn.addEventListener('click', window.loadDevices);
    }
    
    // Start/Stop buttons
    const startBtn = document.getElementById('startButton');
    if (startBtn) {
        startBtn.addEventListener('click', window.handleStartStreaming);
    }
    
    const stopBtn = document.getElementById('stopButton');
    if (stopBtn) {
        stopBtn.addEventListener('click', window.stopStreaming);
    }
    
    // Audio controls
    const micToggle = document.getElementById('micToggle');
    if (micToggle) {
        micToggle.addEventListener('click', window.toggleAudioInput);
    }
    
    const monitorToggle = document.getElementById('monitorToggle');
    if (monitorToggle) {
        monitorToggle.addEventListener('click', window.toggleAudioMonitor);
    }
    
    const monitorVolume = document.getElementById('monitorVolume');
    if (monitorVolume) {
        monitorVolume.addEventListener('input', (e) => window.updateMonitorVolume(e.target.value));
    }
    
    // Studio sound toggle with enhanced handling
    const studioSound = document.getElementById('studioSound');
    if (studioSound) {
        studioSound.addEventListener('change', async (e) => {
            console.log('🎵 Studio Sound toggle changed:', e.target.checked);
            
            // If streaming, handle Studio Sound change without stopping stream
            if (isCurrentlyStreaming()) {
                try {
                    const audioSource = document.getElementById('audioSource').value;
                    const studioSoundEnabled = e.target.checked;
                    
                    // Get new audio stream with updated settings
                    console.log('🎵 Getting new audio stream with Studio Sound:', studioSoundEnabled);
                    const audioStream = await getAudioStream(audioSource, studioSoundEnabled);
                    const newAudioTrack = audioStream.getAudioTracks()[0];
                    
                    // Replace track in media stream
                    const existingAudioTrack = mediaStream.getAudioTracks()[0];
                    if (existingAudioTrack) {
                        mediaStream.removeTrack(existingAudioTrack);
                        existingAudioTrack.stop();
                    }
                    mediaStream.addTrack(newAudioTrack);
                    
                    // Update audio monitoring
                    await setupAudioMonitoring(mediaStream);
                    
                    // Replace track in WHIP stream
                    console.log('🎵 Replacing audio track in live stream');
                    await replaceTrack(newAudioTrack);
                    
                    updateStatus(`Studio Sound ${studioSoundEnabled ? 'enabled' : 'disabled'} (live)`);
                } catch (error) {
                    console.error('Error toggling Studio Sound during stream:', error);
                    updateStatus('Error updating Studio Sound: ' + error.message, true);
                    // Revert toggle on error
                    e.target.checked = !e.target.checked;
                }
            } else {
                // Not streaming, use normal update
                await window.updateAudioConstraints();
            }
        });
    }
    
}

// Global flag to track if devices have been loaded
let devicesLoaded = false;

// Load devices button handler
window.loadDevices = async function() {
    try {
        const { videoDevices, audioDevices } = await loadDevices(updateStatus);
        
        // Set up device change handlers
        document.getElementById('videoSource').onchange = () => updateDevice('video');
        document.getElementById('audioSource').onchange = () => updateDevice('audio');
        
        // Auto-initialize both default video and audio devices
        console.log('Auto-initializing default devices...');

        // Initialize default video device
        await updateDevice('video');

        // Initialize default audio device
        if (audioDevices.length > 0) {
            await updateDevice('audio');
        }
        
        // Mark devices as loaded
        devicesLoaded = true;
        
        // Initialize Socket.IO connection if not already connected
        if (!wsConnection && room && participantId) {
            console.log('Initializing Socket.IO after devices loaded');
            initializeSocketIO();
            // Give Socket.IO time to connect before sending status
            setTimeout(() => {
                sendStatusUpdate();
            }, 500);
        } else {
            // Send status update now that devices are available
            sendStatusUpdate();
        }
        
    } catch (error) {
        console.error('Failed to load devices:', error);
    }
};

// Update device selection
window.updateDevice = async function(type) {
    try {
        const videoSource = document.getElementById('videoSource').value;
        const audioSource = document.getElementById('audioSource').value;
        const fps = parseInt(document.getElementById('fps').value);
        const resolution = document.getElementById('resolution').value;
        const studioSound = document.getElementById('studioSound').checked;
        
        // Initialize mediaStream if it doesn't exist
        if (!mediaStream) {
            mediaStream = new MediaStream();
            window.mediaStream = mediaStream; // Make it globally accessible
        }




        
        // Handle screen share
        if (type === 'video' && videoSource === 'screen') {
            try {
                console.log('Starting screen share with audio requested...');
                const screenStream = await getScreenStream(true, resolution, fps);
                console.log('Screen stream obtained:', {
                    videoTracks: screenStream.getVideoTracks().length,
                    audioTracks: screenStream.getAudioTracks().length
                });

                // Handle screen share ending
                screenStream.getVideoTracks()[0].addEventListener('ended', async () => {
                    updateStatus('Screen sharing ended - returning to camera');
                    document.getElementById('videoSource').value = 'default';

                    // Audio device switching remains enabled
                    console.log('📹 Screen share ended - returning to default camera');

                    // Remove video track from mediaStream
                    const existingVideoTrack = mediaStream.getVideoTracks()[0];
                    if (existingVideoTrack) {
                        mediaStream.removeTrack(existingVideoTrack);
                        existingVideoTrack.stop();
                    }

                    // Check if we were using screen audio and clean up
                    if (audioSelect.value === 'screen-audio') {
                        // Remove the screen audio option
                        for (let i = 0; i < audioSelect.options.length; i++) {
                            if (audioSelect.options[i].value === 'screen-audio') {
                                audioSelect.remove(i);
                                break;
                            }
                        }

                        // Remove audio track from mediaStream
                        const existingAudioTrack = mediaStream.getAudioTracks()[0];
                        if (existingAudioTrack) {
                            mediaStream.removeTrack(existingAudioTrack);
                            existingAudioTrack.stop();
                        }

                        // Select "System Default" audio option
                        audioSelect.value = 'default';

                        // Clean up audio monitoring
                        cleanupAudioMonitoring();
                    }
                    
                    // Restore default camera after screen share ends
                    try {
                        console.log('📹 Restoring default camera after screen share...');
                        const videoStream = await getVideoStream('default', parseInt(document.getElementById('fps').value), document.getElementById('resolution').value);
                        const newVideoTrack = videoStream.getVideoTracks()[0];
                        
                        mediaStream.addTrack(newVideoTrack);
                        window.mediaStream = mediaStream;
                        
                        updateVideoPreview(mediaStream);
                        updateStatus(`Returned to camera: ${newVideoTrack.label}`);
                        
                        // Send notification about return to camera
                        const videoSettings = newVideoTrack.getSettings();
                        sendVideoDeviceUpdate({
                            label: newVideoTrack.label,
                            deviceId: 'default',
                            isScreenShare: false,
                            capabilities: {
                                width: videoSettings.width,
                                height: videoSettings.height,
                                frameRate: videoSettings.frameRate,
                                facingMode: videoSettings.facingMode
                            }
                        });
                        
                        // If streaming, update the stream with new video track
                        if (isCurrentlyStreaming()) {
                            console.log('📹 Updating live stream with camera track...');
                            await replaceTrack(newVideoTrack);
                        }
                    } catch (err) {
                        console.error('Error restoring camera after screen share:', err);
                        updateStatus('Error restoring camera: ' + err.message, true);
                    }
                });

                // Replace video track
                const videoTrack = screenStream.getVideoTracks()[0];
                const existingVideoTrack = mediaStream.getVideoTracks()[0];
                if (existingVideoTrack) {
                    mediaStream.removeTrack(existingVideoTrack);
                    existingVideoTrack.stop();
                }
                mediaStream.addTrack(videoTrack);
                window.mediaStream = mediaStream; // Update global reference

                // Always add "Screen Audio" option to dropdown when screen sharing starts
                const audioSelect = document.getElementById('audioSource');

                // Check if we already have a screen audio option
                let hasScreenAudioOption = false;
                for (let i = 0; i < audioSelect.options.length; i++) {
                    if (audioSelect.options[i].value === 'screen-audio') {
                        hasScreenAudioOption = true;
                        break;
                    }
                }

                // Add the screen audio option if it doesn't exist
                if (!hasScreenAudioOption) {
                    const screenAudioOption = document.createElement('option');
                    screenAudioOption.value = 'screen-audio';
                    screenAudioOption.text = 'Screen Audio';
                    // Insert after "System Default" option (index 1)
                    audioSelect.insertBefore(screenAudioOption, audioSelect.options[1]);
                    console.log('Added Screen Audio option to dropdown');
                }

                // Handle screen audio if available - ONLY use it if user selected "Screen Audio"
                const screenAudioTrack = screenStream.getAudioTracks()[0];
                const currentAudioSelection = audioSelect.value;

                if (screenAudioTrack) {
                    console.log('Screen audio track found:', screenAudioTrack.label);

                    // Store the screen audio track for when user selects "Screen Audio"
                    window.availableScreenAudioTrack = screenAudioTrack;

                    // Apply studio sound settings to screen audio if enabled
                    const studioSound = document.getElementById('studioSound').checked;
                    if (studioSound) {
                        try {
                            const constraints = {
                                autoGainControl: false,
                                echoCancellation: false,
                                noiseSuppression: false
                            };

                            if (screenAudioTrack.applyConstraints) {
                                await screenAudioTrack.applyConstraints(constraints);
                                console.log('Applied studio sound settings to screen audio');
                            }
                        } catch (err) {
                            console.warn('Could not apply studio sound settings to screen audio:', err);
                        }
                    }

                    // ONLY replace audio if user specifically selected "Screen Audio"
                    if (currentAudioSelection === 'screen-audio') {
                        const existingAudioTrack = mediaStream.getAudioTracks()[0];
                        if (existingAudioTrack) {
                            mediaStream.removeTrack(existingAudioTrack);
                            existingAudioTrack.stop();
                        }
                        mediaStream.addTrack(screenAudioTrack);
                        window.mediaStream = mediaStream;

                        await setupAudioMonitoring(mediaStream);
                        const studioSoundText = studioSound ? ' (Studio Sound enabled)' : '';
                        updateStatus(`Screen sharing with tab audio started${studioSoundText}`);
                    } else {
                        // User has their own microphone selected - actively get it
                        console.log(`🎵 Screen share: Getting selected microphone: ${currentAudioSelection}`);
                        try {
                            const currentStudioSound = document.getElementById('studioSound').checked;
                            const audioStream = await getAudioStream(currentAudioSelection, currentStudioSound);
                            const audioTrack = audioStream.getAudioTracks()[0];
                            const existingAudioTrack = mediaStream.getAudioTracks()[0];

                            if (existingAudioTrack) {
                                mediaStream.removeTrack(existingAudioTrack);
                                existingAudioTrack.stop();
                            }
                            mediaStream.addTrack(audioTrack);
                            window.mediaStream = mediaStream;

                            await setupAudioMonitoring(mediaStream);
                            updateStatus(`Screen sharing started with your selected microphone: ${audioTrack.label}`);

                            // KEEP audio device switching ENABLED during screen sharing
                            console.log('🎵 Audio device switching remains ENABLED during screen share');
                        } catch (err) {
                            console.error('Error getting selected microphone:', err);
                            updateStatus(`Screen sharing started - microphone error: ${err.message}`, true);
                        }
                    }
                } else {
                    console.log('No screen audio track available');
                    updateStatus('Screen sharing started - no tab audio available');
                }

                updateVideoPreview(mediaStream);
                
                // Send video device update notification for screen share
                const videoSettings = videoTrack.getSettings();
                sendVideoDeviceUpdate({
                    label: 'Screen Share',
                    deviceId: 'screen',
                    isScreenShare: true,
                    capabilities: {
                        width: videoSettings.width,
                        height: videoSettings.height,
                        frameRate: videoSettings.frameRate,
                        displaySurface: videoSettings.displaySurface
                    }
                });
                
                return;
                
            } catch (err) {
                updateStatus('Screen sharing cancelled or error occurred', true);
                console.error('Screen sharing error:', err);
                return;
            }
        }



        // Normal device selection
        try {
            if (type === 'video') {
                console.log(`📹 Video device change requested: ${videoSource}`);
                
                const videoStream = await getVideoStream(videoSource, fps, resolution);
                const videoTrack = videoStream.getVideoTracks()[0];
                const existingVideoTrack = mediaStream.getVideoTracks()[0];

                if (existingVideoTrack) {
                    console.log(`📹 Stopping existing video track: ${existingVideoTrack.label}`);
                    mediaStream.removeTrack(existingVideoTrack);
                    existingVideoTrack.stop();
                }
                
                console.log(`📹 Adding new video track: ${videoTrack.label}`);
                mediaStream.addTrack(videoTrack);
                window.mediaStream = mediaStream; // Update global reference

                updateStatus(`Video device updated: ${videoTrack.label}`);
                
                // Send video device update notification
                const videoSettings = videoTrack.getSettings();
                sendVideoDeviceUpdate({
                    label: videoTrack.label,
                    deviceId: videoSource,
                    isScreenShare: false,
                    capabilities: {
                        width: videoSettings.width,
                        height: videoSettings.height,
                        frameRate: videoSettings.frameRate,
                        facingMode: videoSettings.facingMode
                    }
                });

            } else if (type === 'audio') {
                console.log(`🎵 Audio device change requested: ${audioSource}`);
                
                // Save selected device preference
                if (audioSource && audioSource !== 'default' && audioSource !== 'screen-audio') {
                    localStorage.setItem('lastSelectedAudioDevice', audioSource);
                }

                // Handle "Screen Audio" selection
                if (audioSource === 'screen-audio') {
                    console.log('🎵 User selected Screen Audio');
                    // Check if we're currently screen sharing
                    const videoSelect = document.getElementById('videoSource');
                    if (videoSelect.value !== 'screen') {
                        updateStatus('Screen Audio is only available when screen sharing', true);
                        // Reset to previous selection
                        const audioSelect = document.getElementById('audioSource');
                        audioSelect.value = 'default';
                        return;
                    }

                    // Use the stored screen audio track if available
                    if (window.availableScreenAudioTrack) {
                        console.log('🎵 Using stored screen audio track');
                        const existingAudioTrack = mediaStream.getAudioTracks()[0];
                        if (existingAudioTrack) {
                            mediaStream.removeTrack(existingAudioTrack);
                            existingAudioTrack.stop();
                        }
                        mediaStream.addTrack(window.availableScreenAudioTrack);
                        window.mediaStream = mediaStream;

                        await setupAudioMonitoring(mediaStream);
                        updateStatus('Using screen audio');
                        return;
                    } else {
                        updateStatus('No screen audio available - try sharing a Chrome tab with audio', true);
                        return;
                    }
                }

                // Check if we're switching from "Screen Audio" to a microphone
                const audioSelect = document.getElementById('audioSource');
                const wasUsingScreenAudio = audioSelect.value === 'screen-audio';

                // If we're switching from screen audio to microphone, remove the screen audio option
                if (wasUsingScreenAudio) {
                    // Find and remove the screen audio option
                    for (let i = 0; i < audioSelect.options.length; i++) {
                        if (audioSelect.options[i].value === 'screen-audio') {
                            audioSelect.remove(i);
                            break;
                        }
                    }
                }

                // Force stop existing audio track before getting new one
                const existingAudioTrack = mediaStream.getAudioTracks()[0];
                if (existingAudioTrack) {
                    console.log(`🎵 Stopping existing audio track: ${existingAudioTrack.label}`);
                    existingAudioTrack.stop();
                    mediaStream.removeTrack(existingAudioTrack);
                }
                
                // Store current Studio Sound setting to preserve it
                const currentStudioSound = document.getElementById('studioSound').checked;
                console.log(`🎵 Getting microphone: ${audioSource} (studio sound: ${currentStudioSound})`);
                const audioStream = await getAudioStream(audioSource, currentStudioSound);
                const audioTrack = audioStream.getAudioTracks()[0];

                console.log(`🎵 New audio track: ${audioTrack.label}`);
                mediaStream.addTrack(audioTrack);
                window.mediaStream = mediaStream; // Update global reference

                // Update audio monitoring
                await setupAudioMonitoring(mediaStream);

                updateStatus(`Audio device updated: ${audioTrack.label}`);
                console.log(`🎵 Audio device successfully updated to: ${audioTrack.label}`);
            }
            
            // Update video preview
            updateVideoPreview(mediaStream);

            // If streaming, replace track in stream
            if (isCurrentlyStreaming()) {
                const track = type === 'video' ?
                    mediaStream.getVideoTracks()[0] :
                    mediaStream.getAudioTracks()[0];
                console.log(`🔄 Replacing ${type} track during live streaming`);
                await replaceTrack(track);
            }
            
            // Send status update after device change
            sendStatusUpdate();
            
        } catch (error) {
            console.error('Error updating device:', error);
            updateStatus(`Error updating ${type} device: ${error.message}`, true);
        }
        
    } catch (error) {
        console.error('Device update error:', error);
        
        // Special handling for NotReadableError
        if (error.name === 'NotReadableError') {
            let statusHtml = `<div style="color: #ff6b6b;">
                <strong>Error: Camera/Microphone in use</strong>
            </div>
            <div style="background: #2a2a2a; padding: 10px; border-radius: 5px; margin-top: 10px;">
                <strong>Quick fixes:</strong>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>Close other apps using the ${type === 'video' ? 'camera' : 'microphone'}</li>
                    <li>Try selecting a different device from the dropdown</li>
                    <li>Click the retry button below</li>
                </ul>
            </div>
            <button onclick="retryDeviceAccess()" style="margin-top: 10px; padding: 5px 15px; background: #007acc; border: none; border-radius: 3px; cursor: pointer;">Retry Device Access</button>`;
            
            document.getElementById('status').innerHTML = statusHtml;
        } else {
            updateStatus(`Error updating ${type} device: ${error.message}`, true);
        }
    }
};

// Simple retry function
window.retryDeviceAccess = async function() {
    document.getElementById('loadDevicesButton').disabled = false;
    await loadDevices(updateStatus);
};

// Audio constraints update
window.updateAudioConstraints = async function() {
    await updateDevice('audio');
};

// Start streaming handler
window.handleStartStreaming = async function() {
    // Check if we need to initialize Socket.IO connection for producer commands
    if (!wsConnection && !room && !participantId) {
        console.log('Attempting to extract room/participant info from WHIP endpoint for producer commands...');
        
        // Try to extract from current WHIP endpoint input
        const whipInput = document.getElementById('whipEndpoint');
        if (whipInput && whipInput.value) {
            // Extract room and participantId from WHIP URL
            // Expected format: https://server.com/room/participantId/whip
            const whipMatch = whipInput.value.match(/\/([^\/]+)\/([^\/]+)\/whip$/);
            if (whipMatch) {
                room = whipMatch[1];
                participantId = whipMatch[2];
                
                console.log('Extracted for producer commands:', { 
                    room: room, 
                    participantId: participantId 
                });
                
                // Initialize Socket.IO for producer commands
                initializeSocketIO();
                console.log('Socket.IO connection initialized for producer commands');
            }
        }
    }
    
    const result = await handleStartStreaming(mediaStream);
    // Send status update after streaming state change
    sendStatusUpdate();
    sendAblyStatusUpdate(); // Also send via Ably
    return result;
};

// Stop streaming handler
window.stopStreaming = function() {
    stopStreaming();
    // Send status update after streaming state change
    sendStatusUpdate();
    sendAblyStatusUpdate('stopped'); // Also send via Ably
};

// Update page title with participant name
function updatePageTitle(participantName) {
    // Update browser title
    document.title = `${participantName}'s Stream - Voodoo Studios`;

    // Update the HTML text elements in both sections
    const titleElements = document.querySelectorAll('#main-title, #main-title-initial');
    const subtitleElements = document.querySelectorAll('#main-subtitle, #main-subtitle-initial');

    titleElements.forEach(element => {
        element.textContent = `${participantName}'s Stream`;
    });

    subtitleElements.forEach(element => {
        element.textContent = `Remotely managed by producer`;
    });

    console.log(`Updated page title for: ${participantName}`);
}

// Setup device change monitoring
function setupDeviceChangeMonitoring() {
    // Enhanced device change handler with protection against unwanted switches
    let deviceChangeTimeout = null;
    navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log('🎵 Audio/Video devices changed - checking current selections');
        
        // Debounce rapid device changes (common with Bluetooth)
        if (deviceChangeTimeout) {
            clearTimeout(deviceChangeTimeout);
        }
        
        deviceChangeTimeout = setTimeout(async () => {
            try {
                // Get current device lists
                const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(d => d.kind === 'audioinput');
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            // Check if current audio device is still available
            const audioSelect = document.getElementById('audioSource');
            const currentAudioId = audioSelect?.value;
            
            if (currentAudioId && currentAudioId !== 'default' && currentAudioId !== 'screen-audio') {
                const deviceStillExists = audioDevices.find(d => d.deviceId === currentAudioId);
                
                if (!deviceStillExists) {
                    console.log('🎵 Current audio device disconnected:', currentAudioId);
                    updateStatus('Audio device disconnected, switching to preferred device', true);
                    
                    // Try to find a preferred device
                    const { findPreferredAudioDevice } = await import('./device-manager.js');
                    const preferredDevice = findPreferredAudioDevice(audioDevices);
                    
                    if (preferredDevice) {
                        audioSelect.value = preferredDevice.deviceId;
                        console.log('🎵 Switching to preferred device:', preferredDevice.label);
                    } else if (audioDevices.length > 0) {
                        audioSelect.value = audioDevices[0].deviceId;
                        console.log('🎵 Switching to first available device:', audioDevices[0].label);
                    } else {
                        audioSelect.value = 'default';
                        console.log('🎵 No audio devices available, switching to default');
                    }
                    
                    // Update the device if we have an active stream
                    if (mediaStream && mediaStream.getAudioTracks().length > 0) {
                        await updateDevice('audio');
                    }
                }
            }
            
            // Check video device similarly
            const videoSelect = document.getElementById('videoSource');
            const currentVideoId = videoSelect?.value;
            
            if (currentVideoId && currentVideoId !== 'default' && currentVideoId !== 'screen') {
                const deviceStillExists = videoDevices.find(d => d.deviceId === currentVideoId);
                
                if (!deviceStillExists) {
                    console.log('📹 Current video device disconnected:', currentVideoId);
                    updateStatus('Video device disconnected, switching to default', true);
                    videoSelect.value = 'default';
                    
                    // Update the device if we have an active stream
                    if (mediaStream && mediaStream.getVideoTracks().length > 0) {
                        await updateDevice('video');
                    }
                }
            }
            
        } catch (error) {
            console.error('Error handling device change:', error);
        }
        }, 500); // 500ms debounce for device changes
    });
}

// Socket.IO functions
function initializeSocketIO() {
    console.log('initializeSocketIO called with:', { room, participantId });
    
    if (!room || !participantId) {
        console.error('Cannot initialize Socket.IO - missing room or participantId');
        return;
    }

    console.log(`Connecting to Socket.io for room: ${room}, participantId: ${participantId}`);

    // Determine WebSocket server based on environment
    const isLocal = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.startsWith('192.168.') ||
                   window.location.hostname.startsWith('10.') ||
                   window.location.hostname.startsWith('172.');
    
    const wsUrl = isLocal ? 'ws://localhost:3000' : 'wss://ws.voodoostudios.tv';
    
    console.log(`Connecting to WebSocket server at: ${wsUrl}`);
    
    wsConnection = io(wsUrl, {
        transports: ['websocket'],
        timeout: 20000,
        forceNew: true
    });

    wsConnection.on('connect', () => {
        console.log('Socket.io connected successfully');
        console.log('Joining room:', room, 'as participantId:', participantId);

        // Join room
        wsConnection.emit('join-room', {
            room: room,
            role: 'streamer',
            participantId: participantId,
            participantName: participantId
        });

        // Register stream with server information
        wsConnection.emit('register-stream', {
            streamId: participantId,
            streamName: `${participantId}'s Stream`,
            status: 'ready',
            server: window.serverParam || 'east'
        });

        console.log('Registered stream with streamId:', participantId);

        // Send initial status
        console.log('Sending initial connected status');
        sendStatusUpdate('connected');

        // Make sendStatusUpdate and sendMuteStateUpdate globally accessible
        window.sendStatusUpdate = sendStatusUpdate;
        window.sendMuteStateUpdate = sendMuteStateUpdate;
        
        // Make WebSocket connection and room info globally accessible for stream manager
        window.wsConnection = wsConnection;
        window.room = room;
        window.participantId = participantId;
    });

    wsConnection.on('connect_error', (error) => {
        console.error('Socket.io connection error:', error);
        updateStatus(`Connection error: ${error.message}`, true);
    });

    // Listen for producer commands
    wsConnection.on('producer-command', (data) => {
        console.log('Received producer command:', data);
        console.log('Current participantId:', participantId);
        console.log('Command streamId matches:', data.streamId === participantId);

        if (data.streamId === participantId) {
            // Match the working format from streamer-producer
            const command = {
                type: 'PRODUCER_COMMAND',
                command: data.command,
                target: participantId,
                muted: data.muted // Pass through the muted parameter
            };
            handleWebSocketCommand(command);
        } else {
            console.log('Command ignored - streamId mismatch');
        }
    });

    wsConnection.on('disconnect', () => {
        console.log('Socket.io disconnected');
        updateStatus('Disconnected from control server', true);
    });

    // Debug: Listen for ALL events
    wsConnection.onAny((eventName, ...args) => {
        console.log(`[DEBUG] Received Socket.IO event: ${eventName}`, args);
    });
}

// Initialize Ably connection for producer communication
function initializeAbly() {
    console.log('🚀 ABLY INIT: initializeAbly called with:', { room, participantId });
    
    if (!room || !participantId) {
        console.error('Cannot initialize Ably - missing room or participantId');
        return;
    }

    console.log(`Connecting to Ably for room: ${room}, participantId: ${participantId}`);

    // Initialize Ably with the same API key as producer
    ablyConnection = new Ably.Realtime('8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs');
    
    ablyConnection.connection.on('connected', () => {
        console.log('Ably connected successfully');
        
        // Subscribe to room channel
        ablyChannel = ablyConnection.channels.get(room);
        
        // Send participant joined event
        ablyChannel.publish('participant-joined', {
            participantId: participantId,
            participantName: `${participantId}'s Stream`,
            role: 'streamer',
            room: room,
            timestamp: Date.now()
        });

        // Register stream via Ably
        ablyChannel.publish('stream-registered', {
            streamId: participantId,
            streamName: `${participantId}'s Stream`,
            status: 'ready',
            room: room,
            timestamp: Date.now()
        });

        console.log('✅ ABLY: Sent participant-joined and stream-registered events to producer!');
        
        // ALSO post message to parent window for debugging
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'ABLY_EVENTS_SENT',
                data: { participantId, room, status: 'ready' }
            }, '*');
        }

        // Listen for producer commands via Ably
        ablyChannel.subscribe('producer-command', (msg) => {
            const data = msg.data;
            console.log('🎛️ ABLY: Received producer command:', data);
            
            if (data.streamId === participantId) {
                console.log('🎛️ ABLY: Command is for me! Converting to Socket.io format...');
                // Convert to Socket.io format and handle
                const command = {
                    type: 'PRODUCER_COMMAND',
                    command: data.command,
                    target: participantId,
                    muted: data.muted
                };
                console.log('🎛️ ABLY: Calling handleWebSocketCommand with:', command);
                handleWebSocketCommand(command);
            }
        });
        
        // Listen for producer requests (like GET_ROOM_STREAMS)
        ablyChannel.subscribe('producer-request', (msg) => {
            const data = msg.data;
            console.log('🎛️ ABLY: Received producer request:', data);
            
            if (data.command === 'GET_ROOM_STREAMS') {
                // Don't announce if session has ended
                if (sessionEnded) {
                    console.log('🎛️ ABLY: Not announcing presence - session has ended');
                    return;
                }
                
                console.log('🎛️ ABLY: Producer requesting room streams - announcing my presence');
                // Announce this streamer's presence
                ablyChannel.publish('participant-joined', {
                    participantId: participantId,
                    participantName: `${participantId}'s Stream`,
                    role: 'streamer',
                    room: room,
                    timestamp: Date.now()
                });
                
                // Also register the stream
                ablyChannel.publish('stream-registered', {
                    streamId: participantId,
                    streamName: `${participantId}'s Stream`,
                    status: isCurrentlyStreaming() ? 'streaming' : 'ready',
                    room: room,
                    timestamp: Date.now()
                });
            }
        });

        // Make Ably functions globally accessible
        window.ablyConnection = ablyConnection;
        window.ablyChannel = ablyChannel;
        window.sendAblyStatusUpdate = sendAblyStatusUpdate;
    });

    ablyConnection.connection.on('failed', (error) => {
        console.error('Ably connection error:', error);
    });

    ablyConnection.connection.on('disconnected', () => {
        console.log('Ably disconnected');
    });
}

// Send status updates via Ably
function sendAblyStatusUpdate(status = null) {
    if (!ablyChannel) {
        console.log('[DEBUG] Cannot send Ably status update - not connected');
        return;
    }

    // If no specific status provided, determine current status
    if (!status) {
        if (isCurrentlyStreaming()) {
            status = 'streaming';
        } else if (devicesLoaded) {
            status = 'ready';
        } else {
            status = 'connected';
        }
    }

    console.log(`Sending Ably status update: ${status}`);

    // Send stream status update via Ably
    ablyChannel.publish('stream-status-update', {
        streamId: participantId,
        status: status,
        timestamp: Date.now()
    });
}

function sendStatusUpdate(status = null) {
    if (!wsConnection || !wsConnection.connected) {
        console.log('[DEBUG] Cannot send status update - Socket.IO not connected');
        return;
    }

    // If no specific status provided, determine current status
    if (!status) {
        if (isCurrentlyStreaming()) {
            status = 'streaming';
        } else if (devicesLoaded) {
            status = 'ready';
        } else {
            status = 'connected';
        }
    }

    console.log(`Sending status update: ${status}`);

    // Send stream status update
    wsConnection.emit('stream-status', {
        streamId: participantId,
        status: status
    });
}

// Function to send mute state updates to green room
function sendMuteStateUpdate(isMuted) {
    if (!wsConnection || !participantId) {
        console.log('Cannot send mute state - no WebSocket connection');
        return;
    }

    console.log(`Sending mute state update: ${isMuted ? 'MUTED' : 'UNMUTED'}`);

    // Send mute state to all related rooms (including green room)
    wsConnection.emit('stream-mute-state', {
        streamId: participantId,
        muted: isMuted
    });
}

// Function to send video device change updates
function sendVideoDeviceUpdate(deviceInfo) {
    if (!wsConnection || !participantId) {
        console.log('Cannot send video device update - no WebSocket connection');
        return;
    }

    console.log(`📹 Sending video device update:`, deviceInfo);

    // Send video device change to all related rooms
    wsConnection.emit('stream-video-device-change', {
        streamId: participantId,
        deviceLabel: deviceInfo.label,
        deviceId: deviceInfo.deviceId,
        isScreenShare: deviceInfo.isScreenShare || false,
        capabilities: deviceInfo.capabilities || {}
    });
}

function handleWebSocketCommand(command) {
    console.log('*** STREAMER RECEIVED WebSocket command:', command);
    isRemoteControlled = true;

    switch (command.command) {
        case 'START_STREAM':
            if (!devicesLoaded) {
                updateStatus('Cannot start streaming - devices not loaded', true);
                sendStatusUpdate('error');
                break;
            }
            if (!isCurrentlyStreaming()) {
                updateStatus('Producer is starting your stream...');
                handleStartStreaming(mediaStream).then(() => {
                    sendStatusUpdate('streaming');
                    sendAblyStatusUpdate('streaming'); // Also send via Ably
                }).catch((error) => {
                    console.error('Remote start failed:', error);
                    sendStatusUpdate('error');
                    sendAblyStatusUpdate('error'); // Also send via Ably
                });
            } else {
                sendStatusUpdate('streaming'); // Already streaming
                sendAblyStatusUpdate('streaming'); // Also send via Ably
            }
            break;

        case 'STOP_STREAM':
            if (isCurrentlyStreaming()) {
                updateStatus('Producer is stopping your stream...');
                stopStreaming();
                sendStatusUpdate('stopped');
                sendAblyStatusUpdate('stopped'); // Also send via Ably
            } else {
                sendStatusUpdate('ready'); // Already stopped
                sendAblyStatusUpdate('ready'); // Also send via Ably
            }
            break;

        case 'END_SESSION':
        case 'FORCE_END_SESSION':
            console.log('*** PROCESSING END_SESSION - STOPPING EVERYTHING');
            handleEndSession();
            sendAblyStatusUpdate('ended'); // Send end status via Ably
            break;
    }
}

// Session ended state management
let sessionEnded = false;

function handleEndSession() {
    console.log('Session ended by producer');
    sessionEnded = true;

    // Stop streaming if active
    if (isCurrentlyStreaming()) {
        stopStreaming();
    }

    // Send final status update
    sendStatusUpdate('session-ended');
    
    // If we're in an iframe (part of the dual-panel interface), 
    // notify the parent window to handle complete session termination
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({
                type: 'SESSION_ENDED',
                source: 'streamer',
                timestamp: Date.now()
            }, '*');
            console.log('Notified parent window of session end');
        } catch (e) {
            console.error('Failed to notify parent of session end:', e);
        }
    }
    
    // Redirect to session ended page after a brief delay
    setTimeout(() => {
        // Try to redirect to a session ended page, fallback to closing window
        try {
            // If we're in an iframe, redirect the top-level window
            if (window.parent && window.parent !== window) {
                window.top.location.href = 'https://voodoostudios.tv';
            } else {
                window.location.href = 'https://voodoostudios.tv';
            }
        } catch (e) {
            // If redirect fails, try to close the window
            try {
                window.close();
            } catch (e2) {
                // If closing fails, show the overlay as fallback
                showSessionEndedUI();
            }
        }
    }, 1000);
}

function showSessionEndedUI() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'session-ended-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--bg-color);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        text-align: center;
    `;

    overlay.innerHTML = `
        <div style="background: var(--bg-lighter); padding: 40px; border-radius: 12px; border: 1px solid var(--border-color); max-width: 400px;">
            <h2 style="color: var(--accent-red); margin-bottom: 20px; font-size: 24px;">Session Ended</h2>
            <p style="color: var(--text-color); margin-bottom: 20px; line-height: 1.5;">
                The producer has ended this streaming session.
            </p>
            <button onclick="location.reload()" style="
                background: var(--accent-blue);
                color: white;
                border: none;
                padding: 12px 32px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 500;
                min-width: 150px;
                white-space: nowrap;
                transition: all 0.2s ease;
            ">
                Reload Page
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
}

function applyRemoteSettings(settings) {
    if (settings.resolution) {
        document.getElementById('resolution').value = settings.resolution;
    }
    if (settings.bitrate) {
        document.getElementById('videoBitrate').value = settings.bitrate;
    }
    if (settings.fps) {
        document.getElementById('fps').value = settings.fps;
    }
    if (settings.codec) {
        document.getElementById('videoCodec').value = settings.codec;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isCurrentlyStreaming()) {
        stopStreaming();
    }
    
    if (wsConnection) {
        wsConnection.close();
    }
    
    cleanupAudioMonitoring();
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
});