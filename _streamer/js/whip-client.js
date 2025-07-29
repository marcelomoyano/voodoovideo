/**
 * WHIPClient - WebRTC HTTP Ingest Protocol client
 * Handles streaming to WHIP-compatible servers
 * Optimized for single stream publishing
 */
export class WHIPClient {
    constructor(endpoint, updateStatusCallback) {
        if (!endpoint) {
            throw new Error('WHIP endpoint URL is required');
        }
        this.endpoint = endpoint;
        this.updateStatus = updateStatusCallback || ((msg) => console.log(msg));
        
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    urls: 'turn:159.65.180.44:3478',
                    username: 'voodooturn',
                    credential: 'vT_s7r0ngP@sswrd_4U'
                }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            sdpSemantics: 'unified-plan'
        });

        // Store track senders for replacement
        this.videoSender = null;
        this.audioSender = null;

        // Add connection state handlers for better error reporting
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.updateStatus(`connection state: ${state}`);
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            this.updateStatus(`ICE connection state: ${state}`);

            if (state === 'failed') {
                this.restartIce();
            }
        };
    }

    async replaceTrack(track) {
        try {
            if (!this.peerConnection) return;

            // Handle null track (remove video)
            if (track === null) {
                if (this.videoSender) {
                    await this.videoSender.replaceTrack(null);
                    this.updateStatus(`video track removed - audio only mode`);
                }
                return;
            }

            let sender;
            if (track.kind === 'video') {
                if (!this.videoSender) {
                    this.videoSender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                }
                sender = this.videoSender;
            } else if (track.kind === 'audio') {
                if (!this.audioSender) {
                    this.audioSender = this.peerConnection.getSenders().find(s => s.track?.kind === 'audio');
                }
                sender = this.audioSender;
            }

            if (sender) {
                await sender.replaceTrack(track);

                // Update encoding parameters for video tracks
                if (track.kind === 'video') {
                    const params = sender.getParameters();
                    let videoBitrate, fps;
                    
                    // Different settings for HD vs SD
                    videoBitrate = parseInt(document.getElementById('videoBitrate').value);
                    fps = parseInt(document.getElementById('fps').value);

                    // Force bitrate settings
                    params.encodings = [{
                        maxBitrate: videoBitrate * 1000,
                        maxFramerate: fps,
                        scaleResolutionDownBy: 1.0,
                        active: true,
                        networkPriority: "high",
                        priority: "high",
                        degradationPreference: "maintain-framerate"
                    }];

                    await sender.setParameters(params);
                    
                    console.log(`video encoding parameters set:`, params.encodings[0]);
                }

                this.updateStatus(`${track.kind} track replaced successfully`);
            }
        } catch (error) {
            this.updateStatus(`Error replacing ${track.kind} track: ${error.message}`, true);
            console.error(`track replacement error:`, error);
        }
    }

    async restartIce() {
        try {
            await this.peerConnection.restartIce();
            const offer = await this.peerConnection.createOffer({ iceRestart: true });
            await this.peerConnection.setLocalDescription(offer);
        } catch (error) {
            this.updateStatus(`Failed to restart ICE: ${error.message}`, true);
        }
    }

    async startStream(stream) {
        try {
            console.log(`Starting stream with ${stream.getTracks().length} tracks`);
            
            // Store video sender reference for bitrate adjustments
            this.videoSender = null;
            
            // Add tracks to the peer connection with appropriate priority
            const senders = stream.getTracks().map(track => {
                const sender = this.peerConnection.addTrack(track, stream);

                // Log track settings for debugging
                if (track.kind === 'video') {
                    const settings = track.getSettings();
                    console.log(`🎬 WHIP: Adding video track with settings:`, {
                        width: settings.width,
                        height: settings.height,
                        frameRate: settings.frameRate,
                        aspectRatio: settings.aspectRatio,
                        deviceId: settings.deviceId
                    });
                }

                // Set selected codec and priority for video tracks
                if (track.kind === 'video') {
                    const transceivers = this.peerConnection.getTransceivers();
                    const transceiver = transceivers.find(t => t.sender === sender);
                    if (transceiver) {
                        const codecs = RTCRtpSender.getCapabilities('video').codecs;
                        const selectedCodec = document.getElementById('videoCodec').value;
                        
                        console.log(`- Looking for codec: video/${selectedCodec.toLowerCase()}`);
                        
                        const preferredCodecs = codecs.filter(codec => 
                            codec.mimeType.toLowerCase() === `video/${selectedCodec.toLowerCase()}`);
                        
                        if (preferredCodecs.length > 0) {
                            transceiver.setCodecPreferences([
                                ...preferredCodecs,
                                ...codecs.filter(c => !preferredCodecs.includes(c))
                            ]);
                            console.log(`✅ set codec preference to ${selectedCodec}`);
                        } else {
                            console.warn(`❌ ${selectedCodec} codec not supported by browser`);
                        }
                        transceiver.direction = 'sendonly';

                        // Enhanced video sender parameters
                        const params = sender.getParameters();
                        let videoBitrate, fps;
                        
                        // Different settings for HD vs SD
                        videoBitrate = parseInt(document.getElementById('videoBitrate').value);
                        fps = parseInt(document.getElementById('fps').value);

                        params.encodings = [{
                            maxBitrate: videoBitrate * 1000,
                            maxFramerate: fps,
                            scaleResolutionDownBy: 1.0,
                            active: true,
                            networkPriority: "high",
                            priority: "high",
                            degradationPreference: "maintain-framerate"
                        }];

                        sender.setParameters(params);
                        console.log(`initial video encoding parameters:`, params.encodings[0]);
                        
                        // Store video sender for later use
                        this.videoSender = sender;
                    }
                }
                return sender;
            });

            // Create and set local description with specific constraints
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false,
                voiceActivityDetection: false,
                iceRestart: true
            });

            // Modify SDP to set bitrates and priorities
            offer.sdp = this.modifySDPWithBitrate(offer.sdp);

            await this.peerConnection.setLocalDescription(offer);
            await this.waitForIceGathering();

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/sdp',
                },
                body: this.peerConnection.localDescription.sdp
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const answer = await response.text();
            await this.peerConnection.setRemoteDescription({
                type: 'answer',
                sdp: answer
            });

            // Log the negotiated configuration and enforce bitrate
            const videoSender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) {
                const params = await videoSender.getParameters();
                console.log(`negotiated video parameters:`, params.encodings);
                
                // Enforce bitrate again after negotiation
                this.enforceBitrate();
                
                // Set up periodic bitrate enforcement
                this.bitrateInterval = setInterval(() => {
                    this.enforceBitrate();
                }, 2000); // Every 2 seconds
            }

            console.log(`stream started successfully`);

        } catch (error) {
            console.error(`streaming failed:`, error);
            throw error;
        }
    }
    
    async enforceBitrate() {
        if (!this.videoSender || !this.peerConnection || this.peerConnection.connectionState !== 'connected') {
            return;
        }
        
        try {
            let targetBitrate;
            targetBitrate = parseInt(document.getElementById('videoBitrate').value);
            
            const params = this.videoSender.getParameters();
            
            if (params.encodings && params.encodings[0]) {
                // Check current bitrate
                const currentMaxBitrate = params.encodings[0].maxBitrate;
                const targetBitrateKbps = targetBitrate * 1000;
                
                // Only update if different
                if (currentMaxBitrate !== targetBitrateKbps) {
                    params.encodings[0].maxBitrate = targetBitrateKbps;
                    await this.videoSender.setParameters(params);
                    console.log(`enforced bitrate: ${targetBitrate} kbps`);
                }
            }
        } catch (error) {
            console.error(`Error enforcing bitrate:`, error);
        }
    }

    modifySDPWithBitrate(sdp) {
        const lines = sdp.split('\r\n');
        const newLines = [];
        let isVideoSection = false;
        let isAudioSection = false;
        
        // Different bitrate settings for HD vs SD
        let videoBitrate, fps;
        videoBitrate = parseInt(document.getElementById('videoBitrate').value);
        fps = parseInt(document.getElementById('fps').value);

        for (let line of lines) {
            // Detect video section
            if (line.startsWith('m=video')) {
                isVideoSection = true;
                isAudioSection = false;
            } else if (line.startsWith('m=audio')) {
                isVideoSection = false;
                isAudioSection = true;
            } else if (line.startsWith('m=')) {
                isVideoSection = false;
                isAudioSection = false;
            }

            // Change sendrecv to sendonly
            if (line.includes('a=sendrecv')) {
                newLines.push('a=sendonly');
                continue;
            }

            // Add the current line
            newLines.push(line);

            // Add video-specific settings
            if (isVideoSection && line.startsWith('c=')) {
                // Bandwidth settings
                newLines.push(`b=AS:${videoBitrate}`);
                newLines.push(`b=TIAS:${videoBitrate * 1000}`);

                // Transport feedback
                newLines.push('a=rtcp-fb:* transport-cc');
                newLines.push('a=rtcp-fb:* nack');
                newLines.push('a=rtcp-fb:* nack pli');
                newLines.push('a=rtcp-fb:* ccm fir');
                newLines.push('a=rtcp-fb:* goog-remb');

                // Priority settings based on stream type
                newLines.push('a=content:main');
                newLines.push('a=priority:high');
                newLines.push('a=x-google-max-bitrate:' + (videoBitrate * 1000));
                newLines.push('a=x-google-min-bitrate:' + (videoBitrate * 1000));
                newLines.push('a=x-google-start-bitrate:' + (videoBitrate * 1000));
                newLines.push('a=x-google-cpu-overuse-detection:false');

                // Additional performance settings
                newLines.push('a=x-google-buffer-latency:0');
                newLines.push('a=x-google-enable-pre-encode-drop:false');

                // Codec specific settings
                const selectedCodec = document.getElementById('videoCodec').value;
                
                // Find the actual payload type for the codec
                let codecPayloadType = null;
                for (let i = 0; i < newLines.length; i++) {
                    if (selectedCodec === 'VP9' && newLines[i].includes('VP9/90000')) {
                        const match = newLines[i].match(/^a=rtpmap:(\d+) VP9\/90000/);
                        if (match) codecPayloadType = match[1];
                        break;
                    } else if (selectedCodec === 'H264' && newLines[i].includes('H264/90000')) {
                        const match = newLines[i].match(/^a=rtpmap:(\d+) H264\/90000/);
                        if (match) codecPayloadType = match[1];
                        break;
                    } else if (selectedCodec === 'VP8' && newLines[i].includes('VP8/90000')) {
                        const match = newLines[i].match(/^a=rtpmap:(\d+) VP8\/90000/);
                        if (match) codecPayloadType = match[1];
                        break;
                    } else if (selectedCodec === 'AV1' && (newLines[i].includes('AV01/90000') || newLines[i].includes('av01/90000'))) {
                        const match = newLines[i].match(/^a=rtpmap:(\d+) (AV01|av01)\/90000/i);
                        if (match) codecPayloadType = match[1];
                        break;
                    }
                }
                
                if (codecPayloadType) {
                    if (selectedCodec === 'VP9') {
                        newLines.push(`a=fmtp:${codecPayloadType} profile-id=0`);
                        newLines.push(`a=fmtp:${codecPayloadType} max-fs=12288`);
                        newLines.push(`a=fmtp:${codecPayloadType} max-fr=${fps}`);
                    } else if (selectedCodec === 'H264') {
                        newLines.push(`a=fmtp:${codecPayloadType} level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f`);
                    } else if (selectedCodec === 'VP8') {
                        newLines.push(`a=fmtp:${codecPayloadType} max-fs=12288`);
                        newLines.push(`a=fmtp:${codecPayloadType} max-fr=${fps}`);
                    } else if (selectedCodec === 'AV1') {
                        newLines.push(`a=fmtp:${codecPayloadType} profile=0`);
                        newLines.push(`a=fmtp:${codecPayloadType} level=5.1`);
                        newLines.push(`a=fmtp:${codecPayloadType} tier=0`);
                    }
                }
            }
        }

        // Handle audio section for Studio Sound
        return this.modifySDPForStudioSound(newLines);
    }

    modifySDPForStudioSound(lines) {
        const studioSoundEnabled = document.getElementById('studioSound')?.checked;
        let opusPayloadType = null;

        // Find the payload type for Opus (typically opus/48000/2)
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('opus/48000/2')) {
                const match = lines[i].match(/^a=rtpmap:(\d+) opus\/48000\/2/);
                if (match && match[1]) {
                    opusPayloadType = match[1];
                    console.log(`Found Opus payload type: ${opusPayloadType}`);
                    break;
                }
            }
        }

        // Modify the fmtp line for Opus based on studioSound setting
        if (opusPayloadType) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith(`a=fmtp:${opusPayloadType}`)) {
                    console.log(`Original Opus fmtp: ${lines[i]}`);
                    // Remove existing stereo parameters first to avoid duplicates
                    let fmtpLine = lines[i].replace(/;\s*stereo=1/g, '').replace(/;\s*sprop-stereo=1/g, '');

                    if (studioSoundEnabled) {
                        // Add stereo parameters if Studio Sound is ON
                        if (!fmtpLine.includes('usedtx=0')) { // dtx=1 is incompatible with stereo=1
                             fmtpLine += ';stereo=1;sprop-stereo=1';
                             console.log(`Added stereo parameters for Studio Sound.`);
                        } else {
                             console.warn(`Cannot enable stereo with DTX enabled. Keeping mono.`);
                        }
                    } else {
                        console.log(`Ensuring mono parameters (Studio Sound OFF).`);
                    }

                    lines[i] = fmtpLine;
                    console.log(`Modified Opus fmtp: ${lines[i]}`);
                    break;
                }
            }
        } else {
            console.warn(`Could not find Opus payload type.`);
        }

        return lines.join('\r\n');
    }

    async waitForIceGathering() {
        return new Promise((resolve) => {
            if (this.peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (this.peerConnection.iceGatheringState === 'complete') {
                        this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                this.peerConnection.addEventListener('icegatheringstatechange', checkState);
                setTimeout(resolve, 3000);
            }
        });
    }

    stopStream() {
        // Clear bitrate enforcement interval
        if (this.bitrateInterval) {
            clearInterval(this.bitrateInterval);
            this.bitrateInterval = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.videoSender = null;
        this.audioSender = null;
        
        console.log(`stream stopped`);
    }
}