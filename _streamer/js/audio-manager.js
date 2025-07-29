/**
 * Audio Manager - Handles audio monitoring, studio sound, and audio controls
 */

import { AudioMeter, updateAudioMeter } from './audio-meter.js';

let audioContext = null;
let audioMeter = null;
let monitorGainNode = null;
let meterUpdateInterval = null;
let isAudioInputEnabled = true;

export async function setupAudioMonitoring(mediaStream) {
    try {
        console.log('[setupAudioMonitoring] Starting audio monitoring setup...');
        
        // Clean up existing audio monitoring if needed
        if (meterUpdateInterval) {
            console.log('[setupAudioMonitoring] Clearing meter interval.');
            clearInterval(meterUpdateInterval);
            meterUpdateInterval = null;
        }

        if (audioMeter) {
            console.log('[setupAudioMonitoring] Disconnecting existing AudioMeter.');
            audioMeter.disconnect();
            audioMeter = null;
        }

        if (monitorGainNode && audioContext) {
            console.log('[setupAudioMonitoring] Disconnecting existing monitorGainNode.');
            monitorGainNode.disconnect();
            monitorGainNode = null;
        }

        // Close and recreate the audio context to ensure clean state
        if (audioContext) {
            console.log('[setupAudioMonitoring] Closing existing AudioContext.');
            try {
                await audioContext.close();
                console.log('[setupAudioMonitoring] Existing AudioContext closed.');
            } catch (err) {
                console.error("[setupAudioMonitoring] Error closing previous audio context:", err);
            }
        }

        // Create new audio context
        console.log('[setupAudioMonitoring] Creating new AudioContext.');
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000,
            latencyHint: 'interactive'
        });
        console.log('[setupAudioMonitoring] New AudioContext created.');

        try {
            await audioContext.resume();
            console.log("[setupAudioMonitoring] Audio context resumed. State:", audioContext.state);
        } catch (err) {
            console.error("[setupAudioMonitoring] Error resuming audio context:", err);
        }

        // Create new gain node
        console.log('[setupAudioMonitoring] Creating monitorGainNode.');
        monitorGainNode = audioContext.createGain();
        monitorGainNode.gain.value = 0; // Start muted
        console.log('[setupAudioMonitoring] monitorGainNode created.');

        if (mediaStream && mediaStream.getAudioTracks().length > 0) {
            // Log which audio track we're using for monitoring
            const audioTrack = mediaStream.getAudioTracks()[0];
            console.log('[setupAudioMonitoring] Using audio track:', audioTrack.label, audioTrack.getSettings());

            // Reset meter displays
            document.getElementById('meter-bar-left').style.width = '0%';
            document.getElementById('meter-bar-right').style.width = '0%';
            document.getElementById('meter-value-left').textContent = '-Inf dB';
            document.getElementById('meter-value-right').textContent = '-Inf dB';

            // Clone the stream for audio meter to avoid interference with the main stream
            console.log('[setupAudioMonitoring] Cloning stream for AudioMeter.');
            const audioStreamForMeter = new MediaStream([audioTrack]);

            try {
                // Set up audio meter
                console.log('[setupAudioMonitoring] Creating AudioMeter instance...');
                audioMeter = new AudioMeter(audioContext, audioStreamForMeter);
                console.log('[setupAudioMonitoring] AudioMeter instance created.');

                // Set up monitoring path with a different stream instance to avoid issues
                console.log('[setupAudioMonitoring] Creating monitor stream source...');
                const monitorStream = new MediaStream([audioTrack]);
                const source = audioContext.createMediaStreamSource(monitorStream);
                console.log('[setupAudioMonitoring] Connecting monitor source to gain node...');
                source.connect(monitorGainNode);
                console.log('[setupAudioMonitoring] Connecting gain node to destination...');
                monitorGainNode.connect(audioContext.destination);
                console.log('[setupAudioMonitoring] Monitor path connected.');

                // Set initial monitor state based on button state
                const monitorToggle = document.getElementById('monitorToggle');
                if (monitorToggle && monitorToggle.classList.contains('active')) {
                    const volume = document.getElementById('monitorVolume').value;
                    monitorGainNode.gain.setValueAtTime(volume / 100, audioContext.currentTime);
                }

                // Start meter updates
                console.log('[setupAudioMonitoring] Starting meter update interval...');
                meterUpdateInterval = setInterval(() => updateAudioMeter(audioMeter), 100);
                console.log('[setupAudioMonitoring] Audio monitoring setup completed successfully.');

            } catch (error) {
                console.error('[setupAudioMonitoring] Error setting up audio monitoring:', error);
                throw error;
            }
        } else {
            console.log('[setupAudioMonitoring] No audio tracks available for monitoring.');
        }

    } catch (error) {
        console.error('[setupAudioMonitoring] Critical error:', error);
        throw error;
    }
}

export function toggleAudioInput() {
    const button = document.getElementById('micToggle');
    isAudioInputEnabled = !isAudioInputEnabled;
    window.isAudioInputEnabled = isAudioInputEnabled; // Update global state
    
    if (isAudioInputEnabled) {
        button.innerHTML = '<i data-lucide="mic"></i>';
        button.classList.add('active');
        // Enable audio tracks in mediaStream
        if (window.mediaStream) {
            window.mediaStream.getAudioTracks().forEach(track => {
                track.enabled = true;
            });
        }
        window.updateStatus && window.updateStatus('Microphone enabled');
    } else {
        button.innerHTML = '<i data-lucide="mic-off"></i>';
        button.classList.remove('active');
        // Disable audio tracks in mediaStream
        if (window.mediaStream) {
            window.mediaStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        }
        window.updateStatus && window.updateStatus('Microphone muted');
    }
    
    // Send mute state update via WebSocket if available
    if (window.sendMuteStateUpdate) {
        window.sendMuteStateUpdate(!isAudioInputEnabled);
    }
    
    // Update lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

export function toggleAudioMonitor() {
    const button = document.getElementById('monitorToggle');
    const isMonitoring = button.classList.toggle('active');
    const volume = document.getElementById('monitorVolume').value;
    
    if (isMonitoring) {
        button.innerHTML = '<i data-lucide="volume-2"></i>';
        if (monitorGainNode && audioContext) {
            monitorGainNode.gain.setValueAtTime(volume / 100, audioContext.currentTime);
        }
        window.updateStatus && window.updateStatus('Audio monitoring enabled');
    } else {
        button.innerHTML = '<i data-lucide="volume-x"></i>';
        if (monitorGainNode && audioContext) {
            monitorGainNode.gain.setValueAtTime(0, audioContext.currentTime);
        }
        window.updateStatus && window.updateStatus('Audio monitoring disabled');
    }
    
    // Update lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

export function updateMonitorVolume(value) {
    document.getElementById('volumeValue').textContent = `${value}%`;
    const monitorToggle = document.getElementById('monitorToggle');
    if (monitorToggle.classList.contains('active') && monitorGainNode && audioContext) {
        monitorGainNode.gain.setValueAtTime(value / 100, audioContext.currentTime);
    }
}

export function cleanupAudioMonitoring() {
    if (meterUpdateInterval) {
        clearInterval(meterUpdateInterval);
        meterUpdateInterval = null;
    }
    
    if (audioMeter) {
        audioMeter.disconnect();
        audioMeter = null;
    }
    
    if (monitorGainNode) {
        monitorGainNode.disconnect();
        monitorGainNode = null;
    }
    
    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
    }
}

// Export for global access
export { isAudioInputEnabled };