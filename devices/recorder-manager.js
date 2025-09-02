// Recorder Manager module - manages recorder data and UI for recording interface
import { logger } from './logger.js';
import { connectionManager } from './connection.js';

export class RecorderManager {
    constructor() {
        this.recorders = new Map();
        this.onRecorderUpdate = null;
    }

    addRecorder(recorderId, data) {
        const recorder = {
            recorderId: recorderId,
            streamName: data.streamName || `${recorderId}'s Recorder`,
            status: data.status || 'ready',
            room: data.room || connectionManager.currentRoom,
            type: data.type || 'recorder',
            platform: data.platform || 'macOS',
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
                resolution: data.resolution || '1080p',
                bitrate: data.bitrate || 5,
                framerate: data.framerate || 30,
                dynamicRange: data.dynamicRange || 'SDR',
                outputResolution: data.outputResolution || '1080p'
            },
            recording: {
                isRecording: data.isRecording || false,
                duration: data.duration || 0,
                startTime: data.startTime || null
            },
            upload: {
                progress: data.uploadProgress || 0,
                completed: data.completedUploads || 0,
                total: data.totalSegments || 0,
                r2Config: data.r2Config || null
            },
            permissions: {
                camera: data.cameraPermission || 'unknown',
                microphone: data.microphonePermission || 'unknown'
            },
            pendingCommands: new Set(),
            lastSeen: Date.now()
        };
        
        this.recorders.set(recorderId, recorder);
        this.updateUI();
        logger.info(`📹 Added recorder: ${recorderId} (${recorder.streamName})`);
        return recorder;
    }

    updateRecorder(recorderId, updates) {
        const recorder = this.recorders.get(recorderId);
        if (!recorder) return null;

        // Deep merge updates
        if (updates.devices) {
            if (updates.devices.video) {
                Object.assign(recorder.devices.video, updates.devices.video);
            }
            if (updates.devices.audio) {
                Object.assign(recorder.devices.audio, updates.devices.audio);
            }
        }

        if (updates.settings) {
            Object.assign(recorder.settings, updates.settings);
        }

        if (updates.recording) {
            Object.assign(recorder.recording, updates.recording);
        }

        if (updates.upload) {
            Object.assign(recorder.upload, updates.upload);
        }

        if (updates.permissions) {
            Object.assign(recorder.permissions, updates.permissions);
        }

        if (updates.uploadProgress) {
            recorder.upload.progress = updates.uploadProgress.progress || 0;
            recorder.upload.completed = updates.uploadProgress.completed || 0;
            recorder.upload.total = updates.uploadProgress.total || 0;
        }

        if (updates.status !== undefined) {
            recorder.status = updates.status;
            
            // Update recording state based on status
            recorder.recording.isRecording = (updates.status === 'recording');
            if (updates.status === 'recording' && !recorder.recording.startTime) {
                recorder.recording.startTime = Date.now();
            } else if (updates.status !== 'recording') {
                recorder.recording.startTime = null;
                recorder.recording.duration = 0;
            }
        }

        if (updates.streamName !== undefined) {
            recorder.streamName = updates.streamName;
        }

        recorder.lastSeen = Date.now();
        this.updateRecorderCard(recorderId);
        return recorder;
    }

    removeRecorder(recorderId) {
        this.recorders.delete(recorderId);
        this.updateUI();
        logger.info(`📹 Removed recorder: ${recorderId}`);
    }

    getRecorder(recorderId) {
        return this.recorders.get(recorderId);
    }

    clear() {
        this.recorders.clear();
        this.updateUI();
    }

    updateUI() {
        const container = document.getElementById('recordersContainer');
        const countEl = document.getElementById('recorderCount');
        
        if (!container) return;
        
        countEl.textContent = `(${this.recorders.size})`;
        
        if (this.recorders.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Recorders Connected</h3>
                    <p>Waiting for recording devices to connect to room: ${connectionManager.currentRoom || 'none'}</p>
                    <div class="empty-state-icon">🎥</div>
                </div>
            `;
            return;
        }

        const recordersGrid = document.createElement('div');
        recordersGrid.className = 'recorders-grid';

        for (const [recorderId, recorder] of this.recorders) {
            const card = this.createRecorderCard(recorder);
            recordersGrid.appendChild(card);
        }

        container.innerHTML = '';
        container.appendChild(recordersGrid);
    }

    createRecorderCard(recorder) {
        const card = document.createElement('div');
        card.className = 'recorder-card';
        card.id = `recorder-${recorder.recorderId}`;

        const statusClass = this.getStatusClass(recorder.status);
        const recordingDuration = this.formatDuration(recorder.recording.duration);
        const uploadProgress = Math.round(recorder.upload.progress * 100);

        card.innerHTML = `
            <div class="recorder-header">
                <div class="recorder-name">
                    <span class="recorder-icon">${this.getPlatformIcon(recorder.platform)}</span>
                    ${recorder.streamName}
                </div>
                <div class="recorder-status ${statusClass}">
                    ${this.getStatusDisplay(recorder.status)}
                </div>
            </div>

            <!-- Recording Info -->
            <div class="recording-info">
                <div class="recording-indicator">
                    <div class="recording-dot ${recorder.recording.isRecording ? 'recording' : ''}"></div>
                    <span class="recording-text">
                        ${recorder.recording.isRecording ? `REC ${recordingDuration}` : 'READY'}
                    </span>
                </div>
                ${recorder.upload.progress > 0 ? `
                    <div class="upload-indicator">
                        <div class="upload-progress-mini">
                            <div class="upload-fill" style="width: ${uploadProgress}%"></div>
                        </div>
                        <span class="upload-text">${uploadProgress}% uploaded</span>
                    </div>
                ` : ''}
            </div>

            <!-- Recording Controls -->
            <div class="recording-controls">
                ${!recorder.recording.isRecording ? `
                    <button class="control-btn start" data-recorder="${recorder.recorderId}" data-action="start-recording">
                        ▶️ Start Recording
                    </button>
                    <button class="control-btn sync" data-recorder="${recorder.recorderId}" data-action="sync-devices">
                        🔄 Sync Devices
                    </button>
                ` : `
                    <button class="control-btn stop" data-recorder="${recorder.recorderId}" data-action="stop-recording">
                        ⏹️ Stop Recording
                    </button>
                    <button class="control-btn force-stop" data-recorder="${recorder.recorderId}" data-action="force-stop">
                        🛑 Force Stop
                    </button>
                `}
            </div>

            <!-- Device Controls -->
            <div class="device-controls">
                <div class="control-section">
                    <h4>📹 Video Device</h4>
                    <select class="device-select" data-recorder="${recorder.recorderId}" data-type="video">
                        <option value="">Select video device...</option>
                        ${recorder.devices.video.available.map(device => 
                            `<option value="${device.deviceId}" ${device.deviceId === recorder.devices.video.id ? 'selected' : ''}>
                                ${device.label}
                            </option>`
                        ).join('')}
                    </select>
                    <div class="current-device">
                        Current: ${recorder.devices.video.label}
                    </div>
                </div>

                <div class="control-section">
                    <h4>🎤 Audio Device</h4>
                    <select class="device-select" data-recorder="${recorder.recorderId}" data-type="audio">
                        <option value="">Select audio device...</option>
                        ${recorder.devices.audio.available.map(device => 
                            `<option value="${device.deviceId}" ${device.deviceId === recorder.devices.audio.id ? 'selected' : ''}>
                                ${device.label}
                            </option>`
                        ).join('')}
                    </select>
                    <div class="current-device">
                        Current: ${recorder.devices.audio.label}
                    </div>
                </div>
            </div>

            <!-- Quality Controls -->
            <div class="quality-controls">
                <div class="quality-row">
                    <label>📺 Resolution:</label>
                    <select class="quality-select" data-recorder="${recorder.recorderId}" data-type="resolution">
                        <option value="4K" ${recorder.settings.resolution === '4K' ? 'selected' : ''}>4K (2160p)</option>
                        <option value="1080p" ${recorder.settings.resolution === '1080p' ? 'selected' : ''}>1080p</option>
                        <option value="720p" ${recorder.settings.resolution === '720p' ? 'selected' : ''}>720p</option>
                        <option value="480p" ${recorder.settings.resolution === '480p' ? 'selected' : ''}>480p</option>
                    </select>
                </div>

                <div class="quality-row">
                    <label>📊 Bitrate (Mbps):</label>
                    <select class="quality-select" data-recorder="${recorder.recorderId}" data-type="bitrate">
                        <option value="5" ${recorder.settings.bitrate === 5 ? 'selected' : ''}>5 Mbps</option>
                        <option value="8" ${recorder.settings.bitrate === 8 ? 'selected' : ''}>8 Mbps</option>
                        <option value="10" ${recorder.settings.bitrate === 10 ? 'selected' : ''}>10 Mbps</option>
                        <option value="15" ${recorder.settings.bitrate === 15 ? 'selected' : ''}>15 Mbps</option>
                        <option value="20" ${recorder.settings.bitrate === 20 ? 'selected' : ''}>20 Mbps</option>
                    </select>
                </div>

                <div class="quality-row">
                    <label>🎬 Framerate:</label>
                    <select class="quality-select" data-recorder="${recorder.recorderId}" data-type="framerate">
                        <option value="24" ${recorder.settings.framerate === 24 ? 'selected' : ''}>24 fps</option>
                        <option value="30" ${recorder.settings.framerate === 30 ? 'selected' : ''}>30 fps</option>
                        <option value="60" ${recorder.settings.framerate === 60 ? 'selected' : ''}>60 fps</option>
                    </select>
                </div>
            </div>

            <!-- Permissions Status -->
            <div class="permissions-status">
                <div class="permission-item">
                    <span class="permission-icon ${recorder.permissions.camera === 'authorized' ? 'granted' : 'denied'}">📹</span>
                    <span class="permission-text">Camera: ${recorder.permissions.camera}</span>
                </div>
                <div class="permission-item">
                    <span class="permission-icon ${recorder.permissions.microphone === 'authorized' ? 'granted' : 'denied'}">🎤</span>
                    <span class="permission-text">Microphone: ${recorder.permissions.microphone}</span>
                </div>
            </div>

            <!-- Upload Progress (if recording) -->
            ${recorder.recording.isRecording && recorder.upload.total > 0 ? `
                <div class="upload-details">
                    <h4>☁️ Upload Progress</h4>
                    <div class="upload-progress-bar">
                        <div class="upload-progress-fill" style="width: ${uploadProgress}%"></div>
                    </div>
                    <div class="upload-stats">
                        <span>${recorder.upload.completed}/${recorder.upload.total} segments</span>
                        <span>${uploadProgress}%</span>
                    </div>
                </div>
            ` : ''}

            <!-- Pending Commands Indicator -->
            ${recorder.pendingCommands.size > 0 ? `
                <div class="pending-commands">
                    <span class="pending-icon">⏳</span>
                    <span class="pending-text">Processing command...</span>
                </div>
            ` : ''}
        `;

        return card;
    }

    updateRecorderCard(recorderId) {
        const recorder = this.recorders.get(recorderId);
        if (!recorder) return;

        const existingCard = document.getElementById(`recorder-${recorderId}`);
        if (existingCard) {
            const newCard = this.createRecorderCard(recorder);
            existingCard.parentNode.replaceChild(newCard, existingCard);
        }
    }

    // Utility methods
    getStatusClass(status) {
        switch(status) {
            case 'recording': return 'status-recording';
            case 'ready': return 'status-ready';
            case 'stopped': return 'status-stopped';
            case 'error': return 'status-error';
            case 'uploading': return 'status-uploading';
            default: return 'status-offline';
        }
    }

    getStatusDisplay(status) {
        switch(status) {
            case 'recording': return '🔴 Recording';
            case 'ready': return '🟢 Ready';
            case 'stopped': return '⏹️ Stopped';
            case 'error': return '❌ Error';
            case 'uploading': return '☁️ Uploading';
            default: return '⚫ Offline';
        }
    }

    getPlatformIcon(platform) {
        switch(platform) {
            case 'macOS': return '🍎';
            case 'Windows': return '🪟';
            case 'Linux': return '🐧';
            default: return '💻';
        }
    }

    formatDuration(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // Command tracking
    updateRecorderPendingCommand(recorderId, command) {
        const recorder = this.recorders.get(recorderId);
        if (recorder) {
            recorder.pendingCommands.add(command);
            this.updateRecorderCard(recorderId);
        }
    }

    clearRecorderPendingCommand(recorderId, command) {
        const recorder = this.recorders.get(recorderId);
        if (recorder) {
            recorder.pendingCommands.delete(command);
            this.updateRecorderCard(recorderId);
        }
    }

    // Statistics
    getStatistics() {
        let total = this.recorders.size;
        let recording = 0;
        let ready = 0;
        let totalBitrate = 0;
        let resolutionCounts = {};

        for (const recorder of this.recorders.values()) {
            if (recorder.status === 'recording') recording++;
            if (recorder.status === 'ready') ready++;
            
            totalBitrate += recorder.settings.bitrate || 0;
            
            const res = recorder.settings.resolution || '720p';
            resolutionCounts[res] = (resolutionCounts[res] || 0) + 1;
        }

        // Find most common resolution
        let mostCommonResolution = 'N/A';
        let maxCount = 0;
        for (const [res, count] of Object.entries(resolutionCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommonResolution = res;
            }
        }

        return {
            total,
            recording,
            ready,
            averageBitrate: total > 0 ? Math.round(totalBitrate / total) : 0,
            averageQuality: mostCommonResolution
        };
    }

    getUploadStatistics() {
        let totalProgress = 0;
        let activeUploads = 0;
        let totalCompleted = 0;
        let totalSegments = 0;

        for (const recorder of this.recorders.values()) {
            if (recorder.upload.progress > 0) {
                totalProgress += recorder.upload.progress;
                activeUploads++;
            }
            totalCompleted += recorder.upload.completed || 0;
            totalSegments += recorder.upload.total || 0;
        }

        const overallProgress = totalSegments > 0 ? (totalCompleted / totalSegments) * 100 : 0;

        return {
            activeUploads,
            overallProgress: Math.round(overallProgress),
            totalCompleted,
            totalSegments
        };
    }

    // Request methods
    requestRecorderStatus(recorderId) {
        logger.info(`📊 Requesting status for recorder: ${recorderId}`);
        
        return connectionManager.publish('producer-request', {
            command: 'GET_RECORDER_STATUS',
            streamId: recorderId,
            timestamp: Date.now()
        });
    }

    requestRecorderDevices(recorderId) {
        logger.info(`🔧 Requesting device list for recorder: ${recorderId}`);
        
        return connectionManager.publishToDeviceChannel('request-devices', {
            streamId: recorderId,
            from: 'producer-recorder-control',
            timestamp: Date.now()
        });
    }

    // Duration update (called by timer)
    updateRecordingDurations() {
        let updated = false;
        const now = Date.now();

        for (const recorder of this.recorders.values()) {
            if (recorder.recording.isRecording && recorder.recording.startTime) {
                const newDuration = Math.floor((now - recorder.recording.startTime) / 1000);
                if (newDuration !== recorder.recording.duration) {
                    recorder.recording.duration = newDuration;
                    updated = true;
                }
            }
        }

        if (updated) {
            this.updateUI();
        }
    }
}

// Export singleton instance
export const recordersManager = new RecorderManager();

// Update recording durations every second
setInterval(() => {
    recordersManager.updateRecordingDurations();
}, 1000);