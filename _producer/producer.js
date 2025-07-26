// Get room from URL
const urlParams = new URLSearchParams(window.location.search);
let room = urlParams.get('room') || 'default';
let socket = null;
const streams = new Map();
let isClientMode = false;
let clientData = null;

// Check if client mode and set restrictions
if (window.VoodooAuth && window.getSessionData) {
    const session = getSessionData();
    if (session && session.userType === 'client') {
        isClientMode = true;
        clientData = session.clientData;
        // Force room to client's assigned room
        room = clientData.room;
        console.log(`Client mode active: ${clientData.name}, room: ${room}`);
    }
}

// Initialize room input with URL parameter or default
document.getElementById('roomInput').value = room;

// Disable room input for clients
if (isClientMode) {
    document.getElementById('roomInput').disabled = true;
}

function log(msg) {
    const logEl = document.getElementById('log');
    const time = new Date().toTimeString().split(' ')[0];
    logEl.innerHTML += `[${time}] ${msg}<br>`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(msg);
}

// Sanitize streamId for use in HTML element IDs
function sanitizeId(streamId) {
    // Replace forward slashes with underscores for valid HTML IDs
    return streamId.replace(/\//g, '_');
}

function handleConnectionClick() {
    const button = document.getElementById('connectionStatus');
    const roomInput = document.getElementById('roomInput');
    
    if (socket && socket.connected) {
        // Disconnect
        disconnect();
    } else {
        // Get room name from input
        const newRoom = roomInput.value.trim();
        if (!newRoom) {
            log('Please enter a room name');
            roomInput.focus();
            return;
        }
        
        // Update room and connect
        room = newRoom;
        connect();
    }
}

function disconnect() {
    if (socket) {
        log('Disconnecting from Socket.io...');
        socket.disconnect();
        socket = null;
    }

    // Clear all streams
    streams.clear();
    showEmptyState();

    // Update UI
    const button = document.getElementById('connectionStatus');
    button.textContent = 'Connect';
    button.classList.remove('connected');
    document.getElementById('currentRoom').style.display = 'none';
    document.getElementById('inviteSection').classList.remove('active');
    document.getElementById('roomInput').disabled = false;
}

function connect() {
    log(`Connecting to Socket.io for room: ${room}...`);
    
    // Update UI
    document.getElementById('connectionStatus').textContent = 'Connecting...';
    document.getElementById('roomInput').disabled = true;

    // Determine WebSocket server based on environment
    const isLocal = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.startsWith('192.168.') ||
                   window.location.hostname.startsWith('10.') ||
                   window.location.hostname.startsWith('172.');
    
    const wsUrl = isLocal ? 'ws://localhost:3000' : 'wss://ws.streamless.io';
    
    log(`Connecting to WebSocket server at: ${wsUrl}`);
    
    socket = io(wsUrl, {
        transports: ['websocket'],
        timeout: 20000,
        forceNew: true
    });

    socket.on('connect', () => {
        log('Connected to Socket.io');
        document.getElementById('connectionStatus').textContent = 'Disconnect';
        document.getElementById('connectionStatus').classList.add('connected');

        // Show current room and invite section
        document.getElementById('roomName').textContent = room;
        document.getElementById('currentRoom').style.display = 'block';
        document.getElementById('inviteSection').classList.add('active');

        // Join room
        socket.emit('join-room', {
            room: room,
            role: 'producer',
            participantId: 'producer',
            participantName: 'Producer Dashboard'
        });
        log(`Joined room: ${room} - waiting for room state sync...`);
    });

    socket.on('connect_error', (error) => {
        log(`Connection error: ${error.message}`);
        document.getElementById('connectionStatus').textContent = 'Connect';
        document.getElementById('connectionStatus').classList.remove('connected');
        document.getElementById('roomInput').disabled = false;
    });

    socket.on('disconnect', (reason) => {
        log(`Disconnected from Socket.io: ${reason}`);
        document.getElementById('connectionStatus').textContent = 'Connect';
        document.getElementById('connectionStatus').classList.remove('connected');
        document.getElementById('currentRoom').style.display = 'none';
        document.getElementById('roomInput').disabled = false;
    });

    // Listen for room state (sent when joining room)
    socket.on('room-state', (data) => {
        log(`Received room state: ${data.streams.length} streams, ${data.participants.length} participants`);
        handleRoomState(data);
    });

    // Listen for streams
    socket.on('stream-registered', (data) => {
        log(`Stream registered: ${data.streamId}`);

        // Add room info if missing
        if (!data.room) {
            data.room = room;
        }
        addStream(data);
    });

    // Listen for both possible event names
    socket.on('stream-status-update', handleStreamStatus);
    socket.on('stream-status', handleStreamStatus);

    function handleStreamStatus(data) {
        log(`Stream ${data.streamId} status: ${data.status}`);

        // If we don't have this stream yet, add it first
        if (!streams.has(data.streamId)) {
            log(`Stream ${data.streamId} not found, adding it first`);
            addStream({
                streamId: data.streamId,
                streamName: `${data.streamId}'s Stream`,
                status: data.status,
                room: room
            });
        }

        updateStreamStatus(data.streamId, data.status);

        // Auto-start preview when streamer begins streaming
        if (data.status === 'streaming') {
            log(`Auto-starting preview for ${data.streamId}`);
            // Update buttons immediately
            updateStreamButtons(data.streamId, 'streaming');
            // Start preview immediately
            startPreview(data.streamId);
        } else if (data.status === 'stopped') {
            stopPreview(data.streamId);
            updateStreamButtons(data.streamId, 'stopped');
        }
    }

    socket.on('stream-removed', (data) => {
        log(`Stream removed: ${data.streamId}`);
        removeStream(data.streamId);
    });
    
    // Handle video device changes from streamers
    socket.on('stream-video-device-change', (data) => {
        log(`Stream ${data.streamId} changed video device to: ${data.deviceLabel}`);
        
        // Update the stream card UI if it exists
        const streamCard = document.querySelector(`[data-stream-id="${data.streamId}"]`);
        if (streamCard) {
            const deviceInfo = streamCard.querySelector('.device-info');
            if (deviceInfo) {
                // Update or create video device info display
                let videoInfo = deviceInfo.querySelector('.video-device-info');
                if (!videoInfo) {
                    videoInfo = document.createElement('div');
                    videoInfo.className = 'video-device-info';
                    deviceInfo.appendChild(videoInfo);
                }
                
                const icon = data.isScreenShare ? 'Screen' : 'Camera';
                videoInfo.textContent = `${icon}: ${data.deviceLabel}`;
                videoInfo.style.fontSize = '11px';
                videoInfo.style.opacity = '0.8';
                videoInfo.style.marginTop = '4px';
                
                // Add screen share indicator if needed
                if (data.isScreenShare) {
                    streamCard.classList.add('screen-sharing');
                } else {
                    streamCard.classList.remove('screen-sharing');
                }
            }
        }
    });

    socket.on('participant-left', (data) => {
        log(`Participant left: ${data.participantId}`);
    });
}

function handleRoomState(data) {
    log(`ROOM STATE SYNC: Processing ${data.streams.length} existing streams`);

    if (data.streams.length === 0) {
        log(`No existing streams in room ${room}`);
        return;
    }

    // Process existing streams
    data.streams.forEach(streamInfo => {
        log(`Found existing stream: ${streamInfo.streamId} (status: ${streamInfo.status})`);

        // Add room info if missing
        if (!streamInfo.room) {
            streamInfo.room = room;
        }

        // Add the stream to our local state
        if (!streams.has(streamInfo.streamId)) {
            streams.set(streamInfo.streamId, {
                streamId: streamInfo.streamId,
                streamName: streamInfo.streamName || `${streamInfo.streamId}'s Stream`,
                status: streamInfo.status,
                room: streamInfo.room || room
            });
        }

        // Set up proper button states and auto-start previews for active streams
        if (streamInfo.status === 'streaming') {
            log(`Auto-starting preview for active stream: ${streamInfo.streamId}`);
            startPreview(streamInfo.streamId);
            updateStreamButtons(streamInfo.streamId, 'streaming');
        } else {
            // Ensure buttons are in correct state for non-streaming streams
            updateStreamButtons(streamInfo.streamId, streamInfo.status);
        }
    });

    // Render all streams (this will use smart rendering)
    renderStreamsSmartly();

    log(`Room state sync complete. Total streams: ${streams.size}`);
}

function addStream(streamData) {
    if (streams.has(streamData.streamId)) return;

    // Ensure stream has room info
    if (!streamData.room) {
        streamData.room = room;
    }

    streams.set(streamData.streamId, streamData);

    // Use smart rendering that preserves existing streams
    renderStreamsSmartly();
}

function updateStreamStatus(streamId, status) {
    const stream = streams.get(streamId);
    if (stream) {
        stream.status = status;
        const safeId = sanitizeId(streamId);
        const statusEl = document.querySelector(`#stream-${safeId} .stream-status`);
        if (statusEl) {
            statusEl.textContent = status.toUpperCase();
            statusEl.className = `stream-status ${status}`;
        }
    }
}

function updateStreamButtons(streamId, status) {
    const safeId = sanitizeId(streamId);
    const startBtn = document.getElementById(`start-${safeId}`);
    const stopBtn = document.getElementById(`stop-${safeId}`);

    log(`Updating buttons for ${streamId} to status: ${status}`);

    if (startBtn && stopBtn) {
        if (status === 'streaming' || status === 'starting') {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            log(`Buttons updated: Start disabled, Stop enabled`);
        } else if (status === 'stopping') {
            startBtn.disabled = true;
            stopBtn.disabled = true;
            stopBtn.textContent = 'Stopping...';
            log(`Buttons updated: Both disabled, showing stopping`);
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            stopBtn.textContent = 'Stop';
            log(`Buttons updated: Start enabled, Stop disabled`);
        }
    } else {
        log(`ERROR: Buttons not found for ${streamId}!`);
    }
}

function removeStream(streamId) {
    streams.delete(streamId);

    // Free up the streamer slot for reuse (only for auto-assigned slots)
    if (streamId.match(/^streamer\d+$/)) {
        assignedSlots.delete(streamId);
        log(`Freed up slot: ${streamId}`);
    }

    // Remove the specific stream card without affecting others
    const safeId = sanitizeId(streamId);
    const streamCard = document.getElementById(`stream-${safeId}`);
    if (streamCard) {
        streamCard.remove();
    }

    // Check if we need to show empty state
    if (streams.size === 0) {
        showEmptyState();
    }
}

function showEmptyState() {
    const container = document.getElementById('streamsContainer');
    container.innerHTML = `
        <div class="empty-state">
            <p>No streams connected yet</p>
            <p style="font-size: 14px; margin-top: 10px;">Waiting for streamers to join...</p>
        </div>
    `;
}

function createStreamCard(stream, streamId) {
    const safeId = sanitizeId(streamId);
    const card = document.createElement('div');
    card.className = 'stream-card active';
    card.id = `stream-${safeId}`;
    card.setAttribute('data-stream-id', streamId); // Store original ID
    card.innerHTML = `
        <div class="stream-name">${stream.streamName || streamId}</div>
        <div class="stream-status ${stream.status}">${stream.status.toUpperCase()}</div>
        <div class="stream-preview" id="preview-${safeId}">
            <video id="video-${safeId}" style="width: 100%; height: 100%; object-fit: contain; display: none;" muted autoplay playsinline></video>
            <div class="stream-placeholder" id="placeholder-${safeId}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-color); text-align: center; gap: 10px;">
                <span id="placeholder-text-${safeId}">Waiting for stream...</span>
                <button onclick="startPreview('${streamId}')" style="padding: 8px 16px; background: var(--accent-blue); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; display: none;" id="connect-btn-${safeId}">Connect</button>
            </div>
        </div>


        <div class="stream-controls">
            <button class="start-btn" id="start-${safeId}" onclick="startStream('${streamId}')">Start</button>
            <button class="stop-btn" id="stop-${safeId}" onclick="stopStream('${streamId}')" disabled>Stop</button>
            <button class="obs-btn" id="obs-${safeId}" onclick="copyStreamLink('${streamId}')" title="Copy stream link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                Link
            </button>
            <button class="close-btn" id="close-${safeId}" onclick="closeSession('${streamId}')" title="Force close session and disconnect streamer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                End
            </button>
        </div>
    `;
    return card;
}

function renderStreamsSmartly() {
    const container = document.getElementById('streamsContainer');

    // If no streams, show empty state
    if (streams.size === 0) {
        showEmptyState();
        return;
    }

    // Remove empty state if it exists
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Add only new stream cards that don't exist yet
    streams.forEach((stream, streamId) => {
        const safeId = sanitizeId(streamId);
        const existingCard = document.getElementById(`stream-${safeId}`);
        if (!existingCard) {
            log(`Adding new stream card for ${streamId} without affecting existing streams`);
            const newCard = createStreamCard(stream, streamId);
            container.appendChild(newCard);
        } else {
            // Update existing card status if needed (without destroying the preview)
            const statusEl = existingCard.querySelector('.stream-status');
            if (statusEl && statusEl.textContent !== stream.status.toUpperCase()) {
                statusEl.textContent = stream.status.toUpperCase();
                statusEl.className = `stream-status ${stream.status}`;
            }
        }
    });

    // Create lucide icons for any new elements
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Keep the old renderStreams function for cases where full rebuild is needed
function renderStreams() {
    const container = document.getElementById('streamsContainer');

    if (streams.size === 0) {
        showEmptyState();
        return;
    }

    container.innerHTML = '';
    streams.forEach((stream, streamId) => {
        const card = createStreamCard(stream, streamId);
        container.appendChild(card);
    });

    // Create lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function startStream(streamId) {
    log(`Sending START command to ${streamId}`);
    socket.emit('producer-command', {
        command: 'START_STREAM',
        streamId: streamId
    });

    // Update button states
    updateStreamButtons(streamId, 'starting');

    // Preview will auto-start when we receive 'streaming' status from streamer
}

function stopStream(streamId) {
    log(`Sending STOP command to ${streamId}`);
    socket.emit('producer-command', {
        command: 'STOP_STREAM',
        streamId: streamId
    });

    // Update button states to show stopping in progress
    updateStreamButtons(streamId, 'stopping');
    
    // Don't stop preview or set to 'stopped' immediately
    // Wait for status update from voodoostreamer to confirm it actually stopped
}

function startPreview(streamId) {
    const stream = streams.get(streamId);
    if (!stream) return;

    const roomName = stream.room || room || 'rolluptv';

    // Use default East Coast server
    const streamServer = 'https://live.voodoostudios.tv';
    const playbackUrl = `${streamServer}/${roomName}/${streamId}`;

    log(`Starting iframe preview for ${streamId}: ${playbackUrl}`);

    const safeId = sanitizeId(streamId);
    const previewEl = document.getElementById(`preview-${safeId}`);
    const videoEl = document.getElementById(`video-${safeId}`);
    const placeholderEl = document.getElementById(`placeholder-${safeId}`);

    if (previewEl && videoEl && placeholderEl) {
        previewEl.classList.add('active');

        // Hide placeholder
        placeholderEl.style.display = 'none';

        // Create iframe if it doesn't exist
        let iframeEl = document.getElementById(`iframe-${safeId}`);
        if (!iframeEl) {
            iframeEl = document.createElement('iframe');
            iframeEl.id = `iframe-${safeId}`;
            iframeEl.style.cssText = 'width: 100%; height: 100%; border: none;';
            previewEl.appendChild(iframeEl);
        }

        iframeEl.src = playbackUrl;
        iframeEl.style.display = 'block';

        log(`Preview started for ${streamId}`);
    }
}

function stopPreview(streamId) {
    const safeId = sanitizeId(streamId);
    const previewEl = document.getElementById(`preview-${safeId}`);
    const iframeEl = document.getElementById(`iframe-${safeId}`);
    const placeholderEl = document.getElementById(`placeholder-${safeId}`);

    if (previewEl && placeholderEl) {
        previewEl.classList.remove('active');

        // Stop iframe
        if (iframeEl) {
            iframeEl.src = '';
            iframeEl.style.display = 'none';
        }

        // Show placeholder
        placeholderEl.style.display = 'flex';
    }
}

// Automatic streamer slot assignment (streamer1 to streamer10)
const MAX_STREAMERS = 10;
const assignedSlots = new Set(); // Track assigned streamer slots
let inviteCounter = 1; // Counter for manual mode fallback

function generateInviteLink() {
    if (!socket || !socket.connected) {
        log('Please connect to a room first');
        return;
    }

    // Check client restrictions
    if (isClientMode && clientData.maxStreamers) {
        const currentStreamerCount = streams.size;
        if (currentStreamerCount >= clientData.maxStreamers) {
            log(`Maximum streamers reached (${currentStreamerCount}/${clientData.maxStreamers}). Cannot generate more invites.`);
            alert(`Maximum streamers reached (${currentStreamerCount}/${clientData.maxStreamers})`);
            return;
        }
    }

    const selectedServer = 'https://live.voodoostudios.tv';
    const autoAssignMode = document.getElementById('autoAssignToggle').checked;
    
    let streamerName = null;

    if (autoAssignMode) {
        // Automatic assignment mode (streamer1, streamer2, etc.)
        for (let i = 1; i <= MAX_STREAMERS; i++) {
            const slotName = `streamer${i}`;
            if (!assignedSlots.has(slotName) && !streams.has(slotName)) {
                streamerName = slotName;
                assignedSlots.add(slotName);
                break;
            }
        }

        // Check if we've reached the limit
        if (!streamerName) {
            log('Maximum streamers reached (10/10). Please remove some streamers first.');
            return;
        }
    } else {
        // Manual assignment mode (original behavior)
        const streamerNameInput = document.getElementById('streamerNameInput');
        streamerName = streamerNameInput.value.trim();
        
        // Generate default name if none provided
        if (!streamerName) {
            streamerName = `stream${inviteCounter}`;
            inviteCounter++;
            log(`No name provided, using default: ${streamerName}`);
        }
    }

    // Build the invite URL
    let inviteUrl;

    // Check if running locally (localhost, 127.0.0.1, or local network IP)
    const isLocal = window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.startsWith('192.168.') ||
                   window.location.hostname.startsWith('10.') ||
                   window.location.hostname.startsWith('172.');

    if (autoAssignMode) {
        // Auto-assign mode: Simple invite URL without participantId
        if (isLocal) {
            // Local testing
            const currentHost = window.location.hostname;
            const currentPort = window.location.port || '8080';
            inviteUrl = `http://${currentHost}:${currentPort}/voodoostreamer/?room=${encodeURIComponent(room)}`;
        } else {
            // Production
            inviteUrl = `https://streamless.io/voodoostreamer/?room=${encodeURIComponent(room)}`;
        }
    } else {
        // Manual mode: Include participantId in URL
        if (isLocal) {
            // Local testing - point to local VoodooSidebar
            const currentHost = window.location.hostname;
            const currentPort = window.location.port || '8080';
            inviteUrl = `http://${currentHost}:${currentPort}/voodoostreamer/?room=${encodeURIComponent(room)}&participantId=${encodeURIComponent(streamerName)}`;
        } else {
            // Production - point to VoodooSidebar
            inviteUrl = `https://streamless.io/voodoostreamer/?room=${encodeURIComponent(room)}&participantId=${encodeURIComponent(streamerName)}`;
        }
    }

    // Generate WHIP endpoint for logging
    const whipEndpoint = `${selectedServer}/${room}/${streamerName}/whip`;


    // Copy to clipboard
    navigator.clipboard.writeText(inviteUrl).then(() => {
        const serverName = 'East Coast';
        
        if (autoAssignMode) {
            log(`Auto-assigned slot "${streamerName}" - copied simple invite link:`);
            log(`${inviteUrl}`);
            log(`WHIP endpoint will be: ${whipEndpoint}`);
            log(`Streamers will auto-join with streamer1, streamer2, etc.`);
        } else {
            log(`Copied invite link for "${streamerName}": ${inviteUrl}`);
            log(`WHIP endpoint will be: ${whipEndpoint}`);
        }

        // Visual feedback
        const inviteBtn = document.getElementById('inviteBtn');
        const originalText = inviteBtn.textContent;
        inviteBtn.textContent = 'Copied!';
        inviteBtn.classList.add('copied');

        // Clear manual input if in manual mode
        if (!autoAssignMode) {
            const streamerNameInput = document.getElementById('streamerNameInput');
            if (streamerNameInput) {
                streamerNameInput.value = '';
            }
        }

        // Reset button immediately
        inviteBtn.textContent = originalText;
        inviteBtn.classList.remove('copied');
    }).catch(err => {
        log(`Failed to copy invite link: ${err}`);
        // Fallback - show in alert
        alert(`Invite link for "${streamerName}":\n${inviteUrl}`);
    });
}

function generateGuestInvite() {
    // Get current room from input if not connected
    let currentRoom = room;
    if (!socket || !socket.connected) {
        const roomInput = document.getElementById('roomInput');
        if (roomInput && roomInput.value.trim()) {
            currentRoom = roomInput.value.trim();
        }
    }

    // Generate guest meeting invite URL using the current room
    const guestInviteUrl = `https://meet.streamless.io/${encodeURIComponent(currentRoom)}?role=guest`;

    // Copy to clipboard
    navigator.clipboard.writeText(guestInviteUrl).then(() => {
        log(`Guest invite copied: ${guestInviteUrl}`);
        log(`Guests will join the meeting room with guest role`);

        // Visual feedback
        const guestInviteBtn = document.getElementById('guestInviteBtn');
        if (guestInviteBtn) {
            const originalText = guestInviteBtn.textContent;
            guestInviteBtn.textContent = 'Copied!';
            guestInviteBtn.classList.add('copied');

            // Reset button immediately
            guestInviteBtn.textContent = originalText;
            guestInviteBtn.classList.remove('copied');
        }
    }).catch(err => {
        log(`Failed to copy guest invite: ${err}`);
        // Fallback - show in alert
        alert(`Guest invite link:\n${guestInviteUrl}`);
    });
}

function copyStreamLink(streamId) {
    const stream = streams.get(streamId);
    if (!stream) {
        log(`ERROR: Stream ${streamId} not found`);
        return;
    }

    // Build the playback URL (not WHIP, but the public playback URL)
    const roomName = stream.room || room || 'rolluptv';

    // Use default East Coast server
    const streamServer = 'https://live.voodoostudios.tv';
    const playbackUrl = `${streamServer}/${roomName}/${streamId}`;

    // Copy to clipboard
    navigator.clipboard.writeText(playbackUrl).then(() => {
        log(`Copied playback link to clipboard: ${playbackUrl}`);

        // Visual feedback - change button temporarily
        const safeId = sanitizeId(streamId);
        const linkBtn = document.getElementById(`obs-${safeId}`);
        if (linkBtn) {
            const originalHTML = linkBtn.innerHTML;
            linkBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied!
            `;
            linkBtn.classList.add('active');

            // Reset immediately
            linkBtn.innerHTML = originalHTML;
            linkBtn.classList.remove('active');
        }
    }).catch(err => {
        log(`Failed to copy to clipboard: ${err}`);
        // Fallback - show the URL in an alert
        alert(`Stream playback URL:\n${playbackUrl}`);
    });
}

function closeSession(streamId) {
    // Disable force close for demo clients
    if (isClientMode) {
        log('Force close is disabled for demo accounts');
        alert('Force close is disabled for demo accounts');
        return;
    }

    log(`FORCE CLOSING session for ${streamId}`);

    // Show confirmation dialog for safety
    const stream = streams.get(streamId);
    const streamName = stream ? (stream.streamName || streamId) : streamId;

    if (!confirm(`Are you sure you want to force close the session for "${streamName}"?\n\nThis will:\n• Immediately disconnect the streamer\n• End their stream permanently\n• Remove them from the room\n\nThis action cannot be undone.`)) {
        log(`Session close cancelled for ${streamId}`);
        return;
    }

    // Send FORCE_END_SESSION command (more aggressive than END_SESSION)
    const commandData = {
        command: 'FORCE_END_SESSION',
        streamId: streamId,
        reason: 'Producer force-closed session',
        timestamp: Date.now()
    };

    log(`Sending FORCE_END_SESSION command: ${JSON.stringify(commandData)}`);
    socket.emit('producer-command', commandData);

    // Also send the old command for backward compatibility
    socket.emit('producer-command', {
        command: 'END_SESSION',
        streamId: streamId
    });

    // Stop preview immediately
    stopPreview(streamId);

    // Update UI immediately - make it clear the session is being terminated
    const safeId = sanitizeId(streamId);
    const startBtn = document.getElementById(`start-${safeId}`);
    const stopBtn = document.getElementById(`stop-${safeId}`);
    const obsBtn = document.getElementById(`obs-${safeId}`);
    const closeBtn = document.getElementById(`close-${safeId}`);

    // Disable all control buttons
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.3';
    }
    if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.3';
    }
    if (obsBtn) {
        obsBtn.disabled = true;
        obsBtn.style.opacity = '0.3';
    }

    // Update close button to show termination status
    if (closeBtn) {
        closeBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            Terminated
        `;
        closeBtn.disabled = true;
        closeBtn.style.background = 'var(--accent-red)';
        closeBtn.style.color = 'white';
        closeBtn.style.opacity = '0.8';
        closeBtn.style.cursor = 'not-allowed';
    }

    // Update stream status immediately
    updateStreamStatus(streamId, 'terminated');

    // Remove the stream card immediately
    log(`Removing terminated stream ${streamId} from UI`);
    removeStream(streamId);

    log(`Session termination initiated for ${streamId}.`);
}

// Toggle streamer input visibility based on assignment mode
function toggleStreamerInput() {
    const autoAssignMode = document.getElementById('autoAssignToggle').checked;
    const streamerNameInput = document.getElementById('streamerNameInput');
    const inviteBtn = document.getElementById('inviteBtn');

    if (autoAssignMode) {
        streamerNameInput.style.display = 'none';
        inviteBtn.textContent = 'Generate Simple Invite Link';
        log('Auto-assign mode enabled - streamers will be assigned automatically (streamer1, streamer2, etc.)');
    } else {
        streamerNameInput.style.display = 'inline-block';
        inviteBtn.textContent = 'Generate Invite Link';
        log('Manual mode enabled - you can specify custom streamer names');
    }

    // Guest invite button is always visible and doesn't change based on mode
}

// Add Enter key support for room input
document.getElementById('roomInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleConnectionClick();
    }
});

// Add Enter key support for streamer name input (only works in manual mode)
document.getElementById('streamerNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        generateInviteLink();
    }
});

// Add event listener for auto-assign toggle
document.addEventListener('DOMContentLoaded', () => {
    const autoAssignToggle = document.getElementById('autoAssignToggle');
    if (autoAssignToggle) {
        autoAssignToggle.addEventListener('change', toggleStreamerInput);
        // Set initial state
        toggleStreamerInput();
    }

    // Add event listener for guest invite button
    const guestInviteBtn = document.getElementById('guestInviteBtn');
    if (guestInviteBtn) {
        guestInviteBtn.addEventListener('click', generateGuestInvite);
    }
});

// Removed heartbeat system and inactive detection

// Reset streamer counter for current room
function resetStreamerCounter() {
    if (!room) {
        log('ERROR: Cannot reset counter - no room selected');
        return;
    }

    // Clear the counter from localStorage for all streamers that might visit
    // We need to simulate what the utils.js resetStreamerCounter function does
    const storageKey = `streamer_counter_${room}`;
    
    // Since this is the producer side, we'll send a signal to reset the counter
    // The actual reset happens when a new streamer visits the page
    log(`Resetting streamer counter for room: ${room}`);
    log(`Next auto-assigned streamer will be: streamer1`);
    
    // We could also emit a socket message to inform any connected streamers
    if (socket && socket.connected) {
        socket.emit('reset-streamer-counter', {
            room: room,
            timestamp: Date.now()
        });
    }
    
    // For immediate effect, we can also set a flag
    window.localStorage.setItem(`streamer_counter_${room}`, '1');
    
    log(`Streamer counter reset complete`);
}

// Make reset function globally accessible
window.resetStreamerCounter = resetStreamerCounter;

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Disconnect socket if connected
        if (socket && socket.connected) {
            disconnect();
        }
        
        // Clear session and redirect to login
        if (window.VoodooAuth) {
            window.VoodooAuth.clearSession();
        }
        window.location.href = 'login.html';
    }
}

// Check client expiration on load
if (window.VoodooAuth && window.VoodooAuth.checkClientExpiration) {
    window.VoodooAuth.checkClientExpiration();
}

// Auto-connect if room is specified in URL or client mode
if ((room && room !== 'default') || isClientMode) {
    connect();
}

// Cleanup inactive streams (placeholder function)
function cleanupInactiveStreams() {
    if (!socket || !socket.connected) {
        log('Please connect to a room first');
        return;
    }
    
    log('Cleaning up inactive streams...');
    
    // Get all streams that are not currently streaming
    const inactiveStreams = [];
    streams.forEach((stream, streamId) => {
        if (stream.status === 'stopped' || stream.status === 'ready') {
            inactiveStreams.push(streamId);
        }
    });
    
    if (inactiveStreams.length === 0) {
        log('No inactive streams to clean up');
        return;
    }
    
    // Confirm action
    if (!confirm(`Remove ${inactiveStreams.length} inactive streams from the room?`)) {
        return;
    }
    
    // Remove each inactive stream
    inactiveStreams.forEach(streamId => {
        log(`Removing inactive stream: ${streamId}`);
        removeStream(streamId);
        
        // Emit cleanup event to server
        socket.emit('producer-command', {
            command: 'CLEANUP_STREAM',
            streamId: streamId,
            reason: 'Producer cleanup inactive streams'
        });
    });
    
    log(`Cleaned up ${inactiveStreams.length} inactive streams`);
}

// Make functions globally accessible
window.handleConnectionClick = handleConnectionClick;
window.generateInviteLink = generateInviteLink;
window.generateGuestInvite = generateGuestInvite;
window.startStream = startStream;
window.stopStream = stopStream;
window.startPreview = startPreview;
window.stopPreview = stopPreview;
window.copyStreamLink = copyStreamLink;
window.closeSession = closeSession;
window.resetStreamerCounter = resetStreamerCounter;
window.cleanupInactiveStreams = cleanupInactiveStreams;
window.logout = logout;