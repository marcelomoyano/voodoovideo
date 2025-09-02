// Recorder Controls module - handles all remote recording control commands
import { logger } from './logger.js';
import { connectionManager } from './connection.js';
import { recordersManager } from './recorder-manager.js';

export class RecorderControls {
    constructor() {
        this.commandQueue = [];
        this.pendingCommands = new Map(); // Track pending commands with timeouts
    }

    // Recording Control Methods
    startRecording(recorderId) {
        if (!recorderId) return;
        
        logger.success(`▶️ Starting recording for ${recorderId}`);
        
        this.trackCommand(recorderId, 'START_RECORDING');
        
        return connectionManager.publish('producer-command', {
            command: 'START_RECORDING',
            streamId: recorderId,
            timestamp: Date.now()
        });
    }

    stopRecording(recorderId) {
        if (!recorderId) return;
        
        logger.warning(`⏹️ Stopping recording for ${recorderId}`);
        
        this.trackCommand(recorderId, 'STOP_RECORDING');
        
        return connectionManager.publish('producer-command', {
            command: 'STOP_RECORDING',
            streamId: recorderId,
            timestamp: Date.now()
        });
    }

    forceStopRecording(recorderId) {
        if (!recorderId) return;
        
        logger.error(`🛑 Force stopping recording for ${recorderId}`);
        
        this.trackCommand(recorderId, 'END_SESSION');
        
        return connectionManager.publish('producer-command', {
            command: 'END_SESSION',
            streamId: recorderId,
            reason: 'Force stopped by producer',
            timestamp: Date.now()
        });
    }

    // Device Control Methods
    changeVideoDevice(recorderId, deviceId) {
        if (!recorderId || !deviceId) return;
        
        logger.success(`📹 Changing video device for ${recorderId} to: ${deviceId}`);
        
        this.trackCommand(recorderId, 'CHANGE_VIDEO_DEVICE');
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_VIDEO_DEVICE',
            streamId: recorderId,
            deviceId: deviceId,
            timestamp: Date.now()
        });
    }

    changeAudioDevice(recorderId, deviceId) {
        if (!recorderId || !deviceId) return;
        
        logger.success(`🎤 Changing audio device for ${recorderId} to: ${deviceId}`);
        
        this.trackCommand(recorderId, 'CHANGE_AUDIO_DEVICE');
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_AUDIO_DEVICE',
            streamId: recorderId,
            deviceId: deviceId,
            timestamp: Date.now()
        });
    }

    // Recording Quality Control Methods
    changeResolution(recorderId, resolution) {
        if (!recorderId || !resolution) return;
        
        logger.success(`📺 Changing resolution for ${recorderId} to: ${resolution}`);
        
        this.trackCommand(recorderId, 'CHANGE_RESOLUTION');
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_RESOLUTION',
            streamId: recorderId,
            resolution: resolution,
            timestamp: Date.now()
        });
    }

    changeBitrate(recorderId, bitrate) {
        if (!recorderId || !bitrate) return;
        
        logger.success(`📊 Changing bitrate for ${recorderId} to: ${bitrate} Mbps`);
        
        this.trackCommand(recorderId, 'CHANGE_BITRATE');
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_BITRATE',
            streamId: recorderId,
            bitrate: parseInt(bitrate),
            timestamp: Date.now()
        });
    }

    changeFramerate(recorderId, framerate) {
        if (!recorderId || !framerate) return;
        
        logger.success(`🎬 Changing framerate for ${recorderId} to: ${framerate} fps`);
        
        this.trackCommand(recorderId, 'CHANGE_FRAMERATE');
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_FRAMERATE',
            streamId: recorderId,
            framerate: parseInt(framerate),
            timestamp: Date.now()
        });
    }

    changeDynamicRange(recorderId, dynamicRange) {
        if (!recorderId || !dynamicRange) return;
        
        logger.success(`🌈 Changing dynamic range for ${recorderId} to: ${dynamicRange}`);
        
        this.trackCommand(recorderId, 'CHANGE_DYNAMIC_RANGE');
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_DYNAMIC_RANGE',
            streamId: recorderId,
            dynamicRange: dynamicRange,
            timestamp: Date.now()
        });
    }

    // R2 Configuration Methods
    updateR2Config(recorderId, config) {
        if (!recorderId || !config) return;
        
        logger.success(`☁️ Updating R2 config for ${recorderId}`);
        
        this.trackCommand(recorderId, 'UPDATE_R2_CONFIG');
        
        return connectionManager.publish('producer-command', {
            command: 'UPDATE_R2_CONFIG',
            streamId: recorderId,
            r2Config: {
                accessKey: config.accessKey,
                secretKey: config.secretKey,
                endpoint: config.endpoint || 'https://e561d71f6685e1ddd58b290d834f940e.r2.cloudflarestorage.com/vod',
                bucketPath: `${connectionManager.currentRoom}/${recorderId}`
            },
            timestamp: Date.now()
        });
    }

    // Global Control Methods
    startAllRecording() {
        const recorders = recordersManager.recorders;
        let startedCount = 0;
        
        for (const [recorderId, recorder] of recorders) {
            if (recorder.status === 'ready') {
                this.startRecording(recorderId);
                startedCount++;
            }
        }
        
        logger.success(`▶️ Started recording on ${startedCount} recorders`);
        return startedCount;
    }

    stopAllRecording() {
        const recorders = recordersManager.recorders;
        let stoppedCount = 0;
        
        for (const [recorderId, recorder] of recorders) {
            if (recorder.status === 'recording') {
                this.stopRecording(recorderId);
                stoppedCount++;
            }
        }
        
        logger.warning(`⏹️ Stopped recording on ${stoppedCount} recorders`);
        return stoppedCount;
    }

    setAllQuality(quality) {
        const recorders = recordersManager.recorders;
        const qualitySettings = this.getQualitySettings(quality);
        let updatedCount = 0;
        
        for (const recorderId of recorders.keys()) {
            // Update resolution
            this.changeResolution(recorderId, qualitySettings.resolution);
            
            // Update bitrate 
            this.changeBitrate(recorderId, qualitySettings.bitrate);
            
            // Update framerate if specified
            if (qualitySettings.framerate) {
                this.changeFramerate(recorderId, qualitySettings.framerate);
            }
            
            updatedCount++;
        }
        
        logger.success(`📺 Set ${quality} quality on ${updatedCount} recorders`);
        return updatedCount;
    }

    setAllDevices(deviceType, deviceId) {
        const recorders = recordersManager.recorders;
        let updatedCount = 0;
        
        for (const recorderId of recorders.keys()) {
            if (deviceType === 'video') {
                this.changeVideoDevice(recorderId, deviceId);
            } else if (deviceType === 'audio') {
                this.changeAudioDevice(recorderId, deviceId);
            }
            updatedCount++;
        }
        
        logger.success(`🔄 Updated ${deviceType} device on ${updatedCount} recorders`);
        return updatedCount;
    }

    // Discovery and Status Methods
    async discoverRecorders() {
        if (!connectionManager.isConnected) {
            logger.error('❌ Not connected to any room');
            return;
        }

        logger.success('🔍 Discovering recorders in room...');
        
        // Request room streams
        connectionManager.requestRoomStreams();

        // Check presence
        try {
            const members = await connectionManager.getPresence();
            logger.success(`👥 Found ${members.length} presence members`);
            
            members.forEach(member => {
                logger.info(`Presence member: ${member.clientId} - ${JSON.stringify(member.data)}`);
                if (member.data && (member.data.type === 'recorder' || member.data.platform === 'macOS')) {
                    const data = {
                        participantId: member.clientId,
                        participantName: member.data.participantName || member.clientId,
                        type: 'recorder',
                        platform: member.data.platform || 'macOS',
                        room: connectionManager.currentRoom
                    };
                    
                    if (!recordersManager.getRecorder(member.clientId)) {
                        recordersManager.addRecorder(member.clientId, {
                            streamName: data.participantName,
                            status: 'ready',
                            type: 'recorder',
                            platform: data.platform
                        });
                        
                        setTimeout(() => {
                            recordersManager.requestRecorderStatus(member.clientId);
                        }, 1000);
                    }
                }
            });
        } catch (error) {
            logger.error(`❌ Presence check failed: ${error.message}`);
        }

        // Send a discovery ping
        connectionManager.publish('recorder-discovery-ping', {
            from: 'producer-recorder-control',
            room: connectionManager.currentRoom,
            timestamp: Date.now()
        });
    }

    requestRecorderStatus(recorderId) {
        logger.info(`📊 Requesting status for ${recorderId}`);
        
        return connectionManager.publish('producer-request', {
            command: 'GET_RECORDER_STATUS',
            streamId: recorderId,
            timestamp: Date.now()
        });
    }
    
    syncDevices(recorderId) {
        logger.success(`🔄 Syncing devices for ${recorderId}`);
        
        // Clear any existing device data to force refresh
        recordersManager.updateRecorder(recorderId, {
            devices: {
                audio: { available: [] },
                video: { available: [] }
            }
        });
        
        // Request fresh device information
        return connectionManager.publish('producer-command', {
            command: 'SYNC_DEVICES',
            streamId: recorderId,
            timestamp: Date.now()
        });
    }

    requestAllRecorderStatus() {
        const recorders = recordersManager.recorders;
        
        for (const recorderId of recorders.keys()) {
            this.requestRecorderStatus(recorderId);
        }
        
        logger.success(`📊 Requested status for ${recorders.size} recorders`);
    }

    // Utility Methods
    getQualitySettings(quality) {
        const settings = {
            '4K': {
                resolution: '4K',
                bitrate: 20,
                framerate: 30
            },
            '1080p': {
                resolution: '1080p',
                bitrate: 10,
                framerate: 30
            },
            '720p': {
                resolution: '720p', 
                bitrate: 5,
                framerate: 30
            },
            '480p': {
                resolution: '480p',
                bitrate: 5,
                framerate: 24
            }
        };
        
        return settings[quality] || settings['1080p'];
    }

    trackCommand(recorderId, command) {
        const commandKey = `${recorderId}-${command}`;
        
        // Clear any existing timeout for this command
        if (this.pendingCommands.has(commandKey)) {
            clearTimeout(this.pendingCommands.get(commandKey));
        }
        
        // Set a timeout to clear the pending command
        const timeoutId = setTimeout(() => {
            this.pendingCommands.delete(commandKey);
            logger.warning(`⏱️ Command timeout: ${command} for ${recorderId}`);
        }, 10000); // 10 second timeout
        
        this.pendingCommands.set(commandKey, timeoutId);
        
        // Update UI to show pending state
        recordersManager.updateRecorderPendingCommand(recorderId, command);
    }

    clearPendingCommand(recorderId, command) {
        const commandKey = `${recorderId}-${command}`;
        
        if (this.pendingCommands.has(commandKey)) {
            clearTimeout(this.pendingCommands.get(commandKey));
            this.pendingCommands.delete(commandKey);
        }
        
        // Update UI to clear pending state
        recordersManager.clearRecorderPendingCommand(recorderId, command);
    }

    // Emergency Methods
    emergencyStopAll() {
        const recorders = recordersManager.recorders;
        let stoppedCount = 0;
        
        for (const recorderId of recorders.keys()) {
            this.forceStopRecording(recorderId);
            stoppedCount++;
        }
        
        logger.error(`🚨 Emergency stop sent to ${stoppedCount} recorders`);
        return stoppedCount;
    }

    // Test Methods (for debugging)
    testRecorderConnection(recorderId) {
        logger.info(`🧪 Testing connection to ${recorderId}`);
        
        return connectionManager.publish('producer-command', {
            command: 'PING',
            streamId: recorderId,
            timestamp: Date.now()
        });
    }

    broadcastTestMessage() {
        logger.info('🧪 Broadcasting test message to all recorders');
        
        return connectionManager.publish('producer-broadcast', {
            message: 'Test message from producer recorder control',
            from: 'producer-recorder-control',
            timestamp: Date.now()
        });
    }
}

// Export singleton instance
export const recorderControls = new RecorderControls();