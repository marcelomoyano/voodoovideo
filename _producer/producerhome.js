// Get room from URL
const urlParams = new URLSearchParams(window.location.search);
let room = urlParams.get('room') || 'default';
let socket = null;
let ably = null;
let ablyChannel = null;
const streams = new Map();
let userData = null;
let isClientMode = false;
let clientData = null;

// Direct WHEP connection management
const whepConnections = new Map(); // Store active WHEP connections
const audioContexts = new Map();   // Store Web Audio contexts
const gainNodes = new Map();       // Store gain nodes for volume control

// OBS Layout Control
let currentOBSLayout = []; // Array of streamIds currently in OBS layout
let obsControlChannel = null; // Separate channel for OBS control

// Load user data from session
function loadUserData() {
    // Get session data using the VoodooAuth fallback system
    const sessionData = window.getSessionData ? window.getSessionData() : null;
    
    if (!sessionData || !sessionData.userData) {
        console.error('No session data found, redirecting to login');
        window.location.href = 'login.html';
        return null;
    }
    
    try {
        userData = sessionData.userData;
        
        // Validate user data
        if (!userData.username || !userData.userType) {
            console.error('Invalid session data:', userData);
            window.location.href = 'login.html';
            return null;
        }
        
        console.log('User data loaded successfully:', userData);
        return userData;
    } catch (e) {
        console.error('Failed to parse user data', e);
        window.location.href = 'login.html';
        return null;
    }
}

// Initialize user interface
function initializeUserInterface() {
    if (!userData) return;
    
    // Update user info
    document.getElementById('clientName').textContent = userData.username;
    
    // Check if user has multiple rooms
    if (userData.rooms && userData.rooms.length > 0) {
        // Multi-room user
        const totalMaxStreamers = userData.rooms.reduce((sum, room) => sum + (room.maxStreamers || 5), 0);
        document.getElementById('roomCount').textContent = userData.rooms.length;
        document.getElementById('maxStreamersCount').textContent = totalMaxStreamers;
        
        // Populate room selector
        const selector = document.getElementById('roomSelector');
        selector.innerHTML = '<option value="">Choose a room...</option>';
        console.log('DEBUG: User rooms data:', userData.rooms); // Debug line
        userData.rooms.forEach(roomData => {
            const option = document.createElement('option');
            option.value = roomData.name;
            option.textContent = `${roomData.name} (${roomData.maxStreamers} streamers)`;
            selector.appendChild(option);
        });
        
        // Show room selection, hide manual input
        document.getElementById('roomSelection').style.display = 'block';
        document.getElementById('manualRoomInput').style.display = 'none';
        
    } else if (userData.room) {
        // Single room user (legacy format)
        document.getElementById('roomCount').textContent = '1';
        document.getElementById('maxStreamersCount').textContent = userData.maxStreamers || 5;
        
        // Pre-fill the manual input and hide room selector
        document.getElementById('roomSelection').style.display = 'none';
        document.getElementById('manualRoomInput').style.display = 'block';
        document.getElementById('roomInput').value = userData.room;
        room = userData.room;
        
    } else {
        // Admin or manual room entry
        document.getElementById('roomCount').textContent = 'Admin';
        document.getElementById('maxStreamersCount').textContent = '∞';
        
        // Show manual input
        document.getElementById('roomSelection').style.display = 'none';
        document.getElementById('manualRoomInput').style.display = 'block';
        document.getElementById('roomInput').value = room;
    }
}

// Load user data on page load
if (!loadUserData()) {
    // Redirect will happen in loadUserData()
} else {
    // Initialize the interface
    initializeUserInterface();
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
    if (ably && ably.connection.state === 'connected') {
        // Disconnect
        disconnect();
    } else {
        // Get room name from selector or manual input
        let newRoom;
        
        if (userData && userData.rooms && userData.rooms.length > 0) {
            // Multi-room user - get from selector
            const roomSelector = document.getElementById('roomSelector');
            newRoom = roomSelector.value;
            if (!newRoom) {
                log('Please select a room');
                return;
            }
        } else {
            // Single room or admin - get from manual input
            const roomInput = document.getElementById('roomInput');
            newRoom = roomInput.value.trim();
            if (!newRoom) {
                log('Please enter a room name');
                roomInput.focus();
                return;
            }
        }
        
        // Update room and connect
        room = newRoom;
        connect();
    }
}

async function disconnect() {
    log('Disconnecting from Ably...');
    
    // Clean up all WHEP connections first
    await cleanupAllWHEPConnections();
    
    if (ably) {
        // Unsubscribe from channels
        if (obsControlChannel) {
            obsControlChannel.unsubscribe();
        }
        if (ablyChannel) {
            ablyChannel.unsubscribe();
        }
        
        ably.close();
        ably = null;
        ablyChannel = null;
        obsControlChannel = null;
    }

    // Clear all streams and OBS layout
    streams.clear();
    currentOBSLayout = [];
    showEmptyState();

    // Update UI
    updateConnectionUI(false);
}

function connect() {
    log(`Connecting to room: ${room}...`);
    
    // Update UI
    document.getElementById('connectionStatus').textContent = 'Connecting...';
    document.getElementById('roomInput').disabled = true;

    // Initialize Ably
    ably = new Ably.Realtime('8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs');
    
    ably.connection.on('connected', () => {
        log('Connected to Ably');
        
        // Subscribe to room channel
        ablyChannel = ably.channels.get(room);
        
        // Subscribe to room-specific OBS control channel
        obsControlChannel = ably.channels.get(`obs-control-${room}`);
        
        // Listen for layout requests from OBS frames
        obsControlChannel.subscribe('request-layout', (msg) => {
            log('Received layout request from OBS frame');
            // Send current layout state
            if (currentOBSLayout.length > 0) {
                log(`Sending current layout with ${currentOBSLayout.length} streams`);
                setOBSLayout(currentOBSLayout);
            } else {
                log('No active layout to send');
            }
        });
        
        // Update UI elements
        updateConnectionUI(true);
        
        // Set up event listeners
        setupAblyEventListeners();
        
        log(`Connected to room: ${room} - requesting room state...`);
        
        // Request room state after a brief delay
        setTimeout(() => {
            log(`Requesting current room state for: ${room}`);
            ablyChannel.publish('producer-request', {
                command: 'GET_ROOM_STREAMS',
                room: room,
                requestId: Date.now()
            });
        }, 1000);

        // Also check for active MediaMTX streams - DISABLED FOR TESTING
        // setTimeout(() => {
        //     checkActiveStreams();
        // }, 2000);
    });

    ably.connection.on('failed', (error) => {
        log(`Connection failed: ${error.message}`);
        updateConnectionUI(false);
    });

    ably.connection.on('disconnected', () => {
        log(`Disconnected from Ably`);
        updateConnectionUI(false);
    });
}

function setupAblyEventListeners() {
    // Room state response
    ablyChannel.subscribe('room-streams-response', (msg) => {
        const data = msg.data;
        log(`Received room-streams-response: ${data.streams ? data.streams.length : 0} streams`);
        if (data.streams && Array.isArray(data.streams)) {
            data.streams.forEach(streamData => {
                addStream(streamData);
            });
        }
    });

    // Stream registered
    ablyChannel.subscribe('stream-registered', (msg) => {
        const data = msg.data;
        log(`[ABLY EVENT] Stream registered: ${data.streamId}`);
        
        // Check if this stream was recently terminated - don't re-add it
        const terminatedKey = `terminated_${room}_${data.streamId}`;
        const wasTerminated = sessionStorage.getItem(terminatedKey);
        
        if (wasTerminated) {
            log(`Ignoring stream-registered for terminated stream: ${data.streamId}`);
            return;
        }
        
        if (!data.room) {
            data.room = room;
        }
        addStream(data);
    });

    // Participant joined (when someone joins the meeting)
    ablyChannel.subscribe('participant-joined', (msg) => {
        const data = msg.data;
        log(`[ABLY EVENT] Participant joined: ${data.participantId} (role: ${data.role})`);
        
        // If it's a streamer, add them as a stream
        if (data.role === 'streamer' && data.participantId) {
            // Check if this stream was recently terminated - don't re-add it
            const terminatedKey = `terminated_${room}_${data.participantId}`;
            const wasTerminated = sessionStorage.getItem(terminatedKey);
            
            if (wasTerminated) {
                log(`Ignoring participant-joined for terminated stream: ${data.participantId}`);
                return;
            }
            
            const streamData = {
                streamId: data.participantId,
                streamName: data.participantName || `${data.participantId}'s Stream`,
                status: 'ready', // They joined but haven't started streaming yet
                room: room
            };
            
            log(`Adding streamer participant as stream: ${data.participantId}`);
            addStream(streamData);
        }
    });

    // Stream status updates
    ablyChannel.subscribe('stream-status-update', (msg) => {
        log(`[ABLY EVENT] Stream status update: ${msg.data.streamId} -> ${msg.data.status}`);
        
        // If status is 'ended', remove the stream
        if (msg.data.status === 'ended') {
            log(`Stream ${msg.data.streamId} ended - removing from producer`);
            removeStream(msg.data.streamId);
            // Mark as terminated to prevent re-adding
            const terminatedKey = `terminated_${room}_${msg.data.streamId}`;
            sessionStorage.setItem(terminatedKey, 'true');
        } else {
            handleStreamStatus(msg.data);
        }
    });

    // Stream removed
    ablyChannel.subscribe('stream-removed', (msg) => {
        log(`Stream removed: ${msg.data.streamId}`);
        removeStream(msg.data.streamId);
    });

    // Video device changes
    ablyChannel.subscribe('stream-video-device-change', (msg) => {
        const data = msg.data;
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

    // On-air state changes from other producers or sync
    ablyChannel.subscribe('stream-onair-update', (msg) => {
        const data = msg.data;
        log(`[ABLY EVENT] Stream on-air update: ${data.streamId} -> ${data.onAir ? 'ON AIR' : 'OFF AIR'}`);
        
        // Update stream data
        const stream = streams.get(data.streamId);
        if (stream) {
            stream.onAir = data.onAir;
            
            // Update button UI
            const safeId = sanitizeId(data.streamId);
            const onAirBtn = document.getElementById(`onair-${safeId}`);
            if (onAirBtn) {
                if (data.onAir) {
                    onAirBtn.innerHTML = '<i data-lucide="radio"></i> On Air';
                    onAirBtn.classList.add('active');
                    onAirBtn.style.background = 'var(--accent-green)';
                    onAirBtn.style.color = 'white';
                } else {
                    onAirBtn.innerHTML = '<i data-lucide="radio"></i> Off Air';
                    onAirBtn.classList.remove('active');
                    onAirBtn.style.background = '';
                    onAirBtn.style.color = '';
                }
                
                // Re-create lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        }
    });
}

// OBS Layout Control Functions
function setOBSLayout(streamIds) {
    if (!obsControlChannel) {
        log('OBS control channel not initialized');
        return;
    }
    
    // Convert streamIds to full paths with room prefix
    const layoutPaths = streamIds.map(id => `${room}/${id}`);
    
    log(`Setting OBS layout with streams: ${layoutPaths.join(', ')}`);
    
    obsControlChannel.publish('set-layout', layoutPaths, (err) => {
        if (err) {
            log(`Error setting OBS layout: ${err.message}`);
        } else {
            log(`OBS layout updated successfully`);
            currentOBSLayout = streamIds;
            updateOBSLayoutUI();
        }
    });
}

function addToOBSLayout(streamId) {
    if (currentOBSLayout.includes(streamId)) {
        log(`Stream ${streamId} is already in OBS layout`);
        return;
    }
    
    const newLayout = [...currentOBSLayout, streamId];
    setOBSLayout(newLayout);
}

function setSoloOBSLayout(streamId) {
    log(`Setting solo OBS layout for stream: ${streamId}`);
    setOBSLayout([streamId]);
}

function removeFromOBSLayout(streamId) {
    if (!currentOBSLayout.includes(streamId)) {
        log(`Stream ${streamId} is not in OBS layout`);
        return;
    }
    
    const newLayout = currentOBSLayout.filter(id => id !== streamId);
    setOBSLayout(newLayout);
}

function clearOBSLayout() {
    log('Clearing OBS layout');
    setOBSLayout([]);
}

function updateOBSLayoutUI() {
    // Update visual indicators on stream cards
    streams.forEach((stream, streamId) => {
        const safeId = sanitizeId(streamId);
        const streamCard = document.getElementById(`stream-${safeId}`);
        const addBtn = document.getElementById(`obs-add-${safeId}`);
        const removeBtn = document.getElementById(`obs-remove-${safeId}`);
        
        if (streamCard) {
            if (currentOBSLayout.includes(streamId)) {
                streamCard.classList.add('in-obs-layout');
                
                // Update button states
                if (addBtn) {
                    addBtn.disabled = true;
                    addBtn.style.opacity = '0.5';
                }
                if (removeBtn) {
                    removeBtn.disabled = false;
                    removeBtn.style.opacity = '1';
                }
            } else {
                streamCard.classList.remove('in-obs-layout');
                
                // Update button states
                if (addBtn) {
                    addBtn.disabled = false;
                    addBtn.style.opacity = '1';
                }
                if (removeBtn) {
                    removeBtn.disabled = true;
                    removeBtn.style.opacity = '0.5';
                }
            }
        }
    });
    
    // Update any global layout display (to be implemented)
    updateGlobalLayoutDisplay();
}

function updateGlobalLayoutDisplay() {
    const layoutCount = currentOBSLayout.length;
    const layoutCountEl = document.getElementById('obsLayoutCount');
    const layoutListEl = document.getElementById('obsLayoutList');
    
    if (layoutCountEl) {
        layoutCountEl.textContent = layoutCount === 0 ? '0 streams' : 
                                   layoutCount === 1 ? '1 stream' : 
                                   `${layoutCount} streams`;
    }
    
    if (layoutListEl) {
        if (layoutCount === 0) {
            layoutListEl.innerHTML = '<em>No streams in layout</em>';
        } else {
            const streamNames = currentOBSLayout.map(streamId => {
                const stream = streams.get(streamId);
                return stream ? stream.streamName || streamId : streamId;
            });
            layoutListEl.innerHTML = streamNames.join('<br>');
        }
    }
    
    log(`Current OBS layout has ${layoutCount} stream(s)`);
}

// Check for active streams by testing MediaMTX API
async function checkActiveStreams() {
    log(`Checking for active streams in room: ${room}`);
    
    try {
        // Try to get list of streams from MediaMTX API
        const apiUrl = `https://stream.voodoostudios.tv/v3/paths/list`;
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            log(`MediaMTX API response received`);
            
            // Look for paths that match our room
            if (data.items) {
                data.items.forEach(item => {
                    // Check if path matches our room pattern: room/streamId
                    const pathParts = item.name.split('/');
                    if (pathParts.length === 2 && pathParts[0] === room) {
                        const streamId = pathParts[1];
                        
                        // Only add if we don't already have this stream
                        if (!streams.has(streamId)) {
                            log(`Found active stream from MediaMTX: ${streamId}`);
                            
                            const streamData = {
                                streamId: streamId,
                                streamName: `${streamId}'s Stream`,
                                status: 'streaming',
                                room: room
                            };
                            
                            addStream(streamData);
                            
                            // Auto-start preview
                            setTimeout(() => {
                                startPreview(streamId);
                                updateStreamButtons(streamId, 'streaming');
                            }, 500);
                        }
                    }
                });
            }
        } else {
            log(`MediaMTX API not accessible, falling back to manual detection`);
            // Fallback: check common stream names
            checkCommonStreamNames();
        }
    } catch (error) {
        log(`MediaMTX API error: ${error.message}, falling back to manual detection`);
        // Fallback: check common stream names
        checkCommonStreamNames();
    }
}

// Fallback method to check common stream names
function checkCommonStreamNames() {
    // Test common stream IDs by trying to load them as iframes
    const commonStreamIds = ['marcelo', 'streamer1', 'streamer2', 'streamer3', 'streamer4', 'streamer5'];
    
    commonStreamIds.forEach(streamId => {
        if (!streams.has(streamId)) {
            // Create a temporary iframe to test if stream exists
            const testFrame = document.createElement('iframe');
            testFrame.style.display = 'none';
            testFrame.src = `https://stream.voodoostudios.tv/${room}/${streamId}`;
            
            testFrame.onload = () => {
                log(`Detected active stream: ${streamId}`);
                
                const streamData = {
                    streamId: streamId,
                    streamName: `${streamId}'s Stream`,
                    status: 'streaming',
                    room: room
                };
                
                addStream(streamData);
                
                // Auto-start preview
                setTimeout(() => {
                    startPreview(streamId);
                    updateStreamButtons(streamId, 'streaming');
                }, 500);
                
                // Clean up test frame
                document.body.removeChild(testFrame);
            };
            
            testFrame.onerror = () => {
                // Stream doesn't exist, clean up
                document.body.removeChild(testFrame);
            };
            
            // Add to DOM temporarily
            document.body.appendChild(testFrame);
            
            // Remove after timeout regardless
            setTimeout(() => {
                if (testFrame.parentNode) {
                    document.body.removeChild(testFrame);
                }
            }, 5000);
        }
    });
}

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

function updateConnectionUI(connected) {
    const mainButton = document.getElementById('connectionStatus');
    const manualButton = document.getElementById('connectionStatusManual');
    const connectionDot = document.getElementById('connectionDot');
    const statusText = connectionDot ? connectionDot.nextElementSibling : null;
    const roomInput = document.getElementById('roomInput');
    
    if (connected) {
        if (mainButton) {
            mainButton.textContent = 'Disconnect';
            mainButton.classList.add('connected');
        }
        if (manualButton) {
            manualButton.textContent = 'Disconnect';
            manualButton.classList.add('connected');
        }
        if (connectionDot) {
            connectionDot.style.background = 'var(--accent-green)';
        }
        if (statusText) {
            statusText.textContent = 'Status: Connected';
        }
        document.getElementById('roomName').textContent = room;
        document.getElementById('currentRoom').style.display = 'block';
        document.getElementById('inviteSection').style.display = 'block';
        document.getElementById('obsLayoutSection').style.display = 'block';
    } else {
        if (mainButton) {
            mainButton.textContent = 'Connect to Room';
            mainButton.classList.remove('connected');
        }
        if (manualButton) {
            manualButton.textContent = 'Connect to Room';
            manualButton.classList.remove('connected');
        }
        if (connectionDot) {
            connectionDot.style.background = 'var(--accent-red)';
        }
        if (statusText) {
            statusText.textContent = 'Status: Disconnected';
        }
        document.getElementById('currentRoom').style.display = 'none';
        document.getElementById('inviteSection').style.display = 'none';
        document.getElementById('obsLayoutSection').style.display = 'none';
        if (roomInput) roomInput.disabled = false;
    }
}

function handleRoomState(data) {
    if (!data) {
        log(`No room state data received`);
        return;
    }

    // Handle different possible data structures
    const streamsList = data.streams || data.activeStreams || [];
    const participantsList = data.participants || [];
    
    log(`ROOM STATE SYNC: Processing ${streamsList.length} existing streams and ${participantsList.length} participants`);

    if (streamsList.length === 0 && participantsList.length === 0) {
        log(`No existing streams or participants in room ${room}`);
        return;
    }

    // Process existing streams from streams array
    streamsList.forEach(streamInfo => {
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
                status: streamInfo.status || 'ready',
                room: streamInfo.room || room
            });
        }

        // Set up proper button states and auto-start previews for active streams
        if (streamInfo.status === 'streaming') {
            log(`Auto-starting preview for active stream: ${streamInfo.streamId}`);
            setTimeout(() => {
                startPreview(streamInfo.streamId);
                updateStreamButtons(streamInfo.streamId, 'streaming');
            }, 500);
        } else {
            // Ensure buttons are in correct state for non-streaming streams
            setTimeout(() => {
                updateStreamButtons(streamInfo.streamId, streamInfo.status || 'ready');
            }, 500);
        }
    });

    // Also check participants for streamers
    participantsList.forEach(participant => {
        if (participant.role === 'streamer' && participant.participantId && !streams.has(participant.participantId)) {
            log(`Found streamer participant: ${participant.participantId}`);
            
            const streamData = {
                streamId: participant.participantId,
                streamName: participant.participantName || `${participant.participantId}'s Stream`,
                status: participant.streaming ? 'streaming' : 'ready',
                room: room
            };
            
            streams.set(participant.participantId, streamData);
            
            if (participant.streaming) {
                setTimeout(() => {
                    startPreview(participant.participantId);
                    updateStreamButtons(participant.participantId, 'streaming');
                }, 500);
            }
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

    // Initialize onAir state to false by default
    if (streamData.onAir === undefined) {
        streamData.onAir = false;
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
        const statusEl = document.querySelector(`#stream-${safeId} .video-status`);
        if (statusEl) {
            statusEl.textContent = status.toUpperCase();
            statusEl.className = `video-status ${status}`;
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
        <div class="empty-grid">
            <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"><i data-lucide="video" style="width: 48px; height: 48px;"></i></div>
            <div style="font-size: 16px; margin-bottom: 8px;">No streams connected yet</div>
            <div style="font-size: 14px;">Connect to a room and invite streamers to get started</div>
        </div>
    `;
}

function createStreamCard(stream, streamId) {
    const safeId = sanitizeId(streamId);
    const card = document.createElement('div');
    card.className = 'video-card';
    card.id = `stream-${safeId}`;
    card.setAttribute('data-stream-id', streamId); // Store original ID
    card.innerHTML = `
        <div class="video-header">
            <div class="video-title">${stream.streamName || streamId}</div>
            <div class="video-status ${stream.status}">${stream.status.toUpperCase()}</div>
        </div>
        
        <div class="video-preview" id="preview-${safeId}" style="position: relative;">
            <video id="video-${safeId}" style="width: 100%; height: 100%; object-fit: cover; display: none;" muted autoplay playsinline></video>
            <div class="video-placeholder" id="placeholder-${safeId}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-secondary); text-align: center; gap: 10px;">
                <div style="font-size: 48px; opacity: 0.3;"><i data-lucide="video" style="width: 48px; height: 48px;"></i></div>
                <span id="placeholder-text-${safeId}">Waiting for stream...</span>
                <button onclick="startPreview('${streamId}')" style="padding: 8px 16px; background: var(--accent-blue); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; display: none;" id="connect-btn-${safeId}">Connect</button>
            </div>
        </div>

        <div class="video-controls">
            <button class="control-btn start" id="start-${safeId}" onclick="startStream('${streamId}')">
                <i data-lucide="play"></i>
                Start
            </button>
            <button class="control-btn stop" id="stop-${safeId}" onclick="stopStream('${streamId}')" disabled>
                <i data-lucide="stop-circle"></i>
                Stop
            </button>
            <button class="control-btn onair" id="onair-${safeId}" onclick="toggleOnAir('${streamId}')" title="Toggle on air status">
                <i data-lucide="radio"></i>
                Off Air
            </button>
            <button class="control-btn audio" id="audio-${safeId}" onclick="toggleAudio('${streamId}')" title="Toggle audio monitoring (0/0.5 volume)">
                <i data-lucide="volume-x"></i>
                Muted
            </button>
            <button class="control-btn obs-add" id="obs-add-${safeId}" onclick="addToOBSLayout('${streamId}')" title="Add to OBS layout">
                <i data-lucide="plus-square"></i>
                OBS+
            </button>
            <button class="control-btn obs-solo" id="obs-solo-${safeId}" onclick="setSoloOBSLayout('${streamId}')" title="Solo in OBS">
                <i data-lucide="maximize-2"></i>
                Solo
            </button>
            <button class="control-btn obs-remove" id="obs-remove-${safeId}" onclick="removeFromOBSLayout('${streamId}')" title="Remove from OBS layout">
                <i data-lucide="minus-square"></i>
                OBS-
            </button>
            <button class="control-btn link" id="link-${safeId}" onclick="copyStreamLink('${streamId}')" title="Copy stream link">
                <i data-lucide="link"></i>
                Link
            </button>
            <button class="control-btn end" id="close-${safeId}" onclick="closeSession('${streamId}')" title="Force close session and disconnect streamer">
                <i data-lucide="x-circle"></i>
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
    const emptyState = container.querySelector('.empty-grid');
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
            
            // Set initial on-air button state
            if (stream.onAir) {
                const onAirBtn = document.getElementById(`onair-${safeId}`);
                if (onAirBtn) {
                    onAirBtn.innerHTML = '<i data-lucide="radio"></i> On Air';
                    onAirBtn.classList.add('active');
                    onAirBtn.style.background = 'var(--accent-green)';
                    onAirBtn.style.color = 'white';
                }
            }
        } else {
            // Update existing card status if needed (without destroying the preview)
            const statusEl = existingCard.querySelector('.video-status');
            if (statusEl && statusEl.textContent !== stream.status.toUpperCase()) {
                statusEl.textContent = stream.status.toUpperCase();
                statusEl.className = `video-status ${stream.status}`;
            }
            
            // Update on-air button state
            const onAirBtn = document.getElementById(`onair-${safeId}`);
            if (onAirBtn) {
                if (stream.onAir) {
                    onAirBtn.innerHTML = '<i data-lucide="radio"></i> On Air';
                    onAirBtn.classList.add('active');
                    onAirBtn.style.background = 'var(--accent-green)';
                    onAirBtn.style.color = 'white';
                } else {
                    onAirBtn.innerHTML = '<i data-lucide="radio"></i> Off Air';
                    onAirBtn.classList.remove('active');
                    onAirBtn.style.background = '';
                    onAirBtn.style.color = '';
                }
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
    ablyChannel.publish('producer-command', {
        command: 'START_STREAM',
        streamId: streamId
    });

    // Update button states
    updateStreamButtons(streamId, 'starting');

    // Preview will auto-start when we receive 'streaming' status from streamer
}

function stopStream(streamId) {
    log(`Sending STOP command to ${streamId}`);
    ablyChannel.publish('producer-command', {
        command: 'STOP_STREAM',
        streamId: streamId
    });

    // Update button states to show stopping in progress
    updateStreamButtons(streamId, 'stopping');
    
    // Don't stop preview or set to 'stopped' immediately
    // Wait for status update from voodoostreamer to confirm it actually stopped
}

async function startPreview(streamId) {
    const stream = streams.get(streamId);
    if (!stream) return;

    const roomName = stream.room || room || 'rolluptv';
    
    // Check if already connected
    if (whepConnections.has(streamId)) {
        log(`Preview already active for ${streamId}`);
        return;
    }

    // Determine WHEP endpoint URL
    const isLocal = window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.startsWith('192.168.') ||
                   window.location.hostname.startsWith('10.') ||
                   window.location.hostname.startsWith('172.');
    
    let whepUrl;
    if (isLocal) {
        whepUrl = `http://localhost:8889/${roomName}/${streamId}/whep`;
    } else {
        whepUrl = `https://stream.voodoostudios.tv/${roomName}/${streamId}/whep`;
    }

    log(`Starting direct WHEP preview for ${streamId}: ${whepUrl}`);

    const safeId = sanitizeId(streamId);
    const previewEl = document.getElementById(`preview-${safeId}`);
    const videoEl = document.getElementById(`video-${safeId}`);
    const placeholderEl = document.getElementById(`placeholder-${safeId}`);

    if (!previewEl || !videoEl || !placeholderEl) {
        log(`Error: Missing DOM elements for ${streamId}`);
        return;
    }

    try {
        await setupDirectWHEPPreview(streamId, whepUrl);
        
        // Update UI
        previewEl.classList.add('active');
        placeholderEl.style.display = 'none';
        videoEl.style.display = 'block';

        log(`Direct WHEP preview started for ${streamId}`);
    } catch (error) {
        log(`Failed to start preview for ${streamId}: ${error.message}`);
        
        // Show error in placeholder
        if (placeholderEl) {
            placeholderEl.innerHTML = `
                <div style="font-size: 24px; opacity: 0.3; margin-bottom: 10px;"><i data-lucide="alert-circle" style="width: 24px; height: 24px;"></i></div>
                <span>Connection failed</span>
                <button onclick="startPreview('${streamId}')" style="padding: 8px 16px; background: var(--accent-blue); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; margin-top: 10px;">Retry</button>
            `;
            placeholderEl.style.display = 'flex';
        }
    }
}

async function stopPreview(streamId) {
    const safeId = sanitizeId(streamId);
    const previewEl = document.getElementById(`preview-${safeId}`);
    const videoEl = document.getElementById(`video-${safeId}`);
    const placeholderEl = document.getElementById(`placeholder-${safeId}`);

    if (previewEl && placeholderEl) {
        previewEl.classList.remove('active');

        // Clean up WHEP connection
        await stopDirectWHEPPreview(streamId);

        // Reset video element
        if (videoEl) {
            videoEl.srcObject = null;
            videoEl.style.display = 'none';
        }

        // Show placeholder
        placeholderEl.style.display = 'flex';
        placeholderEl.innerHTML = `
            <div style="font-size: 48px; opacity: 0.3;"><i data-lucide="video" style="width: 48px; height: 48px;"></i></div>
            <span>Waiting for stream...</span>
            <button onclick="startPreview('${streamId}')" style="padding: 8px 16px; background: var(--accent-blue); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; display: none;">Connect</button>
        `;
        
        // Reset audio state to muted
        audioStates.delete(streamId);
        const audioBtn = document.getElementById(`audio-${safeId}`);
        if (audioBtn) {
            audioBtn.classList.remove('active');
            audioBtn.style.background = '';
            audioBtn.style.color = '';
            audioBtn.innerHTML = '<i data-lucide="volume-x"></i> Muted';
            audioBtn.title = 'Audio muted (volume 0) - click to enable monitoring';
        }
        
        log(`Preview stopped and cleaned up for ${streamId}`);
    }
}

// Direct WHEP Audio Monitoring Functions

async function setupDirectWHEPPreview(streamId, whepUrl) {
    const safeId = sanitizeId(streamId);
    const videoEl = document.getElementById(`video-${safeId}`);
    
    if (!videoEl) {
        throw new Error('Video element not found');
    }

    try {
        // Create peer connection
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Store connection
        whepConnections.set(streamId, pc);

        // Set up track handling
        pc.ontrack = (event) => {
            console.log('Received track:', event.track.kind);
            
            if (!videoEl.srcObject) {
                videoEl.srcObject = new MediaStream();
            }
            
            // Add track to video element
            videoEl.srcObject.addTrack(event.track);
            
            // Set up audio monitoring when we get an audio track
            if (event.track.kind === 'audio') {
                setupAudioMonitoring(streamId, videoEl.srcObject);
            }
            
            console.log(`Added ${event.track.kind} track for ${streamId}`);
        };

        // Handle connection state changes
        pc.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${streamId}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                log(`Connection lost for ${streamId}, cleaning up`);
                cleanupWHEPConnection(streamId);
            }
        };

        // Create transceivers for receiving
        pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.addTransceiver('video', { direction: 'recvonly' });
        
        // Create offer
        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        
        await pc.setLocalDescription(offer);
        
        // Wait for ICE gathering
        await waitForIceGathering(pc);
        
        // Send WHEP request
        const response = await fetch(whepUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp' },
            body: pc.localDescription.sdp
        });

        if (!response.ok) {
            throw new Error(`WHEP request failed: ${response.status} ${response.statusText}`);
        }

        const answerSDP = await response.text();
        await pc.setRemoteDescription({
            type: 'answer',
            sdp: answerSDP
        });

        // Mute the video element since we handle audio via Web Audio API
        videoEl.muted = true;
        videoEl.volume = 0;
        
        // Try to play
        await videoEl.play().catch(e => {
            console.log('Initial play failed, will retry on user interaction:', e);
        });

        log(`Direct WHEP connection established for ${streamId}`);
        
    } catch (error) {
        cleanupWHEPConnection(streamId);
        throw error;
    }
}

async function waitForIceGathering(pc) {
    if (pc.iceGatheringState === 'complete') {
        return;
    }

    return new Promise((resolve) => {
        const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', checkState);
                resolve();
            }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
    });
}

function setupAudioMonitoring(streamId, mediaStream) {
    try {
        // Create audio context
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.resume();
        audioContexts.set(streamId, audioContext);
        
        // Create source from stream
        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // Create gain node for volume control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0; // Start muted
        gainNodes.set(streamId, gainNode);
        
        // Connect audio graph for output (controlled by gain)
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        log(`Audio set up for ${streamId}`);
        
    } catch (error) {
        console.error(`Error setting up audio for ${streamId}:`, error);
    }
}

async function stopDirectWHEPPreview(streamId) {
    await cleanupWHEPConnection(streamId);
}

function cleanupWHEPConnection(streamId) {
    // Close peer connection
    const pc = whepConnections.get(streamId);
    if (pc) {
        pc.close();
        whepConnections.delete(streamId);
    }
    
    // Close audio context
    const audioContext = audioContexts.get(streamId);
    if (audioContext) {
        audioContext.close();
        audioContexts.delete(streamId);
    }
    
    // Clean up gain node reference
    gainNodes.delete(streamId);
    
    log(`Cleaned up WHEP connection for ${streamId}`);
}

function toggleAudioDirect(streamId) {
    const gainNode = gainNodes.get(streamId);
    const safeId = sanitizeId(streamId);
    const audioBtn = document.getElementById(`audio-${safeId}`);
    
    if (!gainNode || !audioBtn) {
        log(`Error: Gain node or audio button not found for ${streamId}`);
        return;
    }
    
    // Get current state
    const isMonitoring = audioStates.get(streamId) || false;
    const newState = !isMonitoring;
    
    // Update gain node volume
    gainNode.gain.value = newState ? 0.5 : 0;
    audioStates.set(streamId, newState);
    
    // Update button appearance
    if (newState) {
        audioBtn.classList.add('active');
        audioBtn.style.background = 'var(--accent-blue)';
        audioBtn.style.color = 'white';
        audioBtn.innerHTML = '<i data-lucide="volume-2"></i> Monitor';
        audioBtn.title = 'Audio monitoring ON (volume 0.5) - click to mute';
    } else {
        audioBtn.classList.remove('active');
        audioBtn.style.background = '';
        audioBtn.style.color = '';
        audioBtn.innerHTML = '<i data-lucide="volume-x"></i> Muted';
        audioBtn.title = 'Audio muted (volume 0) - click to enable monitoring';
    }
    
    // Re-render icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    log(`Audio ${newState ? 'monitoring enabled (0.5 volume)' : 'muted (0 volume)'} for ${streamId}`);
}

async function cleanupAllWHEPConnections() {
    log('Cleaning up all WHEP connections...');
    
    const streamIds = Array.from(whepConnections.keys());
    for (const streamId of streamIds) {
        await cleanupWHEPConnection(streamId);
    }
    
    log(`Cleaned up ${streamIds.length} WHEP connections`);
}

// Automatic streamer slot assignment (streamer1 to streamer10)
const MAX_STREAMERS = 10;
const assignedSlots = new Set(); // Track assigned streamer slots
let inviteCounter = 1; // Counter for manual mode fallback

function generateInviteLink() {
    if (!ably || ably.connection.state !== 'connected') {
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

    const selectedServer = 'https://stream.voodoostudios.tv';
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
            inviteUrl = `http://${currentHost}:${currentPort}/streamer/?room=${encodeURIComponent(room)}`;
        } else {
            // Production - use relative path
            const basePath = window.location.pathname.replace(/\/producer\/.*$/, '');
            inviteUrl = `${window.location.origin}${basePath}/streamer/?room=${encodeURIComponent(room)}`;
        }
    } else {
        // Manual mode: Include participantId in URL
        if (isLocal) {
            // Local testing - point to local VoodooSidebar
            const currentHost = window.location.hostname;
            const currentPort = window.location.port || '8080';
            inviteUrl = `http://${currentHost}:${currentPort}/streamer/?room=${encodeURIComponent(room)}&participantId=${encodeURIComponent(streamerName)}`;
        } else {
            // Production - use relative path
            const basePath = window.location.pathname.replace(/\/producer\/.*$/, '');
            inviteUrl = `${window.location.origin}${basePath}/streamer/?room=${encodeURIComponent(room)}&participantId=${encodeURIComponent(streamerName)}`;
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
    if (!ably || ably.connection.state !== 'connected') {
        const roomInput = document.getElementById('roomInput');
        if (roomInput && roomInput.value.trim()) {
            currentRoom = roomInput.value.trim();
        }
    }

    // Generate guest meeting invite URL using relative path
    // This gives guests both the streamer controls and meeting room
    const basePath = window.location.pathname.replace(/\/producer\/.*$/, '');
    const guestInviteUrl = `${window.location.origin}${basePath}/streamer/?room=${encodeURIComponent(currentRoom)}`;

    // Copy to clipboard
    navigator.clipboard.writeText(guestInviteUrl).then(() => {
        log(`Guest invite copied: ${guestInviteUrl}`);
        log(`Guests will join with auto-assigned streamer names (streamer1, streamer2, etc.)`);

        // Visual feedback
        const guestInviteBtn = document.getElementById('guestInviteBtn');
        if (guestInviteBtn) {
            guestInviteBtn.textContent = 'Copied!';
            guestInviteBtn.classList.add('copied');

            // Reset button after delay to show feedback
            setTimeout(() => {
                guestInviteBtn.textContent = 'Invite Guest to Conference';
                guestInviteBtn.classList.remove('copied');
            }, 2000);
        }
    }).catch(err => {
        log(`Failed to copy guest invite: ${err}`);
        // Fallback - show in alert
        alert(`Guest invite link:\n${guestInviteUrl}`);
    });
}

function toggleOnAir(streamId) {
    const stream = streams.get(streamId);
    if (!stream) {
        log(`Stream ${streamId} not found`);
        return;
    }

    // Toggle the onAir state
    stream.onAir = !stream.onAir;
    log(`Stream ${streamId} is now ${stream.onAir ? 'ON AIR' : 'OFF AIR'}`);

    // Update button UI
    const safeId = sanitizeId(streamId);
    const onAirBtn = document.getElementById(`onair-${safeId}`);
    if (onAirBtn) {
        if (stream.onAir) {
            onAirBtn.innerHTML = '<i data-lucide="radio"></i> On Air';
            onAirBtn.classList.add('active');
            onAirBtn.style.background = 'var(--accent-green)';
            onAirBtn.style.color = 'white';
        } else {
            onAirBtn.innerHTML = '<i data-lucide="radio"></i> Off Air';
            onAirBtn.classList.remove('active');
            onAirBtn.style.background = '';
            onAirBtn.style.color = '';
        }
        
        // Re-create lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Publish on-air state change via Ably
    if (ably && ably.connection.state === 'connected') {
        ablyChannel.publish('stream-onair-update', {
            streamId: streamId,
            onAir: stream.onAir,
            room: room,
            timestamp: Date.now()
        });
        log(`Published on-air state change for ${streamId}: ${stream.onAir}`);
    }
}

function copyStreamLink(streamId) {
    const stream = streams.get(streamId);
    if (!stream) {
        log(`ERROR: Stream ${streamId} not found`);
        return;
    }

    // Build the WHEP magiclink URL that will autoplay
    const roomName = stream.room || room || 'rolluptv';
    
    // Check if running locally or on production
    const isLocal = window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.startsWith('192.168.') ||
                   window.location.hostname.startsWith('10.') ||
                   window.location.hostname.startsWith('172.');
    
    let magicLinkUrl;
    if (isLocal) {
        // Local testing
        const currentHost = window.location.hostname;
        const currentPort = window.location.port || '8080';
        magicLinkUrl = `http://${currentHost}:${currentPort}/obspop/playback.html?room=${encodeURIComponent(roomName)}/${encodeURIComponent(streamId)}`;
    } else {
        // Production - use relative path
        const basePath = window.location.pathname.replace(/\/producer\/.*$/, '');
        magicLinkUrl = `${window.location.origin}${basePath}/obspop/playback.html?room=${encodeURIComponent(roomName)}/${encodeURIComponent(streamId)}`;
    }

    // Copy to clipboard
    navigator.clipboard.writeText(magicLinkUrl).then(() => {
        log(`Copied WHEP autoplay link to clipboard: ${magicLinkUrl}`);

        // Visual feedback - change button temporarily
        const safeId = sanitizeId(streamId);
        const linkBtn = document.getElementById(`link-${safeId}`);
        if (linkBtn) {
            const originalHTML = linkBtn.innerHTML;
            linkBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied!
            `;
            linkBtn.classList.add('active');

            // Reset after delay to show feedback
            setTimeout(() => {
                linkBtn.innerHTML = originalHTML;
                linkBtn.classList.remove('active');
            }, 2000);
        }
    }).catch(err => {
        log(`Failed to copy to clipboard: ${err}`);
        // Fallback - show the URL in an alert
        alert(`WHEP Autoplay Link:\n${magicLinkUrl}`);
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
    ablyChannel.publish('producer-command', commandData);

    // Also send the old command for backward compatibility
    ablyChannel.publish('producer-command', {
        command: 'END_SESSION',
        streamId: streamId
    });

    // Stop preview immediately
    stopPreview(streamId);

    // Update UI immediately - make it clear the session is being terminated
    const safeId = sanitizeId(streamId);
    const startBtn = document.getElementById(`start-${safeId}`);
    const stopBtn = document.getElementById(`stop-${safeId}`);
    const linkBtn = document.getElementById(`link-${safeId}`);
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
    if (linkBtn) {
        linkBtn.disabled = true;
        linkBtn.style.opacity = '0.3';
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

    // Mark as terminated to prevent re-adding
    const terminatedKey = `terminated_${room}_${streamId}`;
    sessionStorage.setItem(terminatedKey, 'true');
    
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
    
    // We could also emit an Ably message to inform any connected streamers
    if (ably && ably.connection.state === 'connected') {
        ablyChannel.publish('reset-streamer-counter', {
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
        // Disconnect Ably if connected
        if (ably && ably.connection.state === 'connected') {
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
    if (!ably || ably.connection.state !== 'connected') {
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
        
        // Emit cleanup event via Ably
        ablyChannel.publish('producer-command', {
            command: 'CLEANUP_STREAM',
            streamId: streamId,
            reason: 'Producer cleanup inactive streams'
        });
    });
    
    log(`Cleaned up ${inactiveStreams.length} inactive streams`);
}

function openProgramView() {
    if (!room) {
        log('ERROR: Cannot open program view - no room selected');
        return;
    }
    
    const programViewUrl = `../programview/programview.html?room=${encodeURIComponent(room)}`;
    window.open(programViewUrl, '_blank');
    log(`Opened Program View for room: ${room}`);
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
window.toggleOnAir = toggleOnAir;
window.resetStreamerCounter = resetStreamerCounter;
window.cleanupInactiveStreams = cleanupInactiveStreams;
window.logout = logout;

// OBS Control functions
window.setOBSLayout = setOBSLayout;
window.addToOBSLayout = addToOBSLayout;
window.setSoloOBSLayout = setSoloOBSLayout;
window.removeFromOBSLayout = removeFromOBSLayout;
window.clearOBSLayout = clearOBSLayout;

// Mobile menu functions
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// Close mobile menu when clicking on sidebar links/buttons
function setupMobileMenuAutoClose() {
    const sidebar = document.querySelector('.sidebar');
    const buttons = sidebar.querySelectorAll('button, select');

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // Small delay to allow the action to complete
            setTimeout(() => {
                if (window.innerWidth <= 768) {
                    closeMobileMenu();
                }
            }, 100);
        });
    });
}

// Handle window resize
function handleResize() {
    if (window.innerWidth > 768) {
        closeMobileMenu();
    }
}

// Initialize mobile menu functionality
function initializeMobileMenu() {
    setupMobileMenuAutoClose();
    window.addEventListener('resize', handleResize);
}

// Export mobile menu functions
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;

// Initialize mobile menu when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMobileMenu);

// Audio monitoring state
const audioStates = new Map(); // Track audio enabled state per stream

// Old iframe message listener removed - now using direct WHEP audio control

// Toggle audio monitoring for a stream
function toggleAudio(streamId) {
    toggleAudioDirect(streamId);
}

// Make toggleAudio globally accessible
window.toggleAudio = toggleAudio;