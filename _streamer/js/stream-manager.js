/**
 * Stream Manager - Handles single stream publishing
 * Manages WHIP streaming to MediaMTX server
 */

import { WHIPClient } from './whip-client.js';
import { updateStatus } from './ui-manager.js';

let whipClient = null;
let isStreaming = false;
let currentStream = null;

export async function handleStartStreaming(mediaStream) {
    if (isStreaming) {
        updateStatus('Already streaming', true);
        return;
    }

    if (!mediaStream || mediaStream.getTracks().length === 0) {
        updateStatus('No media stream available', true);
        return;
    }

    try {
        const whipEndpoint = document.getElementById('whipEndpoint').value.trim();
        if (!whipEndpoint) {
            updateStatus('Please enter a WHIP endpoint URL', true);
            return;
        }

        // Extract base info from WHIP endpoint
        // Expected format: https://server.com/room/streamId/whip
        const whipMatch = whipEndpoint.match(/^(.+)\/([^\/]+)\/([^\/]+)\/whip$/);
        if (!whipMatch) {
            updateStatus('Invalid WHIP endpoint format', true);
            return;
        }

        const [, serverBase, room, streamId] = whipMatch;
        
        // Use the WHIP endpoint directly
        const endpoint = whipEndpoint;

        console.log('Starting stream setup:');
        console.log('Endpoint:', endpoint);

        updateStatus('Starting stream...');

        // Create stream with current settings
        const stream = new MediaStream();
        
        // Add video track
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
            stream.addTrack(videoTrack);
            const settings = videoTrack.getSettings();
            console.log('Added video track:', videoTrack.label);
            console.log('📹 Stream Manager: Video track settings:', {
                width: settings.width,
                height: settings.height,
                frameRate: settings.frameRate,
                aspectRatio: settings.aspectRatio,
                deviceId: settings.deviceId
            });

            // Log current UI settings for comparison
            const resolution = document.getElementById('resolution')?.value;
            const bitrate = document.getElementById('videoBitrate')?.value;
            const fps = document.getElementById('fps')?.value;
            console.log('📹 Stream Manager: UI settings:', {
                resolution,
                bitrate: bitrate + ' kbps',
                fps: fps + ' fps'
            });
        }
        
        // Add audio track
        const audioTrack = mediaStream.getAudioTracks()[0];
        if (audioTrack) {
            stream.addTrack(audioTrack);
            console.log('Added audio track:', audioTrack.label);
        }

        whipClient = new WHIPClient(endpoint, (msg) => console.log('Stream:', msg));
        await whipClient.startStream(stream);

        isStreaming = true;
        currentStream = mediaStream;

        // Update UI
        document.getElementById('startButton').disabled = true;
        document.getElementById('stopButton').disabled = false;
        
        // NOTE: We intentionally DO NOT disable video/audio source controls
        // to allow hot-swapping devices during streaming
        console.log('📹 Video and audio device switching remains ENABLED during streaming');
        
        updateStatus('Stream Connected');

        // Store client globally for track replacement
        window.whipClient = whipClient;

        console.log('Streaming started successfully');

        // SEND GREEN ROOM NOTIFICATION THAT STREAM IS NOW LIVE
        if (window.wsConnection && window.participantId) {
            console.log('Notifying green rooms that stream is now live');
            window.wsConnection.emit('stream-live-notification', {
                streamId: window.participantId,
                room: window.room,
                status: 'live-and-ready'
            });
        }

    } catch (error) {
        console.error('Streaming failed:', error);
        updateStatus(`Streaming failed: ${error.message}`, true);
        
        // Cleanup on failure
        cleanup();
    }
}

export function stopStreaming() {
    if (!isStreaming) {
        return;
    }

    updateStatus('Stopping stream...');
    cleanup();
    updateStatus('Stream stopped');
    console.log('Streaming stopped');
}

function cleanup() {
    // Stop WHIP client
    if (whipClient) {
        whipClient.stopStream();
        whipClient = null;
    }

    isStreaming = false;
    currentStream = null;

    // Update UI
    document.getElementById('startButton').disabled = false;
    document.getElementById('stopButton').disabled = true;
    
    // Clear global references
    window.whipClient = null;
}

export function isCurrentlyStreaming() {
    return isStreaming;
}


// Handle track replacement during streaming
export async function replaceTrack(track) {
    if (!isStreaming) return;
    
    try {
        console.log(`Replacing ${track ? track.kind : 'null'} track in stream`);
        
        if (whipClient) {
            await whipClient.replaceTrack(track);
            console.log('Stream track replaced');
        }
        
        console.log('Track replacement completed');
        
    } catch (error) {
        console.error('Error replacing track in stream:', error);
        updateStatus(`Error updating ${track ? track.kind : 'track'}: ${error.message}`, true);
    }
}