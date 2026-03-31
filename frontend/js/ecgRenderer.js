class EcgRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.testRecords = [];
        this.sampleRate = 500;
        this.totalSeconds = 10;
        this.palette = ["#34d399", "#f97316", "#3b82f6", "#a855f7"];
    }

    parseMultipleWaveforms(activeTracksArray) {
        this.testRecords = [];
        activeTracksArray.forEach((track, index) => {
            const parsed = this._parseSingleWaveform(track.xmlDoc);
            if (parsed) {
                this.testRecords.push({
                    ...parsed,
                    name: track.name,
                    color: this.palette[index % this.palette.length]
                });
            }
        });
    }

    _parseSingleWaveform(xmlDoc) {
        const payload = { leadMap: {}, paceSpikes: [] };

        let rhythmWaveform = null;
        const waveforms = xmlDoc.querySelectorAll("Waveform");
        for (let wf of waveforms) {
            if (wf.querySelector("WaveformType")?.textContent === "Rhythm") {
                rhythmWaveform = wf;
                break;
            }
        }
        if (!rhythmWaveform && waveforms.length > 0) rhythmWaveform = waveforms[0];
        if (!rhythmWaveform) return null;

        const sampleRate = parseFloat(rhythmWaveform.querySelector("SampleBase")?.textContent || "500");

        const leads = rhythmWaveform.querySelectorAll("LeadData");
        for (let lead of leads) {
            const leadID = lead.querySelector("LeadID")?.textContent;
            const b64Data = lead.querySelector("WaveFormData")?.textContent;
            const scalingStr = lead.querySelector("LeadAmplitudeUnitsPerBit")?.textContent.replace(",", ".") || "4.88";
            const scaling = parseFloat(scalingStr);

            if (!leadID || !b64Data) continue;

            const rawString = window.atob(b64Data.trim());
            const uint8Array = new Uint8Array(rawString.length);
            for (let i = 0; i < rawString.length; i++) {
                uint8Array[i] = rawString.charCodeAt(i);
            }

            const int16Array = new Int16Array(uint8Array.buffer);
            const unit = (lead.querySelector("LeadAmplitudeUnits")?.textContent || "MICROVOLTS").toUpperCase();
            const multiplier = unit === "MICROVOLTS" ? scaling / 1000 : scaling;

            const finalArray = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                finalArray[i] = int16Array[i] * multiplier;
            }

            payload.leadMap[leadID.toUpperCase()] = finalArray;
        }

        if (payload.leadMap["I"] && payload.leadMap["II"]) {
            const I = payload.leadMap["I"];
            const II = payload.leadMap["II"];
            const len = I.length;

            payload.leadMap["III"] = new Float32Array(len);
            payload.leadMap["AVR"] = new Float32Array(len);
            payload.leadMap["-AVR"] = new Float32Array(len);
            payload.leadMap["AVL"] = new Float32Array(len);
            payload.leadMap["AVF"] = new Float32Array(len);

            for (let i = 0; i < len; i++) {
                payload.leadMap["III"][i] = II[i] - I[i];
                payload.leadMap["AVR"][i] = -0.5 * (I[i] + II[i]);
                payload.leadMap["-AVR"][i] = 0.5 * (I[i] + II[i]);
                payload.leadMap["AVL"][i] = I[i] - 0.5 * II[i];
                payload.leadMap["AVF"][i] = II[i] - 0.5 * I[i];
            }
        }

        const spikeTags = xmlDoc.querySelectorAll("PaceSpike Time, PacemakerSpike Time, Spike Time");
        if (spikeTags.length > 0) {
            payload.paceSpikes = Array.from(spikeTags).map(t => Math.floor(parseInt(t.textContent, 10) * (sampleRate / 1000)));
        } else if (payload.leadMap["II"]) {
            const lead = payload.leadMap["II"];
            for (let i = 1; i < lead.length; i++) {
                if (Math.abs(lead[i] - lead[i - 1]) > 1.25) {
                    payload.paceSpikes.push(i);
                }
            }
        }

        // Apply Low-Pass Filter based on selected Hz
        const filterSelect = document.getElementById("view-filter");
        const cutoffFreq = filterSelect ? parseFloat(filterSelect.value) : 150;
        if (cutoffFreq < sampleRate / 2) {
            const rc = 1.0 / (2 * Math.PI * cutoffFreq);
            const dt = 1.0 / sampleRate;
            const alpha = dt / (rc + dt);

            for (let leadID of Object.keys(payload.leadMap)) {
                const arr = payload.leadMap[leadID];
                if (arr && arr.length > 0) {
                    let prev = arr[0];
                    for (let i = 1; i < arr.length; i++) {
                        arr[i] = prev + alpha * (arr[i] - prev);
                        prev = arr[i];
                    }
                }
            }
        }

        // Remove DC offset (baseline centering)
        for (let leadID of Object.keys(payload.leadMap)) {
            const arr = payload.leadMap[leadID];
            if (arr && arr.length > 0) {
                let sum = 0;
                for (let i = 0; i < arr.length; i++) {
                    sum += arr[i];
                }
                const mean = sum / arr.length;
                for (let i = 0; i < arr.length; i++) {
                    arr[i] -= mean;
                }
            }
        }

        return payload;
    }

    renderGraph() {
        if (!this.canvas || this.testRecords.length === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const baseContainer = document.querySelector('.graph-section');
        const rect = baseContainer.getBoundingClientRect();

        const speedSelect = document.getElementById("view-speed");
        const gainSelect = document.getElementById("view-gain");

        const mmPerSec = speedSelect ? parseFloat(speedSelect.value) : 25;
        const mmPerMv = gainSelect ? parseFloat(gainSelect.value) : 10;

        const baseMmPerSec = 12.5;
        const totalBaseMmX = this.totalSeconds * baseMmPerSec;
        const pixelsPerMm = rect.width / totalBaseMmX;

        const totalMmX = this.totalSeconds * mmPerSec;
        const logicalWidth = totalMmX * pixelsPerMm;

        // Dynamic Height depending on the number of stacked overlapping records
        const N = this.testRecords.length;
        const totalRows = 6 * N;

        // Ensure minimum 200px height per row to prevent clinical squishing. If viewport naturally provides more, take it.
        const standardRowHeight = Math.max(200, rect.height / 6);
        const logicalHeight = standardRowHeight * totalRows;

        this.canvas.width = logicalWidth * dpr;
        this.canvas.height = logicalHeight * dpr;
        this.canvas.style.width = `${logicalWidth}px`;
        this.canvas.style.height = `${logicalHeight}px`;

        this.ctx.scale(dpr, dpr);
        this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        this.drawGrid(logicalWidth, logicalHeight, pixelsPerMm);
        this.drawCabreraLayout(logicalWidth, logicalHeight, pixelsPerMm, mmPerMv, mmPerSec, totalRows);
    }

    drawGrid(width, height, pixelsPerMm) {
        this.ctx.lineWidth = 1;
        const minorColor = "rgba(239, 68, 68, 0.15)";
        const majorColor = "rgba(239, 68, 68, 0.35)";

        this.ctx.beginPath();
        this.ctx.strokeStyle = minorColor;
        for (let x = 0; x <= width; x += pixelsPerMm) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += pixelsPerMm) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
        }
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.strokeStyle = majorColor;
        for (let x = 0; x <= width; x += pixelsPerMm * 5) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += pixelsPerMm * 5) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
        }
        this.ctx.stroke();
    }

    drawCabreraLayout(logicalWidth, logicalHeight, pixelsPerMm, mmPerMv, mmPerSec, totalRows) {
        const rowHeight = logicalHeight / totalRows;

        const baselines = [];
        for (let r = 0; r < totalRows; r++) {
            baselines.push(rowHeight * r + (rowHeight / 2));
        }

        const filterSelect = document.getElementById("view-filter");
        const filterType = filterSelect ? filterSelect.value : "40";
        const paceSelect = document.getElementById("view-pace");
        const paceOn = paceSelect ? paceSelect.value === "on" : true;

        const drawSegment = (leadId, logicalGroupIndex, startSec, endSec) => {
            this.testRecords.forEach((test, tIndex) => {
                const leadData = test.leadMap[leadId];
                if (!leadData) return;

                // MATHEMATICAL INTERLEAVING OF TESTS!
                const row = (logicalGroupIndex * this.testRecords.length) + tIndex;

                const startIdx = Math.floor(startSec * this.sampleRate);
                const endIdx = Math.floor(endSec * this.sampleRate);

                const startX = startSec * mmPerSec * pixelsPerMm;
                const baselineY = baselines[row];

                this.ctx.beginPath();
                this.ctx.strokeStyle = test.color; // Independent color per test
                this.ctx.lineWidth = 1.5;
                let hasMovedTo = false;

                for (let i = startIdx; i < endIdx && i < leadData.length; i++) {
                    const timeOffsetSec = (i - startIdx) / this.sampleRate;
                    const x = startX + (timeOffsetSec * mmPerSec * pixelsPerMm);
                    const mv = leadData[i];
                    const y = baselineY - (mv * mmPerMv * pixelsPerMm);

                    if (!hasMovedTo) {
                        this.ctx.moveTo(x, y);
                        hasMovedTo = true;
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                }
                this.ctx.stroke();

                // Draw label
                this.ctx.fillStyle = test.color;
                this.ctx.font = "20px Inter, sans-serif";

                const labelText = leadId === "-AVR" ? "-aVR" : leadId;
                const labelXOffset = startSec === 0 ? 70 : 12;
                this.ctx.fillText(labelText, startX + labelXOffset, baselineY - rowHeight * 0.30);

                // Draw Pace Spikes if enabled using test paceSpikes array
                if (paceOn && test.paceSpikes.length > 0) {
                    this.ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
                    this.ctx.lineWidth = 1.0;
                    for (let spikeSample of test.paceSpikes) {
                        const spikeSec = spikeSample / this.sampleRate;
                        if (spikeSec >= startSec && spikeSec < endSec) {
                            const spikeX = startX + ((spikeSec - startSec) * mmPerSec * pixelsPerMm);
                            this.ctx.beginPath();
                            this.ctx.moveTo(spikeX, baselineY - rowHeight * 0.4);
                            this.ctx.lineTo(spikeX, baselineY + rowHeight * 0.4);
                            this.ctx.stroke();
                        }
                    }
                }
            });
        };

        // Standard Cabrera Sequence (6x2 layout: 5 seconds per column)
        drawSegment("AVL", 0, 0, 5);
        drawSegment("I", 1, 0, 5);
        drawSegment("-AVR", 2, 0, 5);
        drawSegment("II", 3, 0, 5);
        drawSegment("AVF", 4, 0, 5);
        drawSegment("III", 5, 0, 5);

        drawSegment("V1", 0, 5, 10);
        drawSegment("V2", 1, 5, 10);
        drawSegment("V3", 2, 5, 10);
        drawSegment("V4", 3, 5, 10);
        drawSegment("V5", 4, 5, 10);
        drawSegment("V6", 5, 5, 10);
    }
}
