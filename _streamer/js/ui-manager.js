/**
 * UI Manager - Handles UI updates and status messages
 */

export function updateStatus(message, isError = false) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status' + (isError ? ' error' : '');
        console.log(`Status: ${message}`);
        
        // Add temporary highlight for important device changes
        if (message.includes('device') || message.includes('Studio Sound') || message.includes('disconnected')) {
            statusElement.style.animation = 'statusPulse 1s ease-out';
            setTimeout(() => {
                statusElement.style.animation = '';
            }, 1000);
        }
    } else {
        console.log(`Status update failed - element not found. Message: ${message}`);
    }
}

export function initializeUI() {
    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Ensure Load Devices button is always enabled on page load
    const loadDevicesButton = document.getElementById('loadDevicesButton');
    if (loadDevicesButton) {
        loadDevicesButton.disabled = false;
        console.log('Load Devices button enabled and ready');
    }

    // Set up event handlers for UI elements
    setupEventHandlers();

    // Apply any URL parameters to UI
    applyUrlParameters();
}

function setupEventHandlers() {
    // Video codec change handler
    const videoCodecSelect = document.getElementById('videoCodec');
    if (videoCodecSelect) {
        videoCodecSelect.addEventListener('change', function() {
            let message = `Video codec changed to ${this.value}`;
            
            // Add helpful info for AV1
            if (this.value === 'AV1') {
                const av1Supported = RTCRtpSender.getCapabilities?.('video')?.codecs?.some(
                    codec => codec.mimeType === 'video/AV01'
                );
                if (!av1Supported) {
                    message += ' (AV1 may not be supported by this browser)';
                } else {
                    message += ' (Next-gen codec for superior compression)';
                }
            }
            
            updateStatus(message);
        });
    }
    
    // Bitrate change handler
    const bitrateSelect = document.getElementById('videoBitrate');
    if (bitrateSelect) {
        bitrateSelect.addEventListener('change', async function() {
            updateStatus(`Video bitrate changed to ${this.value / 1000} Mbps`);
            
            // If streaming, update bitrate immediately
            if (window.whipClient && window.whipClient.videoSender) {
                await window.whipClient.enforceBitrate();
            }
        });
    }
    
    // Resolution change handler
    const resolutionSelect = document.getElementById('resolution');
    if (resolutionSelect) {
        resolutionSelect.addEventListener('change', function() {
            updateStatus(`Resolution changed to ${this.value}`);
        });
    }
    
    // FPS change handler
    const fpsSelect = document.getElementById('fps');
    if (fpsSelect) {
        fpsSelect.addEventListener('change', function() {
            updateStatus(`Frame rate changed to ${this.value} fps`);
        });
    }
}

function applyUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Apply bitrate parameter
    if (urlParams.has('bitrate')) {
        const bitrate = parseInt(urlParams.get('bitrate')) * 1000;
        const bitrateSelect = document.getElementById('videoBitrate');
        if (bitrateSelect) {
            // Find closest matching option
            const options = Array.from(bitrateSelect.options);
            const closest = options.reduce((prev, curr) => {
                return (Math.abs(curr.value - bitrate) < Math.abs(prev.value - bitrate) ? curr : prev);
            });
            bitrateSelect.value = closest.value;
            console.log(`Setting bitrate to ${closest.value / 1000} Mbps`);
        }
    }
    
    // Apply studio sound parameter
    if (urlParams.has('studiosound')) {
        const studioSound = urlParams.get('studiosound').toLowerCase() === 'on';
        const studioSoundCheckbox = document.getElementById('studioSound');
        if (studioSoundCheckbox) {
            studioSoundCheckbox.checked = studioSound;
            console.log(`Setting studio sound to ${studioSound ? 'on' : 'off'}`);
        }
    }
    
    // Apply resolution parameter
    if (urlParams.has('resolution')) {
        const resolution = urlParams.get('resolution').toLowerCase();
        const resolutionSelect = document.getElementById('resolution');
        if (resolutionSelect) {
            resolutionSelect.value = resolution;
            console.log(`Setting resolution to ${resolution}`);
        }
    }
    
    // Apply simulcast parameter
    if (urlParams.has('simulcast')) {
        const simulcast = urlParams.get('simulcast').toLowerCase() === 'on';
        const simulcastCheckbox = document.getElementById('simulcast');
        if (simulcastCheckbox) {
            simulcastCheckbox.checked = simulcast;
            console.log(`Setting simulcast to ${simulcast ? 'on' : 'off'}`);
        }
    }
}

export function showStreamingUI() {
    document.getElementById('startButton').disabled = true;
    document.getElementById('stopButton').disabled = false;
    document.getElementById('startButton').classList.add('active');
}

export function showStoppedUI() {
    document.getElementById('startButton').disabled = false;
    document.getElementById('stopButton').disabled = true;
    document.getElementById('startButton').classList.remove('active');
}

export function disableDeviceControls() {
    document.getElementById('videoSource').disabled = true;
    document.getElementById('audioSource').disabled = true;
    document.getElementById('videoCodec').disabled = true;
    document.getElementById('videoBitrate').disabled = true;
    document.getElementById('resolution').disabled = true;
    document.getElementById('fps').disabled = true;
}

export function enableDeviceControls() {
    document.getElementById('videoSource').disabled = false;
    document.getElementById('audioSource').disabled = false;
    document.getElementById('videoCodec').disabled = false;
    document.getElementById('videoBitrate').disabled = false;
    document.getElementById('resolution').disabled = false;
    document.getElementById('fps').disabled = false;
}

export function updateVideoPreview(stream) {
    const videoPreview = document.getElementById('videoPreview');
    if (videoPreview && stream) {
        videoPreview.srcObject = stream;
    }
}