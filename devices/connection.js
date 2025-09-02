// Connection module - handles Ably connection and channel management
import { logger } from './logger.js';

export class ConnectionManager {
    constructor() {
        this.ably = null;
        this.ablyChannel = null;
        this.deviceSyncChannel = null;
        this.isConnected = false;
        this.currentRoom = null;
        this.ABLY_API_KEY = '8x-iWg.YIbffg:sXPUGzOnGtbkbCMVUWW2CeJuq0eI_lRwQcVQWHnyvSs';
        this.eventHandlers = new Map();
    }

    connect(room) {
        if (!room) {
            logger.error('Please enter a room name');
            return Promise.reject(new Error('Room name required'));
        }

        logger.log(`Connecting to room: ${room}...`);
        this.currentRoom = room;

        // Initialize Ably with unique clientId
        const clientId = `device-controller-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        this.ably = new Ably.Realtime({
            key: this.ABLY_API_KEY,
            clientId: clientId
        });
        logger.log(`Initializing with clientId: ${clientId}`);

        return new Promise((resolve, reject) => {
            this.ably.connection.on('connected', () => {
                logger.success(`Connected to Ably successfully`);
                this.setupChannels();
                this.updateConnectionUI(true);
                this.isConnected = true;
                
                // Process any pending device updates after connection
                setTimeout(() => {
                    if (this.pendingDeviceUpdates && this.pendingDeviceUpdates.length > 0) {
                        logger.info(`Processing ${this.pendingDeviceUpdates.length} pending device updates`);
                        this.pendingDeviceUpdates.forEach(message => {
                            const handler = this.eventHandlers.get('device:jitsi-device-update');
                            if (handler) {
                                handler(message);
                            }
                        });
                        this.pendingDeviceUpdates = [];
                    }
                }, 1000);
                
                resolve();
            });

            this.ably.connection.on('failed', (error) => {
                logger.error(`Connection failed: ${error.message}`);
                this.updateConnectionUI(false);
                this.isConnected = false;
                reject(error);
            });

            this.ably.connection.on('disconnected', () => {
                logger.warning('Disconnected from Ably');
                this.updateConnectionUI(false);
                this.isConnected = false;
            });
        });
    }

    setupChannels() {
        // Main channel for stream events
        this.ablyChannel = this.ably.channels.get(this.currentRoom);
        logger.info(`Subscribing to main channel: ${this.currentRoom}`);
        
        // Device sync channel
        this.deviceSyncChannel = this.ably.channels.get(`${this.currentRoom}-devices`);
        logger.info(`Subscribing to device sync channel: ${this.currentRoom}-devices`);

        // Subscribe to all registered events
        logger.info(`Setting up ${this.eventHandlers.size} event handlers`);
        for (const [eventName, handler] of this.eventHandlers) {
            if (eventName.startsWith('device:')) {
                const deviceEvent = eventName.replace('device:', '');
                logger.info(`Subscribing to device event: ${deviceEvent}`);
                this.deviceSyncChannel.subscribe(deviceEvent, handler);
            } else {
                this.ablyChannel.subscribe(eventName, handler);
            }
        }

        // Also log all device sync messages for debugging
        this.deviceSyncChannel.subscribe((message) => {
            logger.info(`Device channel message [${message.name}]: ${JSON.stringify(message.data).substring(0, 100)}...`);
            
            // Try to handle jitsi-device-update messages directly if handler not set
            if (message.name === 'jitsi-device-update') {
                const handler = this.eventHandlers.get('device:jitsi-device-update');
                if (handler) {
                    logger.success('Calling device update handler directly');
                    handler(message);
                } else {
                    logger.warning('No handler found for jitsi-device-update, storing for later');
                    // Store the message to process later
                    if (!this.pendingDeviceUpdates) {
                        this.pendingDeviceUpdates = [];
                    }
                    this.pendingDeviceUpdates.push(message);
                }
            }
        });
    }

    disconnect() {
        if (this.ably) {
            this.ably.close();
            this.ably = null;
            this.ablyChannel = null;
            this.deviceSyncChannel = null;
        }
        
        this.isConnected = false;
        this.currentRoom = null;
        this.updateConnectionUI(false);
        logger.warning('Disconnected');
    }

    updateConnectionUI(connected) {
        const connectBtn = document.getElementById('connectBtn');
        const connectBtnText = document.getElementById('connectBtnText');
        const connectionStatus = document.getElementById('connectionStatus');
        const globalControls = document.getElementById('globalControlsSection');
        const discoverBtn = document.getElementById('discoverBtn');
        const testBtn = document.getElementById('testDeviceSync');
        
        if (connected) {
            if (connectBtn) {
                connectBtn.className = 'btn btn-danger';
            }
            if (connectBtnText) {
                connectBtnText.textContent = 'Disconnect';
            }
            if (connectionStatus) {
                connectionStatus.className = 'status-indicator status-connected';
                connectionStatus.textContent = `Connected to ${this.currentRoom}`;
            }
            if (globalControls) {
                globalControls.style.display = 'block';
            }
            if (discoverBtn) {
                discoverBtn.style.display = 'inline-flex';
            }
            if (testBtn) {
                testBtn.style.display = 'inline-flex';
            }
        } else {
            if (connectBtn) {
                connectBtn.className = 'btn btn-primary';
            }
            if (connectBtnText) {
                connectBtnText.textContent = 'Connect';
            }
            if (connectionStatus) {
                connectionStatus.className = 'status-indicator status-disconnected';
                connectionStatus.textContent = 'Disconnected';
            }
            if (globalControls) {
                globalControls.style.display = 'none';
            }
            if (discoverBtn) {
                discoverBtn.style.display = 'none';
            }
            if (testBtn) {
                testBtn.style.display = 'none';
            }
        }
    }

    on(eventName, handler) {
        this.eventHandlers.set(eventName, handler);
        
        // If already connected, subscribe immediately
        if (this.isConnected) {
            if (eventName.startsWith('device:')) {
                const deviceEvent = eventName.replace('device:', '');
                this.deviceSyncChannel.subscribe(deviceEvent, handler);
            } else {
                this.ablyChannel.subscribe(eventName, handler);
            }
        }
    }

    off(eventName) {
        this.eventHandlers.delete(eventName);
        
        // If connected, unsubscribe
        if (this.isConnected) {
            if (eventName.startsWith('device:')) {
                const deviceEvent = eventName.replace('device:', '');
                this.deviceSyncChannel.unsubscribe(deviceEvent);
            } else {
                this.ablyChannel.unsubscribe(eventName);
            }
        }
    }

    publish(eventName, data) {
        if (!this.isConnected || !this.ablyChannel) {
            logger.error('Not connected to any channel');
            return Promise.reject(new Error('Not connected'));
        }

        return this.ablyChannel.publish(eventName, data);
    }

    publishToDeviceChannel(eventName, data) {
        if (!this.isConnected || !this.deviceSyncChannel) {
            logger.error('Not connected to device channel');
            return Promise.reject(new Error('Not connected'));
        }

        return this.deviceSyncChannel.publish(eventName, data);
    }

    getPresence() {
        if (!this.ablyChannel) {
            return Promise.resolve([]);
        }

        return new Promise((resolve, reject) => {
            this.ablyChannel.presence.get((err, members) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(members || []);
                }
            });
        });
    }

    subscribeToPresence(event, handler) {
        if (this.ablyChannel) {
            this.ablyChannel.presence.subscribe(event, handler);
        }
    }

    requestRoomStreams() {
        if (!this.isConnected) {
            logger.error('Not connected to any room');
            return;
        }

        logger.log('Requesting current room state...');
        this.publish('producer-request', {
            command: 'GET_ROOM_STREAMS',
            room: this.currentRoom,
            requestId: Date.now(),
            timestamp: Date.now()
        });
    }

    async checkActiveMediaMTXStreams() {
        logger.info('Checking MediaMTX for active streams...');
        
        try {
            const apiUrl = `https://stream.voodoostudios.tv/v3/paths/list`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                logger.success(`MediaMTX API response received`);
                return data.items || [];
            } else {
                logger.warning(`MediaMTX API not accessible (status: ${response.status})`);
                return [];
            }
        } catch (error) {
            logger.warning(`MediaMTX API error: ${error.message}`);
            return [];
        }
    }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();