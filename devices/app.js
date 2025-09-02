// Main application entry point
import { logger } from './logger.js';
import { connectionManager } from './connection.js';
import { streamersManager } from './streamers.js';
import { deviceControls } from './controls.js';
import { previewManager } from './preview.js';

class DeviceControllerApp {
    constructor() {
        this.init();
    }

    init() {
        // Initialize the application
        document.addEventListener('DOMContentLoaded', () => {
            this.setupEventHandlers();
            this.setupConnectionHandlers();
            this.setupUIEventListeners();
            this.loadInitialState();
            logger.success('Device controller initialized. Ready to connect.');
        });
    }

    setupEventHandlers() {
        // Stream events
        connectionManager.on('stream-registered', (message) => this.handleStreamRegistered(message));
        connectionManager.on('participant-joined', (message) => this.handleParticipantJoined(message));
        connectionManager.on('stream-status-update', (message) => this.handleStreamStatusUpdate(message));
        connectionManager.on('stream-removed', (message) => this.handleStreamRemoved(message));
        connectionManager.on('bitrate-changed', (message) => this.handleBitrateChanged(message));
        connectionManager.on('codec-changed', (message) => this.handleCodecChanged(message));
        connectionManager.on('resolution-changed', (message) => this.handleResolutionChanged(message));
        connectionManager.on('framerate-changed', (message) => this.handleFramerateChanged(message));
        connectionManager.on('studio-sound-changed', (message) => this.handleStudioSoundChanged(message));
        connectionManager.on('room-streams-response', (message) => this.handleRoomStreamsResponse(message));
        connectionManager.on('whip-endpoint-changed', (message) => this.handleWhipEndpointChanged(message));

        // Device sync events
        connectionManager.on('device:jitsi-device-update', (message) => this.handleDeviceUpdate(message));
        connectionManager.on('device:jitsi-mute-update', (message) => this.handleMuteUpdate(message));
    }

    setupConnectionHandlers() {
        // Subscribe to presence events
        connectionManager.subscribeToPresence('enter', (member) => {
            logger.success(`Presence ENTER: ${member.clientId} - ${JSON.stringify(member.data)}`);
            if (member.data && member.data.role === 'streamer') {
                this.handleParticipantJoined({
                    data: {
                        participantId: member.clientId,
                        participantName: member.data.participantName || member.clientId,
                        role: 'streamer',
                        room: connectionManager.currentRoom
                    }
                });
            }
        });
    }

    setupUIEventListeners() {
        // Connection button
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        
        // Discover button
        document.getElementById('discoverBtn').addEventListener('click', () => deviceControls.discoverStreamers());
        
        // Test device sync button
        document.getElementById('testDeviceSync').addEventListener('click', () => deviceControls.testDeviceSync());
        
        // Global control buttons
        document.querySelector('.bulk-action-btn.studio-sound')?.addEventListener('click', 
            () => deviceControls.toggleAllStudioSound());
        
        document.querySelectorAll('.bulk-action-btn.mute-all').forEach((btn, index) => {
            if (index === 0) {
                btn.addEventListener('click', () => deviceControls.muteAllAudio());
            } else {
                btn.addEventListener('click', () => deviceControls.unmuteAllAudio());
            }
        });
        
        document.querySelectorAll('.bulk-action-btn.quality').forEach((btn, index) => {
            if (index === 0) {
                btn.addEventListener('click', () => deviceControls.setAllQuality('high'));
            } else {
                btn.addEventListener('click', () => deviceControls.setAllQuality('low'));
            }
        });

        // Room input enter key
        document.getElementById('roomInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.toggleConnection();
            }
        });

        // Delegate events for dynamic streamer cards
        document.addEventListener('change', (e) => {
            const target = e.target;
            const streamerId = target.dataset.streamer;
            
            if (!streamerId) return;

            if (target.classList.contains('device-select')) {
                const type = target.dataset.type;
                if (type === 'video') {
                    deviceControls.changeVideoDevice(streamerId, target.value);
                } else if (type === 'audio') {
                    deviceControls.changeAudioDevice(streamerId, target.value);
                }
            } else if (target.classList.contains('quality-select')) {
                const type = target.dataset.type;
                switch(type) {
                    case 'bitrate':
                        deviceControls.changeBitrate(streamerId, target.value);
                        break;
                    case 'codec':
                        deviceControls.changeCodec(streamerId, target.value);
                        break;
                    case 'resolution':
                        deviceControls.changeResolution(streamerId, target.value);
                        break;
                    case 'framerate':
                        deviceControls.changeFramerate(streamerId, target.value);
                        break;
                }
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target;
            const streamerId = target.dataset.streamer;
            const action = target.dataset.action;
            
            if (!streamerId || !action) return;

            switch(action) {
                case 'toggle-audio':
                    deviceControls.toggleAudioMute(streamerId);
                    break;
                case 'toggle-video':
                    deviceControls.toggleVideoMute(streamerId);
                    break;
                case 'toggle-studio':
                    deviceControls.toggleStudioSound(streamerId);
                    break;
                case 'update-whip':
                    deviceControls.updateWhipEndpoint(streamerId);
                    break;
                case 'start':
                    deviceControls.startStream(streamerId);
                    break;
                case 'stop':
                    deviceControls.stopStream(streamerId);
                    break;
                case 'preview':
                    previewManager.startPreview(streamerId);
                    break;
            }
        });

        // WHIP endpoint enter key handling
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('endpoint-input')) {
                const streamerId = e.target.dataset.streamer;
                if (streamerId) {
                    deviceControls.updateWhipEndpoint(streamerId);
                }
            }
        });
    }

    loadInitialState() {
        // Get room from URL if provided
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');
        if (room) {
            document.getElementById('roomInput').value = room;
        }
    }

    async toggleConnection() {
        if (connectionManager.isConnected) {
            this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        const roomInput = document.getElementById('roomInput');
        const room = roomInput.value.trim();
        
        if (!room) {
            logger.error('Please enter a room name');
            roomInput.focus();
            return;
        }

        try {
            await connectionManager.connect(room);
            
            // Request initial room state
            connectionManager.requestRoomStreams();
            
            // Check presence for existing streamers
            const members = await connectionManager.getPresence();
            members.forEach(member => {
                if (member.data && member.data.role === 'streamer') {
                    logger.success(`Found existing streamer via presence: ${member.clientId}`);
                    this.handleParticipantJoined({
                        data: {
                            participantId: member.clientId,
                            participantName: member.data.participantName || member.clientId,
                            role: 'streamer',
                            room: connectionManager.currentRoom
                        }
                    });
                }
            });
        } catch (error) {
            logger.error(`Connection failed: ${error.message}`);
        }
    }

    disconnect() {
        // Clean up preview connections
        previewManager.cleanupAll();
        
        // Clear streamers
        streamersManager.clear();
        
        // Disconnect from Ably
        connectionManager.disconnect();
    }

    // Event handlers
    handleStreamRegistered(message) {
        const data = message.data;
        logger.success(`Stream registered: ${data.streamId}`);
        
        streamersManager.addStreamer(data.streamId, {
            streamName: data.streamName || data.streamId,
            status: 'ready',
            room: data.room
        });
    }

    handleParticipantJoined(message) {
        const data = message.data;
        logger.success(`Participant event: ${data.participantId} - role: ${data.role || 'unknown'}`);
        
        // Accept both explicit streamers and any participant that looks like a streamer
        const isStreamer = data.role === 'streamer' || 
                          (data.participantId && !data.participantId.includes('producer'));
        
        if (isStreamer) {
            logger.success(`Adding streamer: ${data.participantId}`);
            
            if (!streamersManager.getStreamer(data.participantId)) {
                streamersManager.addStreamer(data.participantId, {
                    streamName: data.participantName || `${data.participantId}'s Stream`,
                    status: 'ready'
                });
                
                // Request device information from this streamer
                setTimeout(() => {
                    streamersManager.requestStreamerDevices(data.participantId);
                    logger.info(`Requesting devices for new streamer: ${data.participantId}`);
                }, 1000);
            }
        }
    }

    handleStreamStatusUpdate(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            status: data.status
        });
        logger.success(`Stream status: ${data.streamId} -> ${data.status}`);
    }

    handleStreamRemoved(message) {
        const data = message.data;
        streamersManager.removeStreamer(data.streamId);
        logger.warning(`Stream removed: ${data.streamId}`);
    }

    handleBitrateChanged(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            settings: { bitrate: data.bitrate }
        });
        logger.success(`Bitrate changed: ${data.streamId} -> ${data.bitrate} kbps`);
    }

    handleCodecChanged(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            settings: { codec: data.codec }
        });
        logger.success(`Codec changed: ${data.streamId} -> ${data.codec}`);
    }

    handleResolutionChanged(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            settings: { resolution: data.resolution }
        });
        logger.success(`Resolution changed: ${data.streamId} -> ${data.resolution}`);
    }

    handleFramerateChanged(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            settings: { framerate: data.framerate }
        });
        logger.success(`Framerate changed: ${data.streamId} -> ${data.framerate} fps`);
    }

    handleStudioSoundChanged(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            settings: { studioSound: data.studioSound }
        });
        logger.success(`Studio sound: ${data.streamId} -> ${data.studioSound ? 'enabled' : 'disabled'}`);
    }

    handleRoomStreamsResponse(message) {
        const data = message.data;
        logger.success(`Received room streams response: ${data.streams ? data.streams.length : 0} streams`);
        
        if (data.streams && data.streams.length > 0) {
            data.streams.forEach(streamData => {
                if (!streamersManager.getStreamer(streamData.streamId)) {
                    logger.success(`Adding existing stream: ${streamData.streamId}`);
                    
                    streamersManager.addStreamer(streamData.streamId, {
                        streamName: streamData.streamName || streamData.streamId,
                        status: streamData.status || 'ready'
                    });
                }
            });
        }
    }

    handleWhipEndpointChanged(message) {
        const data = message.data;
        streamersManager.updateStreamer(data.streamId, {
            settings: { whipEndpoint: data.newEndpoint }
        });
        logger.success(`WHIP endpoint confirmed for ${data.streamId}: ${data.newEndpoint}`);
        if (data.streamActive) {
            logger.warning(`Stream active for ${data.streamId} - restart required for new endpoint`);
        }
    }

    handleDeviceUpdate(message) {
        const data = message.data;
        logger.success(`Device update from ${data.streamId}: Audio=${data.audioDeviceLabel || 'unknown'}, Video=${data.videoDeviceLabel || 'unknown'}`);
        console.log('Full device update data:', data);
        
        const updates = {
            devices: {
                audio: {},
                video: {}
            }
        };

        // Update current device selections
        if (data.audioDeviceId) {
            updates.devices.audio.id = data.audioDeviceId;
            updates.devices.audio.label = data.audioDeviceLabel || 'Unknown';
        }
        if (data.videoDeviceId) {
            updates.devices.video.id = data.videoDeviceId;
            updates.devices.video.label = data.videoDeviceLabel || 'Unknown';
        }
        
        // Update available device lists
        if (data.allDevices) {
            if (data.allDevices.audioDevices) {
                updates.devices.audio.available = data.allDevices.audioDevices;
                logger.success(`Updated ${data.streamId} audio devices: ${data.allDevices.audioDevices.length} available`);
            }
            if (data.allDevices.videoDevices) {
                updates.devices.video.available = data.allDevices.videoDevices;
                logger.success(`Updated ${data.streamId} video devices: ${data.allDevices.videoDevices.length} available`);
            }
        }
        
        streamersManager.updateStreamer(data.streamId, updates);
    }

    handleMuteUpdate(message) {
        const data = message.data;
        const updates = { settings: {} };
        
        if (data.audioMuted !== undefined) {
            updates.settings.audioMuted = data.audioMuted;
        }
        if (data.videoMuted !== undefined) {
            updates.settings.videoMuted = data.videoMuted;
        }
        
        streamersManager.updateStreamer(data.streamId, updates);
        logger.success(`Mute update: ${data.streamId} - audio: ${data.audioMuted ? 'muted' : 'unmuted'}, video: ${data.videoMuted ? 'muted' : 'unmuted'}`);
    }
}

// Initialize the application
const app = new DeviceControllerApp();

// Export for debugging
window.deviceControllerApp = app;
window.logger = logger;
window.connectionManager = connectionManager;
window.streamersManager = streamersManager;
window.deviceControls = deviceControls;
window.previewManager = previewManager;