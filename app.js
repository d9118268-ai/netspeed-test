// NetSpeed - Network Speed Test

const CONFIG = {
    downloadUrl: "https://speed.cloudflare.com/__down",
    uploadUrl: "https://speed.cloudflare.com/__up",

    downloadBytes: 10_000_000, // 10 MB
    uploadBytes: 2_000_000,    // 2 MB
    pingUrl: "https://speed.cloudflare.com/cdn-cgi/trace"
};


// DOM ELEMENTS
const gaugeFill = document.getElementById("gaugeFill");
const speedValue = document.getElementById("speedValue");
const speedUnit = document.getElementById("speedUnit");
const testLabel = document.getElementById("testLabel");
const startBtn = document.getElementById("startBtn");
const btnLoader = document.getElementById("btnLoader");
const btnText = startBtn.querySelector(".btn-text");

const downloadResult = document.getElementById("downloadResult");
const uploadResult = document.getElementById("uploadResult");
const pingResult = document.getElementById("pingResult");
const jitterResult = document.getElementById("jitterResult");
const serverLocation = document.getElementById("serverLocation");

let isTesting = false;


// UPDATE SPEED GAUGE
function updateGauge(speed, maxSpeed = 100) {

    const percentage = Math.min(speed / maxSpeed, 1);
    const degrees = percentage * 360;

    let color;

    if (speed < 10) {
        color = "#e94560";
    } else if (speed < 50) {
        color = "#7b2cbf";
    } else {
        color = "#00d4ff";
    }

    gaugeFill.style.background = `
        conic-gradient(
            from 180deg,
            ${color} 0deg,
            ${color} ${degrees}deg,
            transparent ${degrees}deg
        )
    `;
}


// MEASURE PING
async function measurePing() {

    const pings = [];

    for (let i = 0; i < 5; i++) {

        const start = performance.now();

        try {

            await fetch(
                `${CONFIG.pingUrl}?t=${Date.now()}`,
                {
                    cache: "no-store"
                }
            );

        } catch (error) {

            console.warn("Ping attempt failed");

        }

        const end = performance.now();

        pings.push(end - start);
    }


    // Remove first result because it may include connection setup
    const validPings = pings.slice(1);

    const average =
        validPings.reduce((a, b) => a + b, 0)
        / validPings.length;


    const variance =
        validPings.reduce(
            (sum, ping) =>
                sum + Math.pow(ping - average, 2),
            0
        )
        / validPings.length;


    const jitter = Math.sqrt(variance);


    return {
        ping: Math.round(average),
        jitter: Math.round(jitter)
    };
}


// MEASURE DOWNLOAD
async function measureDownload() {

    const url =
        `${CONFIG.downloadUrl}?bytes=${CONFIG.downloadBytes}&t=${Date.now()}`;

    const startTime = performance.now();

    try {

        const response = await fetch(url, {
            cache: "no-store"
        });


        if (!response.ok) {
            throw new Error(
                "Download server returned " + response.status
            );
        }


        const reader = response.body.getReader();

        let totalBytes = 0;


        while (true) {

            const { done, value } =
                await reader.read();


            if (done) break;


            totalBytes += value.length;


            const elapsed =
                (performance.now() - startTime) / 1000;


            if (elapsed > 0) {

                const speed =
                    (totalBytes * 8)
                    / (1024 * 1024)
                    / elapsed;


                speedValue.textContent =
                    speed.toFixed(1);


                updateGauge(speed, 200);
            }
        }


        const totalTime =
            (performance.now() - startTime) / 1000;


        const finalSpeed =
            (totalBytes * 8)
            / (1024 * 1024)
            / totalTime;


        return finalSpeed;


    } catch (error) {

        console.error(
            "Download test failed:",
            error
        );

        throw new Error(
            "Download test failed"
        );
    }
}


// MEASURE UPLOAD
async function measureUpload() {

    try {

        // Simple 2 MB data
        // This avoids the crypto.getRandomValues 65536-byte limit

        const data =
            new Uint8Array(CONFIG.uploadBytes);


        // Fill the array in chunks
        const chunkSize = 65536;

        for (
            let i = 0;
            i < data.length;
            i += chunkSize
        ) {

            crypto.getRandomValues(
                data.subarray(
                    i,
                    Math.min(
                        i + chunkSize,
                        data.length
                    )
                )
            );
        }


        const startTime =
            performance.now();


        const response =
            await fetch(CONFIG.uploadUrl, {

                method: "POST",

                body: data,

                headers: {
                    "Content-Type":
                        "application/octet-stream"
                }

            });


        if (!response.ok) {

            throw new Error(
                "Upload server returned "
                + response.status
            );
        }


        const endTime =
            performance.now();


        const elapsed =
            (endTime - startTime) / 1000;


        const speed =
            (CONFIG.uploadBytes * 8)
            / (1024 * 1024)
            / elapsed;


        speedValue.textContent =
            speed.toFixed(1);


        updateGauge(speed, 100);


        return speed;


    } catch (error) {

        console.error(
            "Upload test failed:",
            error
        );

        throw new Error(
            "Upload test failed"
        );
    }
}


// DETECT LOCATION
async function detectLocation() {

    try {

        const response =
            await fetch(
                "https://ipapi.co/json/"
            );


        const data =
            await response.json();


        serverLocation.textContent =
            `🌍 ${data.city}, ${data.country_name}`;


    } catch (error) {

        serverLocation.textContent =
            "🌍 Location unavailable";
    }
}


// MAIN TEST
async function startTest() {

    if (isTesting) return;

    isTesting = true;


    // Disable button

    startBtn.disabled = true;

    btnText.textContent =
        "Testing...";

    btnLoader.classList.add(
        "active"
    );


    // Reset results

    downloadResult.textContent =
        "--";

    uploadResult.textContent =
        "--";

    pingResult.textContent =
        "--";

    jitterResult.textContent =
        "--";


    try {

        // ----------------
        // PING TEST
        // ----------------

        testLabel.textContent =
            "Testing Ping";

        speedUnit.textContent =
            "ms";

        speedValue.textContent =
            "...";

        updateGauge(0);


        const {
            ping,
            jitter
        } = await measurePing();


        pingResult.textContent =
            ping;

        jitterResult.textContent =
            jitter;


        // ----------------
        // DOWNLOAD TEST
        // ----------------

        testLabel.textContent =
            "Testing Download";

        speedUnit.textContent =
            "Mbps";

        speedValue.textContent =
            "0.0";

        updateGauge(0);


        const downloadSpeed =
            await measureDownload();


        downloadResult.textContent =
            downloadSpeed.toFixed(1);


        // ----------------
        // UPLOAD TEST
        // ----------------

        testLabel.textContent =
            "Testing Upload";

        speedValue.textContent =
            "0.0";

        updateGauge(0);


        const uploadSpeed =
            await measureUpload();


        uploadResult.textContent =
            uploadSpeed.toFixed(1);


        // ----------------
        // COMPLETE
        // ----------------

        testLabel.textContent =
            "Complete";

        testLabel.style.color =
            "#00ff88";


        speedValue.textContent =
            downloadSpeed.toFixed(1);


        speedUnit.textContent =
            "Mbps";


        updateGauge(
            downloadSpeed,
            200
        );


    } catch (error) {

        console.error(
            "Test failed:",
            error
        );


        testLabel.textContent =
            "Test Failed";

        testLabel.style.color =
            "#e94560";


    } finally {

        isTesting = false;

        startBtn.disabled = false;

        btnText.textContent =
            "Test Again";

        btnLoader.classList.remove(
            "active"
        );
    }
}


// START LOCATION DETECTION
detectLocation();