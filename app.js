// NetSpeed - Network Speed Test
// Uses free endpoints for testing

const CONFIG = {
    // Test files of different sizes (hosted on GitHub or other fast CDNs)
    downloadUrls: [
        'https://speed.hetzner.de/10MB.bin',      // 10MB test file
        'https://speed.hetzner.de/100MB.bin',     // 100MB test file
    ],
    uploadUrl: 'https://httpbin.org/post',         // Free upload endpoint
    pingUrl: 'https://www.google.com/favicon.ico', // Tiny file for ping
    testDuration: 8000,                            // 8 seconds per test
};

// DOM Elements
const gaugeFill = document.getElementById('gaugeFill');
const speedValue = document.getElementById('speedValue');
const speedUnit = document.getElementById('speedUnit');
const testLabel = document.getElementById('testLabel');
const startBtn = document.getElementById('startBtn');
const btnLoader = document.getElementById('btnLoader');
const btnText = startBtn.querySelector('.btn-text');

// Result elements
const downloadResult = document.getElementById('downloadResult');
const uploadResult = document.getElementById('uploadResult');
const pingResult = document.getElementById('pingResult');
const jitterResult = document.getElementById('jitterResult');
const serverLocation = document.getElementById('serverLocation');

let isTesting = false;

// Update gauge visual
function updateGauge(speed, maxSpeed = 100) {
    const percentage = Math.min(speed / maxSpeed, 1);
    const degrees = percentage * 360;
    gaugeFill.style.setProperty('--fill', `${degrees}deg`);
    
    // Color based on speed
    if (speed < 10) gaugeFill.style.background = `conic-gradient(from 180deg, transparent 0deg, #e94560 ${degrees}deg, transparent ${degrees}deg)`;
    else if (speed < 50) gaugeFill.style.background = `conic-gradient(from 180deg, transparent 0deg, #7b2cbf ${degrees}deg, transparent ${degrees}deg)`;
    else gaugeFill.style.background = `conic-gradient(from 180deg, transparent 0deg, #00d4ff ${degrees}deg, transparent ${degrees}deg)`;
}

// Measure ping (latency)
async function measurePing() {
    const pings = [];
    const iterations = 5;
    
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        try {
            await fetch(`${CONFIG.pingUrl}?t=${Date.now()}`, {
                method: 'HEAD',
                cache: 'no-store',
                mode: 'no-cors'
            });
        } catch (e) {
            // no-cors might error but timing still works
        }
        const end = performance.now();
        pings.push(end - start);
    }
    
    // Remove outliers (first ping often slower due to DNS)
    const validPings = pings.slice(1);
    const avgPing = validPings.reduce((a, b) => a + b, 0) / validPings.length;
    
    // Calculate jitter (standard deviation)
    const mean = avgPing;
    const variance = validPings.reduce((sum, ping) => sum + Math.pow(ping - mean, 2), 0) / validPings.length;
    const jitter = Math.sqrt(variance);
    
    return {
        ping: Math.round(avgPing),
        jitter: Math.round(jitter)
    };
}

// Measure download speed
async function measureDownload() {
    return new Promise((resolve) => {
        const startTime = performance.now();
        let totalBytes = 0;
        let lastTime = startTime;
        let speeds = [];
        
        // Use a decent sized file
        const testUrl = CONFIG.downloadUrls[0] + '?t=' + Date.now();
        
        fetch(testUrl, { cache: 'no-store' })
            .then(response => {
                const reader = response.body.getReader();
                const contentLength = +response.headers.get('Content-Length') || 10 * 1024 * 1024;
                
                function pump() {
                    return reader.read().then(({ done, value }) => {
                        const now = performance.now();
                        const elapsed = (now - startTime) / 1000;
                        
                        if (value) {
                            totalBytes += value.length;
                            
                            // Calculate instant speed
                            const chunkTime = (now - lastTime) / 1000;
                            const chunkSpeed = (value.length * 8) / (1024 * 1024) / chunkTime;
                            speeds.push(chunkSpeed);
                            lastTime = now;
                            
                            // Update UI
                            const currentSpeed = (totalBytes * 8) / (1024 * 1024) / elapsed;
                            updateGauge(currentSpeed, 200);
                            speedValue.textContent = currentSpeed.toFixed(1);
                            
                            // Stop after test duration or if file complete
                            if (elapsed > CONFIG.testDuration / 1000 || done) {
                                reader.cancel();
                                const avgSpeed = speeds.length > 0 
                                    ? speeds.slice(2).reduce((a,b) => a+b, 0) / (speeds.length - 2)
                                    : (totalBytes * 8) / (1024 * 1024) / elapsed;
                                resolve(avgSpeed);
                                return;
                            }
                        }
                        
                        if (done) {
                            const avgSpeed = (totalBytes * 8) / (1024 * 1024) / elapsed;
                            resolve(avgSpeed);
                            return;
                        }
                        
                        return pump();
                    });
                }
                
                return pump();
            })
            .catch(err => {
                console.error('Download test failed:', err);
                resolve(0);
            });
    });
}

// Measure upload speed
async function measureUpload() {
    return new Promise((resolve) => {
        const chunkSize = 2 * 1024 * 1024; // 2MB chunks
        const totalChunks = 10;
        let uploadedBytes = 0;
        let startTime = performance.now();
        let speeds = [];
        
        // Generate random data
        const data = new Uint8Array(chunkSize);
        crypto.getRandomValues(data);
        const blob = new Blob([data]);
        
        async function uploadChunk() {
            const chunkStart = performance.now();
            
            try {
                await fetch(CONFIG.uploadUrl, {
                    method: 'POST',
                    body: blob,
                    headers: { 'Content-Type': 'application/octet-stream' }
                });
                
                const chunkEnd = performance.now();
                const chunkTime = (chunkEnd - chunkStart) / 1000;
                const chunkSpeed = (chunkSize * 8) / (1024 * 1024) / chunkTime;
                speeds.push(chunkSpeed);
                
                uploadedBytes += chunkSize;
                const elapsed = (chunkEnd - startTime) / 1000;
                const currentSpeed = (uploadedBytes * 8) / (1024 * 1024) / elapsed;
                
                updateGauge(currentSpeed, 100);
                speedValue.textContent = currentSpeed.toFixed(1);
                
                if (speeds.length < totalChunks && elapsed < CONFIG.testDuration / 1000) {
                    setTimeout(uploadChunk, 100); // Small delay between chunks
                } else {
                    const avgSpeed = speeds.slice(1).reduce((a,b) => a+b, 0) / (speeds.length - 1);
                    resolve(avgSpeed);
                }
            } catch (err) {
                console.error('Upload test failed:', err);
                resolve(0);
            }
        }
        
        uploadChunk();
    });
}

// Detect rough location
async function detectLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        serverLocation.textContent = `🌍 ${data.city}, ${data.country_name}`;
    } catch {
        serverLocation.textContent = '🌍 Location unknown';
    }
}

// Main test sequence
async function startTest() {
    if (isTesting) return;
    isTesting = true;
    
    // UI State
    startBtn.disabled = true;
    btnText.textContent = 'Testing...';
    btnLoader.classList.add('active');
    testLabel.textContent = 'Initializing';
    testLabel.style.color = '#00d4ff';
    
    // Reset results
    downloadResult.textContent = '--';
    uploadResult.textContent = '--';
    pingResult.textContent = '--';
    jitterResult.textContent = '--';
    
    try {
        // Step 1: Ping
        testLabel.textContent = 'Ping Test';
        speedUnit.textContent = 'ms';
        speedValue.textContent = '...';
        updateGauge(0);
        
        const { ping, jitter } = await measurePing();
        pingResult.textContent = ping;
        jitterResult.textContent = jitter;
        
        // Step 2: Download
        testLabel.textContent = 'Download';
        speedUnit.textContent = 'Mbps';
        speedValue.textContent = '0.0';
        updateGauge(0);
        
        const downloadSpeed = await measureDownload();
        downloadResult.textContent = downloadSpeed.toFixed(1);
        
        // Step 3: Upload
        testLabel.textContent = 'Upload';
        speedValue.textContent = '0.0';
        updateGauge(0);
        
        const uploadSpeed = await measureUpload();
        uploadResult.textContent = uploadSpeed.toFixed(1);
        
        // Done
        testLabel.textContent = 'Complete';
        testLabel.style.color = '#00ff88';
        speedValue.textContent = downloadSpeed.toFixed(1);
        updateGauge(downloadSpeed, 200);
        
    } catch (error) {
        console.error('Test failed:', error);
        testLabel.textContent = 'Error';
        testLabel.style.color = '#e94560';
    } finally {
        isTesting = false;
        startBtn.disabled = false;
        btnText.textContent = 'Test Again';
        btnLoader.classList.remove('active');
    }
}

// Init
detectLocation();