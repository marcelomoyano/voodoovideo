// Streamers module - manages streamer data and UI
import { logger } from './logger.js';
import { connectionManager } from './connection.js';

export class StreamersManager {
    constructor() {
        this.streamers = new Map();
        this.onStreamerUpdate = null;
    }

    addStreamer(streamId, data) {
        const streamer = {
            streamId: streamId,
            streamName: data.streamName || `${streamId}'s Stream`,
            status: data.status || 'ready',
            room: data.room || connectionManager.currentRoom,
            devices: {
                video: { 
                    id: data.videoDeviceId || null, 
                    label: data.videoDeviceLabel || 'Unknown', 
                    available: data.videoDevices || [] 
                },
                audio: { 
                    id: data.audioDeviceId || null, 
                    label: data.audioDeviceLabel || 'Unknown', 
                    available: data.audioDevices || [] 
                }
            },
            settings: {
                audioMuted: data.audioMuted || false,
                videoMuted: data.videoMuted || false,
                studioSound: data.studioSound || false,
                bitrate: data.bitrate || 3000,
                codec: data.codec || 'VP9',
                resolution: data.resolution || '1080p',
                framerate: data.framerate || 30,
                whipEndpoint: data.whipEndpoint || `https://stream.voodoostudios.tv/${connectionManager.currentRoom}/${streamId}/whip`
            }
        };
        
        this.streamers.set(streamId, streamer);
        this.updateUI();
        return streamer;
    }

    updateStreamer(streamId, updates) {
        const streamer = this.streamers.get(streamId);
        if (!streamer) return null;

        // Deep merge updates
        if (updates.devices) {
            if (updates.devices.video) {
                Object.assign(streamer.devices.video, updates.devices.video);
            }
            if (updates.devices.audio) {
                Object.assign(streamer.devices.audio, updates.devices.audio);
            }
        }

        if (updates.settings) {
            Object.assign(streamer.settings, updates.settings);
        }

        if (updates.status !== undefined) {
            streamer.status = updates.status;
        }

        if (updates.streamName !== undefined) {
            streamer.streamName = updates.streamName;
        }

        this.updateStreamerCard(streamId);
        return streamer;
    }

    removeStreamer(streamId) {
        this.streamers.delete(streamId);
        this.updateUI();
    }

    getStreamer(streamId) {
        return this.streamers.get(streamId);
    }

    clear() {
        this.streamers.clear();
        this.updateUI();
    }

    updateUI() {
        const container = document.getElementById('streamersContainer');
        const countEl = document.getElementById('streamerCount');
        
        if (!container) return;
        
        countEl.textContent = `(${this.streamers.size})`;
        
        if (this.streamers.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Streamers Connected</h3>
                    <p>Waiting for streamers to connect to room: ${connectionManager.currentRoom || 'none'}</p>
                </div>
            `;
            return;
        }

        const streamersGrid = document.createElement('div');
        streamersGrid.className = 'streamers-grid';

        for (const [streamId, streamer] of this.streamers) {
            const card = this.createStreamerCard(streamer);
            streamersGrid.appendChild(card);
        }

        container.innerHTML = '';
        container.appendChild(streamersGrid);
    }

    createStreamerCard(streamer) {
        const card = document.createElement('div');
        card.className = 'streamer-card';
        card.id = `streamer-${streamer.streamId}`;

        const statusClass = streamer.status === 'streaming' ? 'status-streaming' : 
                           streamer.status === 'ready' ? 'status-ready' : 'status-offline';

        card.innerHTML = `
            <div class="streamer-header">
                <div class="streamer-name">${streamer.streamName}</div>
                <div class="streamer-status ${statusClass}">${streamer.status}</div>
            </div>

            <!-- Device Controls -->
            <div class="device-controls">
                <div class="device-row">
                    <span class="device-label">Video:</span>
                    <select class="device-select" data-streamer="${streamer.streamId}" data-type="video">
                        <option value="">Select video device...</option>
                        ${streamer.devices.video.available.map(device => 
                            `<option value="${device.deviceId}" ${device.deviceId === streamer.devices.video.id ? 'selected' : ''}>
                                ${device.label}
                            </option>`
                        ).join('')}
                    </select>
                </div>
                <div class="device-row">
                    <span class="device-label">Audio:</span>
                    <select class="device-select" data-streamer="${streamer.streamId}" data-type="audio">
                        <option value="">Select audio device...</option>
                        ${streamer.devices.audio.available.map(device => 
                            `<option value="${device.deviceId}" ${device.deviceId === streamer.devices.audio.id ? 'selected' : ''}>
                                ${device.label}
                            </option>`
                        ).join('')}
                    </select>
                </div>
            </div>

            <!-- Mute Controls -->
            <div class="toggle-controls">
                <button class="toggle-btn ${streamer.settings.audioMuted ? 'muted' : ''}" 
                        data-streamer="${streamer.streamId}" data-action="toggle-audio">
                    ${streamer.settings.audioMuted ? 'Audio Muted' : 'Audio On'}
                </button>
                <button class="toggle-btn ${streamer.settings.videoMuted ? 'muted' : ''}" 
                        data-streamer="${streamer.streamId}" data-action="toggle-video">
                    ${streamer.settings.videoMuted ? 'Video Muted' : 'Video On'}
                </button>
            </div>

            <!-- Studio Sound & Quality -->
            <div class="quality-controls">
                <div class="quality-row">
                    <span class="device-label">Studio Sound:</span>
                    <button class="toggle-btn ${streamer.settings.studioSound ? 'active' : ''}" 
                            data-streamer="${streamer.streamId}" data-action="toggle-studio">
                        ${streamer.settings.studioSound ? 'Studio On' : 'Studio Off'}
                    </button>
                </div>
                <div class="quality-row">
                    <span class="device-label">Codec:</span>
                    <select class="quality-select" data-streamer="${streamer.streamId}" data-type="codec">
                        <option value="H264" ${streamer.settings.codec === 'H264' ? 'selected' : ''}>H.264</option>
                        <option value="VP9" ${streamer.settings.codec === 'VP9' ? 'selected' : ''}>VP9</option>
                        <option value="VP8" ${streamer.settings.codec === 'VP8' ? 'selected' : ''}>VP8</option>
                        <option value="AV1" ${streamer.settings.codec === 'AV1' ? 'selected' : ''}>AV1</option>
                    </select>
                </div>
                <div class="quality-row">
                    <span class="device-label">Resolution:</span>
                    <select class="quality-select" data-streamer="${streamer.streamId}" data-type="resolution">
                        <option value="2160p" ${streamer.settings.resolution === '2160p' ? 'selected' : ''}>4K (2160p)</option>
                        <option value="1440p" ${streamer.settings.resolution === '1440p' ? 'selected' : ''}>2K (1440p)</option>
                        <option value="1080p" ${streamer.settings.resolution === '1080p' ? 'selected' : ''}>Full HD (1080p)</option>
                        <option value="720p" ${streamer.settings.resolution === '720p' ? 'selected' : ''}>HD (720p)</option>
                        <option value="540p" ${streamer.settings.resolution === '540p' ? 'selected' : ''}>qHD (540p)</option>
                        <option value="480p" ${streamer.settings.resolution === '480p' ? 'selected' : ''}>SD (480p)</option>
                        <option value="360p" ${streamer.settings.resolution === '360p' ? 'selected' : ''}>Low (360p)</option>
                    </select>
                </div>
                <div class="quality-row">
                    <span class="device-label">Frame Rate:</span>
                    <select class="quality-select" data-streamer="${streamer.streamId}" data-type="framerate">
                        <option value="15" ${streamer.settings.framerate === 15 ? 'selected' : ''}>15 fps</option>
                        <option value="24" ${streamer.settings.framerate === 24 ? 'selected' : ''}>24 fps</option>
                        <option value="25" ${streamer.settings.framerate === 25 ? 'selected' : ''}>25 fps</option>
                        <option value="30" ${streamer.settings.framerate === 30 ? 'selected' : ''}>30 fps</option>
                        <option value="50" ${streamer.settings.framerate === 50 ? 'selected' : ''}>50 fps</option>
                        <option value="60" ${streamer.settings.framerate === 60 ? 'selected' : ''}>60 fps</option>
                    </select>
                </div>
                <div class="quality-row">
                    <span class="device-label">Bitrate:</span>
                    <select class="quality-select" data-streamer="${streamer.streamId}" data-type="bitrate">
                        <option value="500" ${streamer.settings.bitrate === 500 ? 'selected' : ''}>0.5 Mbps</option>
                        <option value="1000" ${streamer.settings.bitrate === 1000 ? 'selected' : ''}>1 Mbps</option>
                        <option value="2000" ${streamer.settings.bitrate === 2000 ? 'selected' : ''}>2 Mbps</option>
                        <option value="2500" ${streamer.settings.bitrate === 2500 ? 'selected' : ''}>2.5 Mbps</option>
                        <option value="3000" ${streamer.settings.bitrate === 3000 ? 'selected' : ''}>3 Mbps</option>
                        <option value="4000" ${streamer.settings.bitrate === 4000 ? 'selected' : ''}>4 Mbps</option>
                        <option value="5000" ${streamer.settings.bitrate === 5000 ? 'selected' : ''}>5 Mbps</option>
                        <option value="8000" ${streamer.settings.bitrate === 8000 ? 'selected' : ''}>8 Mbps</option>
                        <option value="10000" ${streamer.settings.bitrate === 10000 ? 'selected' : ''}>10 Mbps</option>
                    </select>
                </div>
                <div class="quality-row">
                    <span class="device-label">WHIP:</span>
                    <input type="text" class="endpoint-input" id="whip-${streamer.streamId}" 
                           value="${streamer.settings.whipEndpoint}"
                           data-streamer="${streamer.streamId}" />
                    <button class="action-btn btn-secondary" style="margin-left: 8px; padding: 6px 12px;" 
                            data-streamer="${streamer.streamId}" data-action="update-whip">
                        Update
                    </button>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="action-buttons">
                <button class="action-btn btn-start" data-streamer="${streamer.streamId}" data-action="start">
                    Start
                </button>
                <button class="action-btn btn-stop" data-streamer="${streamer.streamId}" data-action="stop">
                    Stop
                </button>
                <button class="action-btn btn-preview" data-streamer="${streamer.streamId}" data-action="preview">
                    Preview
                </button>
            </div>
        `;

        return card;
    }

    updateStreamerCard(streamId) {
        const streamer = this.streamers.get(streamId);
        if (!streamer) return;

        const card = document.getElementById(`streamer-${streamId}`);
        if (!card) return;

        // Recreate the card with updated data
        const newCard = this.createStreamerCard(streamer);
        card.parentNode.replaceChild(newCard, card);
    }

    requestStreamerDevices(streamId) {
        logger.info(`Requesting device info from ${streamId}...`);
        
        const command = {
            command: 'REQUEST_DEVICE_LIST',
            streamId: streamId,
            timestamp: Date.now()
        };
        
        connectionManager.publish('producer-command', command)
            .then(() => logger.success(`Device request sent to ${streamId}`))
            .catch(err => logger.error(`Failed to send device request: ${err.message}`));
    }
}

// Export singleton instance
export const streamersManager = new StreamersManager();