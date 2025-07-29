/**
 * Utilities - Helper functions and URL parsing
 */

export function parseWhipEndpoint() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // SIMPLE: If room is in URL, use it. If participantId is in URL, use it. DONE!
    const room = urlParams.get('room') || generateDemoRoomName();
    const participantId = urlParams.get('participantId') || autoAssignStreamerSlot(room);
    
    console.log('Room and participant:', { room, participantId });
    
    // Build WHIP endpoint
    const whipEndpointUrl = `https://stream.voodoostudios.tv/${room}/${participantId}/whip`;
    console.log('WHIP endpoint:', whipEndpointUrl);
    
    // Set the input
    const whipInput = document.getElementById('whipEndpoint');
    if (whipInput) {
        whipInput.value = whipEndpointUrl;
    }
    
    // Store globals
    window.room = room;
    window.participantId = participantId;
    window.serverParam = 'east';
    
    return whipEndpointUrl;
}

export function getResolutionConstraints(resolution) {
    const res = resolution || document.getElementById('resolution')?.value || '1080p';
    
    switch (res) {
        case '2160p':
            return { width: { ideal: 3840 }, height: { ideal: 2160 } };
        case '1440p':
            return { width: { ideal: 2560 }, height: { ideal: 1440 } };
        case '1080p':
            return { width: { ideal: 1920 }, height: { ideal: 1080 } };
        case '720p':
            return { width: { ideal: 1280 }, height: { ideal: 720 } };
        case '540p':
            return { width: { ideal: 960 }, height: { ideal: 540 } };
        case '480p':
            return { width: { ideal: 854 }, height: { ideal: 480 } };
        case '360p':
            return { width: { ideal: 640 }, height: { ideal: 360 } };
        default:
            return { width: { ideal: 1920 }, height: { ideal: 1080 } };
    }
}

export function validateAudioDevice(device) {
    return new Promise((resolve) => {
        if (!device || !device.deviceId) {
            resolve(false);
            return;
        }
        
        // Simple validation - just check if device has a valid ID and label
        const isValid = device.deviceId !== '' && 
                       device.deviceId !== 'default' && 
                       device.label && 
                       device.label !== '';
        
        resolve(isValid);
    });
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function formatBitrate(bps) {
    if (bps >= 1000000) {
        return `${(bps / 1000000).toFixed(1)} Mbps`;
    } else if (bps >= 1000) {
        return `${(bps / 1000).toFixed(0)} kbps`;
    } else {
        return `${bps} bps`;
    }
}

export function isPortrait() {
    return window.innerHeight > window.innerWidth;
}

export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function hasWebRTCSupport() {
    return !!(navigator.mediaDevices && 
             navigator.mediaDevices.getUserMedia && 
             window.RTCPeerConnection);
}

// Auto-assign streamer slot (streamer1 to streamer10)
function autoAssignStreamerSlot(room) {
    const MAX_STREAMERS = 10;
    
    // First check if this browser session already has an assigned slot for this room
    const sessionKey = `current_participant_${room}`;
    const existingParticipant = sessionStorage.getItem(sessionKey);
    
    if (existingParticipant) {
        console.log(`Reusing existing participant ID: ${existingParticipant} for room: ${room}`);
        return existingParticipant;
    }
    
    // Use localStorage to track the next available slot per room
    const storageKey = `streamer_counter_${room}`;
    let nextSlot = parseInt(localStorage.getItem(storageKey) || '1');
    
    // If we've reached the max, cycle back to 1
    if (nextSlot > MAX_STREAMERS) {
        nextSlot = 1;
    }
    
    const assignedSlot = `streamer${nextSlot}`;
    
    // Store this assignment for the current session
    sessionStorage.setItem(sessionKey, assignedSlot);
    
    // Store the next slot number for the next streamer
    localStorage.setItem(storageKey, (nextSlot + 1).toString());
    
    console.log(`Auto-assigned NEW sequential slot: ${assignedSlot} for room: ${room} (next will be streamer${nextSlot + 1})`);
    
    return assignedSlot;
}

// Reset streamer counter for a room (called from producer)
export function resetStreamerCounter(room) {
    const storageKey = `streamer_counter_${room}`;
    localStorage.removeItem(storageKey);
    console.log(`Reset streamer counter for room: ${room} - next assignment will start from streamer1`);
}

// Generate unique demo room name
function generateDemoRoomName() {
    // Get current demo counter from localStorage
    const demoCounterKey = 'voodoo_demo_counter';
    let demoCounter = parseInt(localStorage.getItem(demoCounterKey) || '1');
    
    // Generate room name
    const demoRoom = `demo${demoCounter}`;
    demoCounter++;
    
    // Store the incremented counter
    localStorage.setItem(demoCounterKey, demoCounter.toString());
    
    console.log(`Generated demo room: ${demoRoom} (counter now at: ${demoCounter})`);
    return demoRoom;
}