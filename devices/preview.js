// Preview module - handles stream preview functionality
import { logger } from './logger.js';
import { streamersManager } from './streamers.js';
import { connectionManager } from './connection.js';

export class PreviewManager {
    constructor() {
        this.whepConnections = new Map();
        this.currentPreview = null;
    }

    async startPreview(streamId) {
        logger.success(`Starting WHEP preview for ${streamId}`);
        
        const streamer = streamersManager.getStreamer(streamId);
        if (!streamer) {
            logger.error(`Streamer ${streamId} not found`);
            return;
        }

        // Close any existing preview
        if (this.currentPreview) {
            this.closePreview();
        }

        // Create preview popup
        this.createPreviewPopup(streamId, streamer.streamName);
        
        // Set up WHEP connection
        try {
            await this.setupWHEPPreview(streamId);
        } catch (error) {
            logger.error(`Failed to start preview: ${error.message}`);
            this.showPreviewError(`Failed to connect: ${error.message}`);
        }
    }

    createPreviewPopup(streamId, streamName) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        overlay.id = 'preview-overlay';
        
        overlay.innerHTML = `
            <div class="preview-popup">
                <div class="preview-video-container">
                    <div class="preview-header">
                        <div class="preview-title">${streamName}</div>
                        <button class="preview-close-btn" id="preview-close-btn">Close</button>
                    </div>
                    <video id="preview-video" class="preview-video" autoplay muted playsinline></video>
                    <div id="preview-status" class="preview-status preview-loading">
                        Connecting to stream...
                    </div>
                </div>
            </div>
        `;
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closePreview();
            }
        });
        
        document.body.appendChild(overlay);
        
        // Add event listener to close button
        document.getElementById('preview-close-btn').addEventListener('click', () => {
            this.closePreview();
        });
        
        this.currentPreview = streamId;
    }

    async setupWHEPPreview(streamId) {
        if (this.whepConnections.has(streamId)) {
            logger.warning(`Preview already active for ${streamId}`);
            return;
        }

        // Get the streamer's current WHIP endpoint to derive WHEP endpoint
        const streamer = streamersManager.getStreamer(streamId);
        let whepUrl;
        
        if (streamer && streamer.settings.whipEndpoint) {
            const whipEndpoint = streamer.settings.whipEndpoint;
            
            // Check if this is a live server that uses HTTP playback instead of WHEP
            const isLiveServer = whipEndpoint.includes('live.voodoostudios.tv') || 
                                 whipEndpoint.includes('live.streamless.io');
            
            if (isLiveServer) {
                // For live servers, use HTTP playback URL (without /whip or /whep)
                const playbackUrl = whipEndpoint.replace(/\/whip$/i, '');
                logger.info(`Live server detected - using HTTP playback: ${playbackUrl}`);
                
                // Use iframe or direct HTTP playback instead of WebRTC
                this.setupHTTPPreview(streamId, playbackUrl);
                return; // Exit early, don't continue with WebRTC
            }
            
            // Standard conversion for servers that support both WHIP and WHEP
            whepUrl = whipEndpoint.replace(/\/whip$/i, '/whep');
            
            // Handle case where whip might not be at the end
            if (!whepUrl.includes('/whep')) {
                whepUrl = whipEndpoint.replace(/\/?$/, '/whep');
            }
            
            logger.info(`Using WHEP endpoint: ${whepUrl}`);
        } else {
            // Fallback to default logic
            const isLocal = window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname.startsWith('192.168.') ||
                           window.location.hostname.startsWith('10.') ||
                           window.location.hostname.startsWith('172.');
            
            if (isLocal) {
                whepUrl = `http://localhost:8889/${connectionManager.currentRoom}/${streamId}/whep`;
            } else {
                whepUrl = `https://stream.voodoostudios.tv/${connectionManager.currentRoom}/${streamId}/whep`;
            }
            logger.info(`Using default WHEP endpoint: ${whepUrl}`);
        }

        logger.info(`Connecting to WHEP endpoint: ${whepUrl}`);

        // Create peer connection
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Store connection
        this.whepConnections.set(streamId, pc);

        // Set up track handling
        pc.ontrack = (event) => {
            logger.success(`Received ${event.track.kind} track for ${streamId}`);
            
            const video = document.getElementById('preview-video');
            const status = document.getElementById('preview-status');
            
            if (video && event.streams[0]) {
                video.srcObject = event.streams[0];
                video.play().catch(e => logger.warning(`Video play error: ${e.message}`));
                
                if (status) {
                    status.style.display = 'none';
                }
            }
        };

        // Set up connection state monitoring
        pc.onconnectionstatechange = () => {
            logger.info(`WHEP connection state: ${pc.connectionState}`);
            
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.showPreviewError('Connection lost');
            }
        };

        // Add transceivers for receiving
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // Create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Send offer to WHEP endpoint
        const response = await fetch(whepUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: offer.sdp
        });

        if (!response.ok) {
            throw new Error(`WHEP request failed: ${response.status} ${response.statusText}`);
        }

        // Set remote description from response
        const answerSdp = await response.text();
        await pc.setRemoteDescription({
            type: 'answer',
            sdp: answerSdp
        });

        logger.success(`WHEP preview connection established for ${streamId}`);
    }

    setupHTTPPreview(streamId, playbackUrl) {
        logger.info(`Setting up HTTP preview for ${streamId} at ${playbackUrl}`);
        
        // Hide the loading status
        const status = document.getElementById('preview-status');
        if (status) {
            status.style.display = 'none';
        }
        
        // Get the video container
        const videoContainer = document.querySelector('.preview-video-container');
        if (!videoContainer) {
            logger.error('Preview container not found');
            return;
        }
        
        // Remove the existing video element
        const existingVideo = document.getElementById('preview-video');
        if (existingVideo) {
            existingVideo.remove();
        }
        
        // Create an iframe for HTTP playback
        const iframe = document.createElement('iframe');
        iframe.id = 'preview-iframe';
        iframe.src = playbackUrl;
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        iframe.allow = 'autoplay; fullscreen';
        iframe.allowFullscreen = true;
        
        // Add the iframe to the container
        videoContainer.appendChild(iframe);
        
        logger.success(`HTTP preview iframe created for ${playbackUrl}`);
        
        // Store this as an HTTP preview so we can clean it up properly
        this.whepConnections.set(streamId, 'http-preview');
    }

    showPreviewError(message) {
        const status = document.getElementById('preview-status');
        if (status) {
            status.className = 'preview-status preview-error';
            status.textContent = message;
            status.style.display = 'block';
        }
    }

    closePreview() {
        // Clean up connection (either WHEP or HTTP)
        if (this.currentPreview && this.whepConnections.has(this.currentPreview)) {
            const connection = this.whepConnections.get(this.currentPreview);
            if (connection === 'http-preview') {
                // Just need to remove the iframe (handled by removing overlay)
                logger.info(`Closed HTTP preview for ${this.currentPreview}`);
            } else if (connection && typeof connection.close === 'function') {
                // It's a WebRTC peer connection
                connection.close();
                logger.info(`Closed WHEP connection for ${this.currentPreview}`);
            }
            this.whepConnections.delete(this.currentPreview);
        }

        // Remove popup
        const overlay = document.getElementById('preview-overlay');
        if (overlay) {
            overlay.remove();
        }

        this.currentPreview = null;
        logger.info('Preview popup closed');
    }

    // Clean up all connections
    cleanupAll() {
        // Close any active preview
        if (this.currentPreview) {
            this.closePreview();
        }
        
        // Clean up all WHEP connections
        for (const [streamId, pc] of this.whepConnections) {
            if (pc && typeof pc.close === 'function') {
                pc.close();
                logger.info(`Cleaned up WHEP connection for ${streamId}`);
            }
        }
        this.whepConnections.clear();
    }
}

// Export singleton instance
export const previewManager = new PreviewManager();