// Recorder Control Application - Main entry point for producer-recorder interface
import { logger } from './logger.js';
import { connectionManager } from './connection.js';
import { recordersManager } from './recorder-manager.js';
import { recorderControls } from './recorder-controls.js';

class RecorderControlApp {
    constructor() {
        this.confirmCallback = null;
        this.init();
    }

    init() {
        // Set up event handlers IMMEDIATELY, not waiting for DOM
        this.setupEventHandlers();
        
        // Initialize the application
        document.addEventListener('DOMContentLoaded', () => {
            this.setupConnectionHandlers();
            this.setupUIEventListeners();
            this.loadInitialState();
            logger.success('🎬 Recorder Control initialized. Ready to connect to room.');
        });
    }

    setupEventHandlers() {
        // Recording-specific events from Mac apps
        connectionManager.on('stream-registered', (message) => this.handleRecorderRegistered(message));
        connectionManager.on('participant-joined', (message) => this.handleParticipantJoined(message));
        connectionManager.on('stream-status-update', (message) => this.handleRecorderStatusUpdate(message));
        connectionManager.on('stream-removed', (message) => this.handleRecorderRemoved(message));
        connectionManager.on('room-streams-response', (message) => this.handleRoomStreamsResponse(message));
        
        // Recording progress events
        connectionManager.on('recording-progress', (message) => this.handleRecordingProgress(message));
        
        // Quality/device change confirmations
        connectionManager.on('bitrate-changed', (message) => this.handleBitrateChanged(message));
        connectionManager.on('resolution-changed', (message) => this.handleResolutionChanged(message));
        connectionManager.on('framerate-changed', (message) => this.handleFramerateChanged(message));
        connectionManager.on('device-changed', (message) => this.handleDeviceChanged(message));

        // Device sync events (for device discovery)
        connectionManager.on('device:jitsi-device-update', (message) => this.handleDeviceUpdate(message));
    }

    setupConnectionHandlers() {
        // Subscribe to presence events for recorders
        connectionManager.subscribeToPresence('enter', (member) => {
            logger.success(`📥 Presence ENTER: ${member.clientId} - ${JSON.stringify(member.data)}`);
            
            // Look for recorder-type participants (Mac apps)
            if (member.data && (member.data.type === 'recorder' || member.data.platform === 'macOS')) {
                this.handleParticipantJoined({
                    data: {
                        participantId: member.clientId,
                        participantName: member.data.participantName || member.clientId,
                        type: 'recorder',
                        platform: member.data.platform || 'macOS',
                        room: connectionManager.currentRoom
                    }
                });
            }
        });

        connectionManager.subscribeToPresence('leave', (member) => {
            logger.warning(`📤 Presence LEAVE: ${member.clientId}`);
            recordersManager.removeRecorder(member.clientId);
            this.updateStatistics();
        });
    }

    setupUIEventListeners() {
        // Connection controls
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('discoverBtn')?.addEventListener('click', () => recorderControls.discoverRecorders());
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.refreshStatus());
        
        // Global recording controls with confirmation
        document.querySelector('.bulk-action-btn.start-all')?.addEventListener('click', () => {
            this.confirmAction('Start All Recording', 'Start recording on all connected recorders?', 
                () => recorderControls.startAllRecording());
        });
        
        document.querySelector('.bulk-action-btn.stop-all')?.addEventListener('click', () => {
            this.confirmAction('Stop All Recording', 'Stop recording on all active recorders?', 
                () => recorderControls.stopAllRecording());
        });
        
        // Quality controls
        document.querySelectorAll('.bulk-action-btn.quality').forEach((btn, index) => {
            const qualities = ['4K', '1080p', '720p', '480p'];
            const quality = qualities[index];
            if (quality) {
                btn.addEventListener('click', () => {
                    this.confirmAction(`Set ${quality} Quality`, `Set all recorders to ${quality} quality?`, 
                        () => recorderControls.setAllQuality(quality));
                });
            }
        });

        // Room input enter key
        document.getElementById('roomInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.toggleConnection();
            }
        });

        // Clear log button
        document.getElementById('clearLogBtn')?.addEventListener('click', () => {
            document.getElementById('logContainer').innerHTML = 
                '<div class="log-entry info">📝 Log cleared</div>';
        });

        // Modal controls
        document.getElementById('confirmCancel')?.addEventListener('click', () => this.hideModal());
        document.getElementById('confirmOk')?.addEventListener('click', () => this.executeConfirmation());

        // Delegate events for dynamic recorder cards
        document.addEventListener('change', (e) => this.handleDynamicChange(e));
        document.addEventListener('click', (e) => this.handleDynamicClick(e));
    }

    handleDynamicChange(e) {
        const target = e.target;
        const recorderId = target.dataset.recorder;
        
        if (!recorderId) return;

        if (target.classList.contains('device-select')) {
            const type = target.dataset.type;
            if (type === 'video') {
                recorderControls.changeVideoDevice(recorderId, target.value);
            } else if (type === 'audio') {
                recorderControls.changeAudioDevice(recorderId, target.value);
            }
        } else if (target.classList.contains('quality-select')) {
            const type = target.dataset.type;
            switch(type) {
                case 'resolution':
                    recorderControls.changeResolution(recorderId, target.value);
                    break;
                case 'bitrate':
                    recorderControls.changeBitrate(recorderId, target.value);
                    break;
                case 'framerate':
                    recorderControls.changeFramerate(recorderId, target.value);
                    break;
            }
        }
    }

    handleDynamicClick(e) {
        const target = e.target;
        const recorderId = target.dataset.recorder;
        const action = target.dataset.action;
        
        if (!recorderId || !action) return;

        switch(action) {
            case 'start-recording':
                this.confirmAction('Start Recording', `Start recording on ${recorderId}?`, 
                    () => recorderControls.startRecording(recorderId));
                break;
            case 'stop-recording':
                this.confirmAction('Stop Recording', `Stop recording on ${recorderId}?`, 
                    () => recorderControls.stopRecording(recorderId));
                break;
            case 'force-stop':
                this.confirmAction('Force Stop', `Force stop recording on ${recorderId}? This may cause data loss.`, 
                    () => recorderControls.forceStopRecording(recorderId));
                break;
            case 'sync-devices':
                logger.info(`🔄 Syncing devices for ${recorderId}`);
                recorderControls.syncDevices(recorderId);
                break;
        }
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
            logger.error('❌ Please enter a room ID');
            roomInput.focus();
            return;
        }

        try {
            await connectionManager.connect(room);
            
            // Request initial room state
            connectionManager.requestRoomStreams();
            
            // Show controls and stats sections
            document.getElementById('globalControlsSection').style.display = 'block';
            document.getElementById('statsSection').style.display = 'block';
            document.getElementById('uploadSection').style.display = 'block';
            
            // Check presence for existing recorders
            const members = await connectionManager.getPresence();
            members.forEach(member => {
                if (member.data && (member.data.type === 'recorder' || member.data.platform === 'macOS')) {
                    logger.success(`📹 Found existing recorder via presence: ${member.clientId}`);
                    this.handleParticipantJoined({
                        data: {
                            participantId: member.clientId,
                            participantName: member.data.participantName || member.clientId,
                            type: 'recorder',
                            platform: member.data.platform || 'macOS',
                            room: connectionManager.currentRoom
                        }
                    });
                }
            });
            
            this.updateStatistics();
        } catch (error) {
            logger.error(`❌ Connection failed: ${error.message}`);
        }
    }

    disconnect() {
        recordersManager.clear();
        connectionManager.disconnect();
        
        // Hide control sections
        document.getElementById('globalControlsSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'none';
        
        this.updateStatistics();
    }

    async refreshStatus() {
        if (!connectionManager.isConnected) return;
        
        logger.info('🔄 Refreshing recorder status...');
        
        // Request fresh room streams
        connectionManager.requestRoomStreams();
        
        // Request device updates from all known recorders
        for (const recorderId of recordersManager.recorders.keys()) {
            recordersManager.requestRecorderStatus(recorderId);
        }
    }

    // Event Handlers
    handleRecorderRegistered(message) {
        const data = message.data;
        logger.success(`📹 Recorder registered: ${data.streamId} (${data.streamName})`);
        
        recordersManager.addRecorder(data.streamId, {
            streamName: data.streamName || data.streamId,
            status: data.status || 'ready',
            room: data.room,
            type: data.type || 'recorder',
            platform: data.platform || 'macOS'
        });
        
        // Request device information after registration
        setTimeout(() => {
            logger.info(`📱 Requesting devices for newly registered ${data.streamId}`);
            recordersManager.requestRecorderDevices(data.streamId);
        }, 500);
        
        this.updateStatistics();
    }

    handleParticipantJoined(message) {
        const data = message.data;
        logger.success(`👤 Participant joined: ${data.participantId} - type: ${data.type || 'unknown'}`);
        
        // Accept recorder-type participants
        const isRecorder = data.type === 'recorder' || 
                          data.platform === 'macOS' || 
                          (data.participantId && data.participantId.includes('Recorder'));
        
        if (isRecorder) {
            logger.success(`📹 Adding recorder: ${data.participantId}`);
            
            if (!recordersManager.getRecorder(data.participantId)) {
                recordersManager.addRecorder(data.participantId, {
                    streamName: data.participantName || `${data.participantId}'s Recorder`,
                    status: 'ready',
                    type: 'recorder',
                    platform: data.platform || 'macOS'
                });
                
                // Request device and status information multiple times to ensure we get it
                setTimeout(() => {
                    logger.info(`📱 Requesting devices for ${data.participantId}`);
                    recordersManager.requestRecorderStatus(data.participantId);
                    recordersManager.requestRecorderDevices(data.participantId);
                }, 1000);
                
                // Try again after 3 seconds in case the first request was too early
                setTimeout(() => {
                    logger.info(`📱 Requesting devices again for ${data.participantId}`);
                    recordersManager.requestRecorderDevices(data.participantId);
                }, 3000);
            }
        }
        
        this.updateStatistics();
    }

    handleRecorderStatusUpdate(message) {
        const data = message.data;
        recordersManager.updateRecorder(data.streamId, {
            status: data.status
        });
        
        logger.success(`📊 Recorder status: ${data.streamId} -> ${data.status}`);
        this.updateStatistics();
    }

    handleRecorderRemoved(message) {
        const data = message.data;
        recordersManager.removeRecorder(data.streamId);
        logger.warning(`📹 Recorder removed: ${data.streamId}`);
        this.updateStatistics();
    }

    handleRoomStreamsResponse(message) {
        const data = message.data;
        logger.success(`📋 Room streams response: ${data.streams ? data.streams.length : 0} recorders`);
        
        if (data.streams && data.streams.length > 0) {
            data.streams.forEach(recorderData => {
                if (recorderData.type === 'recorder' && !recordersManager.getRecorder(recorderData.streamId)) {
                    logger.success(`📹 Adding existing recorder: ${recorderData.streamId}`);
                    
                    recordersManager.addRecorder(recorderData.streamId, {
                        streamName: recorderData.streamName || recorderData.streamId,
                        status: recorderData.status || 'ready',
                        type: 'recorder',
                        platform: recorderData.platform || 'macOS'
                    });
                }
            });
        }
        
        this.updateStatistics();
    }

    handleRecordingProgress(message) {
        const data = message.data;
        logger.info(`📤 Upload progress: ${data.streamId} - ${data.completedUploads}/${data.totalSegments} (${Math.round(data.progress * 100)}%)`);
        
        recordersManager.updateRecorder(data.streamId, {
            uploadProgress: {
                completed: data.completedUploads,
                total: data.totalSegments,
                progress: data.progress
            }
        });
        
        this.updateUploadStatus();
    }

    handleBitrateChanged(message) {
        const data = message.data;
        recordersManager.updateRecorder(data.streamId, {
            settings: { bitrate: data.bitrate }
        });
        logger.success(`📊 Bitrate changed: ${data.streamId} -> ${data.bitrate} Mbps`);
    }

    handleResolutionChanged(message) {
        const data = message.data;
        recordersManager.updateRecorder(data.streamId, {
            settings: { resolution: data.resolution }
        });
        logger.success(`📺 Resolution changed: ${data.streamId} -> ${data.resolution}`);
    }

    handleFramerateChanged(message) {
        const data = message.data;
        recordersManager.updateRecorder(data.streamId, {
            settings: { framerate: data.framerate }
        });
        logger.success(`🎬 Framerate changed: ${data.streamId} -> ${data.framerate} fps`);
    }

    handleDeviceChanged(message) {
        const data = message.data;
        const deviceType = data.deviceType === 'video' ? 'Video' : 'Audio';
        recordersManager.updateRecorder(data.streamId, {
            devices: {
                [data.deviceType]: {
                    id: data.deviceId,
                    label: data.deviceLabel
                }
            }
        });
        logger.success(`🔄 ${deviceType} device changed: ${data.streamId} -> ${data.deviceLabel}`);
    }

    handleDeviceUpdate(message) {
        const data = message.data;
        logger.success(`🔧🔧🔧 DEVICE UPDATE RECEIVED from ${data.streamId}`);
        console.log('Full device data received:', data);
        console.log('Video devices:', data.videoDevices);
        console.log('Audio devices:', data.audioDevices);
        
        const updates = {
            devices: {
                audio: {},
                video: {}
            }
        };

        // Update current device selections if provided
        if (data.audioDeviceId) {
            updates.devices.audio.id = data.audioDeviceId;
            updates.devices.audio.label = data.audioDeviceLabel || 'Unknown';
        }
        if (data.videoDeviceId) {
            updates.devices.video.id = data.videoDeviceId;
            updates.devices.video.label = data.videoDeviceLabel || 'Unknown';
        }
        
        // Update available device lists - handle both formats
        // Format 1: Direct arrays (from Mac app)
        if (data.videoDevices) {
            updates.devices.video.available = data.videoDevices;
            logger.success(`📹 Updated ${data.streamId} video devices: ${data.videoDevices.length} available`);
        }
        if (data.audioDevices) {
            updates.devices.audio.available = data.audioDevices;
            logger.success(`🎤 Updated ${data.streamId} audio devices: ${data.audioDevices.length} available`);
        }
        
        // Format 2: Nested in allDevices (from other sources)
        if (data.allDevices) {
            if (data.allDevices.audioDevices) {
                updates.devices.audio.available = data.allDevices.audioDevices;
                logger.success(`🎤 Updated ${data.streamId} audio devices: ${data.allDevices.audioDevices.length} available`);
            }
            if (data.allDevices.videoDevices) {
                updates.devices.video.available = data.allDevices.videoDevices;
                logger.success(`📹 Updated ${data.streamId} video devices: ${data.allDevices.videoDevices.length} available`);
            }
        }
        
        recordersManager.updateRecorder(data.streamId, updates);
    }

    // UI Updates
    updateStatistics() {
        const stats = recordersManager.getStatistics();
        
        document.getElementById('totalRecorders').textContent = stats.total;
        document.getElementById('activeRecordings').textContent = stats.recording;
        document.getElementById('averageQuality').textContent = stats.averageQuality || 'N/A';
    }

    updateUploadStatus() {
        const uploadStats = recordersManager.getUploadStatistics();
        
        // Update global progress
        const globalProgress = document.getElementById('globalUploadProgress');
        globalProgress.style.width = `${uploadStats.overallProgress}%`;
        
        const progressText = document.getElementById('uploadProgressText');
        if (uploadStats.activeUploads > 0) {
            progressText.textContent = `${uploadStats.activeUploads} recorders uploading - ${Math.round(uploadStats.overallProgress)}% complete`;
        } else {
            progressText.textContent = 'No uploads in progress';
        }
        
        // Update total progress in stats
        document.getElementById('totalUploadProgress').textContent = `${Math.round(uploadStats.overallProgress)}%`;
    }

    // Confirmation Modal
    confirmAction(title, message, callback) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmModal').style.display = 'flex';
        this.confirmCallback = callback;
    }

    hideModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.confirmCallback = null;
    }

    executeConfirmation() {
        if (this.confirmCallback) {
            this.confirmCallback();
            this.confirmCallback = null;
        }
        this.hideModal();
    }
}

// Initialize the application
const app = new RecorderControlApp();

// Export for debugging
window.recorderControlApp = app;
window.logger = logger;
window.connectionManager = connectionManager;
window.recordersManager = recordersManager;
window.recorderControls = recorderControls;