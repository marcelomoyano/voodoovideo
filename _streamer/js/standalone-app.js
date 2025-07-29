// Standalone Voodoo Streamer App
class StandaloneStreamer {
    constructor() {
        this.license = null;
        this.pc = null;
        this.localStream = null;
        this.isStreaming = false;
        this.streamStartTime = null;
        this.statsInterval = null;
        this.durationInterval = null;
        
        this.whipServer = 'https://whip.voodoostudios.tv/whip';
        
        this.init();
    }
    
    init() {
        // Check for license in URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const urlLicense = urlParams.get('key');
        const savedLicense = localStorage.getItem('voodoo_license');
        
        if (urlLicense) {
            this.validateLicense(urlLicense);
        } else if (savedLicense) {
            this.validateLicense(savedLicense);
        } else {
            this.showLicenseScreen();
        }
        
        this.setupEventListeners();
        lucide.createIcons();
    }
    
    setupEventListeners() {
        // License form
        document.getElementById('licenseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const key = document.getElementById('licenseInput').value.trim();
            this.validateLicense(key);
        });
        
        // Stream controls
        document.getElementById('startStreamBtn').addEventListener('click', () => this.startStream());
        document.getElementById('stopStreamBtn').addEventListener('click', () => this.stopStream());
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        
        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.hideSettings());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        
        // Quality settings
        document.getElementById('bitrateSlider').addEventListener('input', (e) => {
            document.getElementById('bitrateValue').textContent = `${e.target.value} kbps`;
        });
        
        // Device selection
        document.getElementById('videoSelect').addEventListener('change', () => this.updateDevices());
        document.getElementById('audioSelect').addEventListener('change', () => this.updateDevices());
    }
    
    async validateLicense(key) {
        try {
            const response = await fetch('/voodooproducer/license-validate.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: key })
            });
            
            const data = await response.json();
            
            if (data.valid) {
                this.license = data.license;
                localStorage.setItem('voodoo_license', key);
                this.showStreamInterface();
            } else {
                this.showLicenseError(data.error || 'Invalid license');
            }
        } catch (error) {
            console.error('License validation error:', error);
            this.showLicenseError('Failed to validate license');
        }
    }
    
    showLicenseScreen() {
        document.getElementById('licenseScreen').style.display = 'flex';
        document.getElementById('streamInterface').style.display = 'none';
    }
    
    showStreamInterface() {
        document.getElementById('licenseScreen').style.display = 'none';
        document.getElementById('streamInterface').style.display = 'block';
        
        // Update UI with license info
        document.getElementById('licenseKey').textContent = this.license.key;
        document.getElementById('licenseExpiry').textContent = `Expires in ${this.license.daysRemaining} days`;
        document.getElementById('endpointInfo').textContent = this.license.whipEndpoint;
        
        // Initialize devices
        this.initializeDevices();
        this.updateConnectionStatus('Ready', 'ready');
    }
    
    showLicenseError(message) {
        const errorEl = document.getElementById('licenseError');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
    
    async initializeDevices() {
        try {
            // Get user media to prompt for permissions
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            
            // Set up local preview
            const video = document.getElementById('localVideo');
            video.srcObject = stream;
            this.localStream = stream;
            
            // Enumerate devices
            await this.enumerateDevices();
            
            // Set up audio meter
            this.setupAudioMeter(stream);
            
        } catch (error) {
            console.error('Failed to initialize devices:', error);
            this.updateConnectionStatus('Camera/Mic access denied', 'error');
        }
    }
    
    async enumerateDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoSelect = document.getElementById('videoSelect');
        const audioSelect = document.getElementById('audioSelect');
        
        // Clear existing options
        videoSelect.innerHTML = '<option value="">Select Camera</option>';
        audioSelect.innerHTML = '<option value="">Select Microphone</option>';
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} ${device.deviceId.substr(0, 8)}`;
            
            if (device.kind === 'videoinput') {
                videoSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioSelect.appendChild(option);
            }
        });
        
        // Select current devices
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            const audioTrack = this.localStream.getAudioTracks()[0];
            
            if (videoTrack) {
                videoSelect.value = videoTrack.getSettings().deviceId || '';
            }
            if (audioTrack) {
                audioSelect.value = audioTrack.getSettings().deviceId || '';
            }
        }
    }
    
    async updateDevices() {
        const videoSelect = document.getElementById('videoSelect');
        const audioSelect = document.getElementById('audioSelect');
        
        const constraints = {
            video: videoSelect.value ? { deviceId: { exact: videoSelect.value } } : true,
            audio: audioSelect.value ? { deviceId: { exact: audioSelect.value } } : true
        };
        
        try {
            // Get new stream
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Update local preview
            const video = document.getElementById('localVideo');
            video.srcObject = stream;
            
            // Update local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            this.localStream = stream;
            
            // Update audio meter
            this.setupAudioMeter(stream);
            
            // If streaming, update the peer connection
            if (this.isStreaming && this.pc) {
                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];
                
                const senders = this.pc.getSenders();
                senders.forEach(sender => {
                    if (sender.track && sender.track.kind === 'video' && videoTrack) {
                        sender.replaceTrack(videoTrack);
                    } else if (sender.track && sender.track.kind === 'audio' && audioTrack) {
                        sender.replaceTrack(audioTrack);
                    }
                });
            }
        } catch (error) {
            console.error('Failed to update devices:', error);
        }
    }
    
    setupAudioMeter(stream) {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
        
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        
        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        javascriptNode.onaudioprocess = () => {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            
            const values = array.reduce((a, b) => a + b, 0);
            const average = values / array.length;
            const percentage = Math.min(100, (average / 128) * 100);
            
            const meterBar = document.querySelector('.audio-meter-bar');
            if (meterBar) {
                meterBar.style.width = percentage + '%';
                
                // Color based on level
                if (percentage > 80) {
                    meterBar.style.background = '#ff4444';
                } else if (percentage > 60) {
                    meterBar.style.background = '#ff8844';
                } else {
                    meterBar.style.background = '#44ff44';
                }
            }
        };
    }
    
    async startStream() {
        if (!this.localStream) {
            console.error('No local stream available');
            return;
        }
        
        try {
            // Create peer connection
            this.pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            // Add tracks
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // Set bitrate based on settings
            const bitrate = parseInt(document.getElementById('bitrateSlider').value) * 1000;
            
            // Create offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            
            // Send to WHIP server
            const response = await fetch(`${this.whipServer}/${this.license.whipEndpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/sdp',
                    'Authorization': `Bearer ${this.license.key}`
                },
                body: offer.sdp
            });
            
            if (response.ok) {
                const answer = await response.text();
                await this.pc.setRemoteDescription({
                    type: 'answer',
                    sdp: answer
                });
                
                this.isStreaming = true;
                this.streamStartTime = Date.now();
                this.updateStreamUI(true);
                this.startStatsMonitoring();
                this.updateConnectionStatus('Streaming Live', 'live');
                
            } else {
                throw new Error('Failed to start stream');
            }
        } catch (error) {
            console.error('Stream start error:', error);
            this.updateConnectionStatus('Failed to start stream', 'error');
        }
    }
    
    stopStream() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        
        this.isStreaming = false;
        this.updateStreamUI(false);
        this.stopStatsMonitoring();
        this.updateConnectionStatus('Stream stopped', 'ready');
    }
    
    updateStreamUI(streaming) {
        const overlay = document.getElementById('videoOverlay');
        const indicator = document.getElementById('streamingIndicator');
        const startBtn = document.getElementById('startStreamBtn');
        const stopBtn = document.getElementById('stopStreamBtn');
        
        if (streaming) {
            overlay.style.display = 'none';
            indicator.style.display = 'flex';
            stopBtn.disabled = false;
            
            // Start duration timer
            this.durationInterval = setInterval(() => {
                const duration = Date.now() - this.streamStartTime;
                document.getElementById('durationInfo').textContent = this.formatDuration(duration);
            }, 1000);
        } else {
            overlay.style.display = 'flex';
            indicator.style.display = 'none';
            stopBtn.disabled = true;
            
            // Stop duration timer
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
                this.durationInterval = null;
            }
            document.getElementById('durationInfo').textContent = '00:00:00';
        }
    }
    
    startStatsMonitoring() {
        this.statsInterval = setInterval(async () => {
            if (!this.pc) return;
            
            const stats = await this.pc.getStats();
            let totalBitrate = 0;
            
            stats.forEach(report => {
                if (report.type === 'outbound-rtp' && report.bytesSent) {
                    const bitrate = (report.bytesSent * 8) / 1000; // kbps
                    totalBitrate += bitrate;
                }
            });
            
            document.getElementById('bitrateInfo').textContent = `${Math.round(totalBitrate)} kbps`;
        }, 1000);
    }
    
    stopStatsMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        document.getElementById('bitrateInfo').textContent = '-';
    }
    
    toggleVideo() {
        if (!this.localStream) return;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            
            const btn = document.getElementById('toggleVideo');
            if (videoTrack.enabled) {
                btn.classList.remove('disabled');
            } else {
                btn.classList.add('disabled');
            }
        }
    }
    
    toggleAudio() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            
            const btn = document.getElementById('toggleAudio');
            if (audioTrack.enabled) {
                btn.classList.remove('disabled');
            } else {
                btn.classList.add('disabled');
            }
        }
    }
    
    updateConnectionStatus(text, status) {
        const statusEl = document.querySelector('.connection-status');
        const textEl = statusEl.querySelector('.status-text');
        
        textEl.textContent = text;
        statusEl.className = `connection-status ${status}`;
    }
    
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    showSettings() {
        document.getElementById('settingsModal').style.display = 'flex';
    }
    
    hideSettings() {
        document.getElementById('settingsModal').style.display = 'none';
    }
    
    logout() {
        localStorage.removeItem('voodoo_license');
        if (this.isStreaming) {
            this.stopStream();
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        window.location.reload();
    }
}

// Initialize app
const app = new StandaloneStreamer();