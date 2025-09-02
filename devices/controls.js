// Controls module - handles all remote control commands
import { logger } from './logger.js';
import { connectionManager } from './connection.js';
import { streamersManager } from './streamers.js';

export class DeviceControls {
    constructor() {
        this.commandQueue = [];
    }

    // Device control methods
    changeVideoDevice(streamId, deviceId) {
        if (!deviceId) return;
        
        logger.success(`Changing video device for ${streamId} to: ${deviceId}`);
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_VIDEO_DEVICE',
            streamId: streamId,
            deviceId: deviceId,
            timestamp: Date.now()
        });
    }

    changeAudioDevice(streamId, deviceId) {
        if (!deviceId) return;
        
        logger.success(`Changing audio device for ${streamId} to: ${deviceId}`);
        
        return connectionManager.publish('producer-command', {
            command: 'CHANGE_AUDIO_DEVICE',
            streamId: streamId,
            deviceId: deviceId,
            timestamp: Date.now()
        });
    }

    toggleAudioMute(streamId) {
        const streamer = streamersManager.getStreamer(streamId);
        if (!streamer) return;

        const newMuteState = !streamer.settings.audioMuted;
        logger.success(`${newMuteState ? 'Muting' : 'Unmuting'} audio for ${streamId}`);

        return connectionManager.publish('producer-command', {
            command: 'TOGGLE_AUDIO_MUTE',
            streamId: streamId,
            muted: newMuteState,
            timestamp: Date.now()
        });
    }

    toggleVideoMute(streamId) {
        const streamer = streamersManager.getStreamer(streamId);
        if (!streamer) return;

        const newMuteState = !streamer.settings.videoMuted;
        logger.success(`${newMuteState ? 'Muting' : 'Unmuting'} video for ${streamId}`);

        return connectionManager.publish('producer-command', {
            command: 'TOGGLE_VIDEO_MUTE',
            streamId: streamId,
            muted: newMuteState,
            timestamp: Date.now()
        });
    }

    toggleStudioSound(streamId) {
        const streamer = streamersManager.getStreamer(streamId);
        if (!streamer) return;

        const newState = !streamer.settings.studioSound;
        logger.success(`${newState ? 'Enabling' : 'Disabling'} studio sound for ${streamId}`);

        return connectionManager.publish('producer-command', {
            command: 'TOGGLE_STUDIO_SOUND',
            streamId: streamId,
            studioSound: newState,
            timestamp: Date.now()
        });
    }

    changeBitrate(streamId, bitrate) {
        logger.success(`Changing bitrate for ${streamId} to: ${bitrate} kbps`);

        return connectionManager.publish('producer-command', {
            command: 'CHANGE_BITRATE',
            streamId: streamId,
            bitrate: parseInt(bitrate),
            timestamp: Date.now()
        });
    }

    changeCodec(streamId, codec) {
        logger.success(`Changing codec for ${streamId} to: ${codec}`);

        return connectionManager.publish('producer-command', {
            command: 'CHANGE_CODEC',
            streamId: streamId,
            codec: codec,
            timestamp: Date.now()
        });
    }

    changeResolution(streamId, resolution) {
        logger.success(`Changing resolution for ${streamId} to: ${resolution}`);

        return connectionManager.publish('producer-command', {
            command: 'CHANGE_RESOLUTION',
            streamId: streamId,
            resolution: resolution,
            timestamp: Date.now()
        });
    }

    changeFramerate(streamId, framerate) {
        logger.success(`Changing framerate for ${streamId} to: ${framerate} fps`);

        return connectionManager.publish('producer-command', {
            command: 'CHANGE_FRAMERATE',
            streamId: streamId,
            framerate: parseInt(framerate),
            timestamp: Date.now()
        });
    }

    updateWhipEndpoint(streamId) {
        const streamer = streamersManager.getStreamer(streamId);
        if (!streamer) return;

        // Get the value from the input field
        const inputField = document.getElementById(`whip-${streamId}`);
        if (!inputField) {
            logger.error(`WHIP input field not found for ${streamId}`);
            return;
        }

        const newEndpoint = inputField.value.trim();
        
        // Validate the endpoint
        if (!newEndpoint) {
            logger.error(`WHIP endpoint cannot be empty`);
            return;
        }

        // Only update if it changed
        if (newEndpoint === streamer.settings.whipEndpoint) {
            logger.info(`WHIP endpoint unchanged for ${streamId}`);
            return;
        }

        streamer.settings.whipEndpoint = newEndpoint;
        logger.success(`WHIP endpoint updated for ${streamId}: ${newEndpoint}`);

        return connectionManager.publish('producer-command', {
            command: 'CHANGE_WHIP_ENDPOINT',
            streamId: streamId,
            whipEndpoint: newEndpoint,
            timestamp: Date.now()
        });
    }

    startStream(streamId) {
        logger.success(`Starting stream for ${streamId}`);

        return connectionManager.publish('producer-command', {
            command: 'START_STREAM',
            streamId: streamId,
            timestamp: Date.now()
        });
    }

    stopStream(streamId) {
        logger.warning(`Stopping stream for ${streamId}`);

        return connectionManager.publish('producer-command', {
            command: 'STOP_STREAM',
            streamId: streamId,
            timestamp: Date.now()
        });
    }

    // Global control methods
    toggleAllStudioSound() {
        const streamers = streamersManager.streamers;
        const enabled = Array.from(streamers.values()).some(s => !s.settings.studioSound);
        
        for (const streamId of streamers.keys()) {
            connectionManager.publish('producer-command', {
                command: 'TOGGLE_STUDIO_SOUND',
                streamId: streamId,
                studioSound: enabled,
                timestamp: Date.now()
            });
        }
        
        logger.success(`${enabled ? 'Enabled' : 'Disabled'} studio sound for all streamers`);
    }

    muteAllAudio() {
        const streamers = streamersManager.streamers;
        
        for (const streamId of streamers.keys()) {
            connectionManager.publish('producer-command', {
                command: 'TOGGLE_AUDIO_MUTE',
                streamId: streamId,
                muted: true,
                timestamp: Date.now()
            });
        }
        
        logger.warning('Muted audio for all streamers');
    }

    unmuteAllAudio() {
        const streamers = streamersManager.streamers;
        
        for (const streamId of streamers.keys()) {
            connectionManager.publish('producer-command', {
                command: 'TOGGLE_AUDIO_MUTE',
                streamId: streamId,
                muted: false,
                timestamp: Date.now()
            });
        }
        
        logger.success('Unmuted audio for all streamers');
    }

    setAllQuality(level) {
        const streamers = streamersManager.streamers;
        const bitrate = level === 'high' ? 3000 : 1000;
        
        for (const streamId of streamers.keys()) {
            connectionManager.publish('producer-command', {
                command: 'CHANGE_BITRATE',
                streamId: streamId,
                bitrate: bitrate,
                timestamp: Date.now()
            });
        }
        
        logger.success(`Set ${level} quality (${bitrate} kbps) for all streamers`);
    }

    // Test device sync
    testDeviceSync() {
        if (!connectionManager.deviceSyncChannel) {
            logger.error('Device sync channel not initialized');
            return;
        }
        
        logger.info('Testing device sync...');
        
        // Send a test message to device sync channel
        connectionManager.publishToDeviceChannel('test-sync', {
            from: 'device-controller',
            timestamp: Date.now(),
            test: true
        }).then(() => {
            logger.success('Test sync message sent successfully');
        }).catch(err => {
            logger.error(`Test sync failed: ${err.message}`);
        });
        
        // Request devices from all known streamers
        for (const streamId of streamersManager.streamers.keys()) {
            logger.info(`Manually requesting devices from ${streamId}`);
            streamersManager.requestStreamerDevices(streamId);
        }
    }

    // Discover streamers
    async discoverStreamers() {
        if (!connectionManager.isConnected) {
            logger.error('Not connected to any room');
            return;
        }

        logger.success('Manually discovering streamers...');
        
        // Request room streams
        connectionManager.requestRoomStreams();

        // Check presence
        try {
            const members = await connectionManager.getPresence();
            logger.success(`Found ${members.length} presence members`);
            
            members.forEach(member => {
                logger.info(`Presence member: ${member.clientId} - ${JSON.stringify(member.data)}`);
                if (member.data && member.data.role === 'streamer') {
                    const data = {
                        participantId: member.clientId,
                        participantName: member.data.participantName || member.clientId,
                        role: 'streamer',
                        room: connectionManager.currentRoom
                    };
                    
                    if (!streamersManager.getStreamer(member.clientId)) {
                        streamersManager.addStreamer(member.clientId, {
                            streamName: data.participantName,
                            status: 'ready'
                        });
                        
                        setTimeout(() => {
                            streamersManager.requestStreamerDevices(member.clientId);
                        }, 1000);
                    }
                }
            });
        } catch (error) {
            logger.error(`Presence check failed: ${error.message}`);
        }

        // Send a general ping
        connectionManager.publish('device-controller-ping', {
            from: 'device-controller',
            room: connectionManager.currentRoom,
            timestamp: Date.now()
        });

        // Check MediaMTX for active streams
        const mediaMTXStreams = await connectionManager.checkActiveMediaMTXStreams();
        let foundStreams = 0;
        
        if (mediaMTXStreams && mediaMTXStreams.length > 0) {
            mediaMTXStreams.forEach(item => {
                // Check if path matches our room pattern: room/streamId
                const pathParts = item.name.split('/');
                if (pathParts.length === 2 && pathParts[0] === connectionManager.currentRoom) {
                    const streamId = pathParts[1];
                    foundStreams++;
                    
                    // Add if we don't already have this stream
                    if (!streamersManager.getStreamer(streamId)) {
                        logger.success(`Found active MediaMTX stream: ${streamId}`);
                        
                        streamersManager.addStreamer(streamId, {
                            streamName: `${streamId}'s Stream`,
                            status: 'streaming'
                        });
                    }
                }
            });
        }
        
        if (foundStreams > 0) {
            logger.success(`Found ${foundStreams} active streams in MediaMTX`);
        } else {
            logger.info(`No active streams found in MediaMTX for room: ${connectionManager.currentRoom}`);
        }
    }
}

// Export singleton instance
export const deviceControls = new DeviceControls();