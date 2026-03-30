// ==========================================
// MODULE 2: UI ORCHESTRATOR
// ==========================================
// Connects the HTML interface to the API Client.

let selectedFile = null;

// 1. HTML Elements
const analyzeBtn = document.getElementById("analyze-btn");
const resultsSection = document.getElementById("results-section");
const resultsGrid = document.getElementById("results-grid");
const loading = document.getElementById("loading");

// 2. Handle File Upload (Drag & Drop)
function bindDropZone(zoneId, inputId, targetCategory) {
    const dropZone = document.getElementById(zoneId);
    const fileInput = document.getElementById(inputId);
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener("click", () => fileInput.click());
    
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0], targetCategory);
        }
    });
    
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0], targetCategory);
        }
    });
}

bindDropZone("drop-zone-current", "file-input-current", "current");
bindDropZone("drop-zone-previous", "file-input-previous", "previous");

window.appState = {
    currentFile: null,
    previousFiles: [],
    renderers: []
};

// Replace file input handler logic
function handleFile(file, category = "current") {
    if (!file.name.toLowerCase().endsWith(".xml")) {
        alert("Please upload a valid ECG XML file.");
        return;
    }

    // Set UI state to Ready
    const dropText = document.querySelector(`#drop-zone-${category} .drop-zone-text`);
    if(dropText) dropText.innerText = `Ready: ${file.name}`;
    const analyzeBtn = document.getElementById("analyze-btn");
    analyzeBtn.classList.remove("hidden");
    selectedFile = file; // Persist for analyze button if needed
    
    const resultsGrid = document.getElementById("results-grid");
    if (resultsGrid) resultsGrid.classList.add("hidden");

    const resultsStatus = document.getElementById("results-status");
    if (resultsStatus) resultsStatus.innerText = "Ready to analyze";

    // Read XML
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

            // Extract Patient info from THIS newest file to show in top bar
            let lastName = xmlDoc.querySelector("PatientLastName")?.textContent || "Unknown";
            let firstName = xmlDoc.querySelector("PatientFirstName")?.textContent || "Unknown";
            let pid = xmlDoc.querySelector("PatientID")?.textContent || "N/A";
            
            if (lastName.toUpperCase() === "CENSOR") lastName = "Doe";
            if (firstName.toUpperCase() === "CENSOR") firstName = "Jane";
            if (pid.toUpperCase() === "CENSOR" || pid === "1234567890") pid = "19750314-8842";

            const gender = xmlDoc.querySelector("Gender")?.textContent || "N/A";
            const age = xmlDoc.querySelector("PatientAge")?.textContent || "";
            const ageUnits = xmlDoc.querySelector("AgeUnits")?.textContent || "";

            document.getElementById("patient-name").innerText = `${lastName}, ${firstName}`;
            document.getElementById("patient-pid").innerText = pid;
            document.getElementById("patient-sex").innerText = gender;
            document.getElementById("patient-age").innerText = age ? `${age} ${ageUnits}` : "N/A";

            // State Logic
            const fileRecord = {
                id: "ecg_" + Date.now().toString(),
                name: file.name,
                xmlDoc: xmlDoc,
                rawFile: file,
                isActive: true // previous files can be toggled
            };

            if (category === "current") {
                window.appState.currentFile = fileRecord;
            } else {
                window.appState.previousFiles.unshift(fileRecord);
            }

            updateSidebarLists();
            renderMergedTracks();

        } catch (err) {
            console.error("Error parsing XML for ECG Graph", err);
        }
    };
    reader.readAsText(file);
}

function updateSidebarLists() {
    const currentList = document.getElementById("current-ecg-list");
    const prevList = document.getElementById("previous-ecg-list");
    
    if (currentList && window.appState.currentFile) {
        currentList.innerHTML = `<div class="list-item" style="border-left: 3px solid #34d399">${window.appState.currentFile.name}</div>`;
    }

    if (prevList) {
        prevList.innerHTML = "";
        if (window.appState.previousFiles.length === 0) {
            prevList.innerHTML = `<div class="list-item empty-state">No previous tests.</div>`;
        } else {
            window.appState.previousFiles.forEach((fileRec, index) => {
                const div = document.createElement("div");
                div.className = "list-item";
                div.style.cursor = "pointer";
                div.style.display = "flex";
                div.style.justifyContent = "space-between";
                
                div.innerHTML = `<span>${fileRec.name}</span> <span style="color: ${fileRec.isActive ? '#34d399' : '#64748b'}">${fileRec.isActive ? '👁' : 'ø'}</span>`;
                div.addEventListener("click", () => {
                    fileRec.isActive = !fileRec.isActive;
                    updateSidebarLists();
                    renderMergedTracks();
                });
                prevList.appendChild(div);
            });
        }
    }
}

function renderMergedTracks() {
    const container = document.getElementById("graph-container");
    const overlay = document.getElementById('ecg-grid-overlay');
    const pText = document.getElementById('graph-placeholder-text');
    const canvas = document.getElementById('ecg-canvas');
    if (!container) return;

    // Gather tracks to mount
    const activeTracks = [];
    if (window.appState.currentFile) activeTracks.push(window.appState.currentFile);
    
    window.appState.previousFiles.forEach(pf => {
        if (pf.isActive) activeTracks.push(pf);
    });

    if (activeTracks.length === 0) {
        if (overlay) overlay.classList.remove('hidden');
        if (pText) pText.classList.remove('hidden');
        if (canvas) canvas.classList.add('hidden');
        return;
    }

    if (overlay) overlay.classList.add('hidden');
    if (pText) pText.classList.add('hidden');
    if (canvas) canvas.classList.remove('hidden');

    if (!window.ecgRendererInstance) {
        window.ecgRendererInstance = new EcgRenderer("ecg-canvas");
    }

    // Route Array of tracks to the single renderer instance!
    window.ecgRendererInstance.parseMultipleWaveforms(activeTracks);
    window.ecgRendererInstance.renderGraph();
}
// 3. Handle Running AI Analysis
analyzeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    // Set UI state to Loading
    analyzeBtn.disabled = true;
    analyzeBtn.innerText = "Analyzing Server-Side...";

    const resultsStatus = document.getElementById("results-status");
    if (resultsStatus) resultsStatus.innerText = "Analyzing...";

    loading.classList.remove("hidden");
    resultsGrid.innerHTML = "";
    resultsGrid.classList.add("hidden");

    try {
        // Send actual File Object to the Backend via Module 1
        const probabilities = await ApiClient.getAnalysis(selectedFile);

        // Display Results
        displayResults(probabilities);
    } catch (error) {
        alert(`API Error: ${error.message} (Is the backend running on port 8000?)`);
        const resultsStatus = document.getElementById("results-status");
        if (resultsStatus) resultsStatus.innerText = "Analysis Failed";
    } finally {
        // Restore UI state
        loading.classList.add("hidden");
        analyzeBtn.disabled = false;
        analyzeBtn.innerText = "Run AI Analysis";
    }
});

function displayResults(probs) {
    resultsGrid.innerHTML = "";
    resultsGrid.classList.remove("hidden");

    const resultsStatus = document.getElementById("results-status");
    if (resultsStatus) resultsStatus.innerText = "Analysis Complete";

    // Map probability object to nicely formatted cards
    for (const [condition, probability] of Object.entries(probs)) {
        // Convert to percentage
        const percentage = (probability * 100).toFixed(1);

        // Dynamic color based on risk severity
        let color = "#34d399"; // Green
        if (probability > 0.4) color = "#fbbf24"; // Yellow
        if (probability > 0.7) color = "#ef4444"; // Red

        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `
            <span class="result-name">${formatName(condition)}</span>
            <span class="result-score" style="color: ${color}">${percentage}%</span>
        `;
        resultsGrid.appendChild(card);
    }
}

function formatName(str) {
    const medicalDictionary = {
        "control_nomyoperi": "Healthy Control (No MI)",
        "control_myoperi": "Control (Pericarditis)",
        "mi_nstemi_nonomi": "NSTEMI (No Occlusion)",
        "mi_stemi_nonomi": "STEMI (No Occlusion)",
        "mi_nstemi_omi_lmca_lad": "NSTEMI with Occlusion (LMCA/LAD)",
        "mi_nstemi_omi_lcx": "NSTEMI with Occlusion (LCX)",
        "mi_nstemi_omi_rca": "NSTEMI with Occlusion (RCA)",
        "mi_stemi_omi_lmca_lad": "STEMI with Occlusion (LMCA/LAD)",
        "mi_stemi_omi_lcx": "STEMI with Occlusion (LCX)",
        "mi_stemi_omi_rca": "STEMI with Occlusion (RCA)",
        "lbbb": "Left Bundle Branch Block"
    };

    return medicalDictionary[str] || str.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

// Bind view changing dropdowns to immediately re-render the canvas
['view-speed', 'view-gain', 'view-filter', 'view-pace'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("change", () => {
            if (window.ecgRendererInstance && window.ecgRendererInstance.testRecords && window.ecgRendererInstance.testRecords.length > 0) {
                window.ecgRendererInstance.renderGraph();
            }
        });
    }
});

// Re-render when window resizes to keep scaling correct
window.addEventListener("resize", () => {
    if (window.ecgRendererInstance && window.ecgRendererInstance.testRecords && window.ecgRendererInstance.testRecords.length > 0) {
        window.ecgRendererInstance.renderGraph();
    }
});

// Bind Zoom components
const zoomSlider = document.getElementById("zoom-slider");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");

if (zoomSlider) {
    zoomSlider.addEventListener("input", () => {
        if (window.ecgRendererInstance && Object.keys(window.ecgRendererInstance.leadMap).length > 0) {
            window.ecgRendererInstance.renderGraph();
        }
    });
}

if (zoomInBtn && zoomSlider) {
    zoomInBtn.addEventListener("click", () => {
        zoomSlider.value = Math.min(parseInt(zoomSlider.max, 10), parseInt(zoomSlider.value, 10) + 1);
        if (window.ecgRendererInstance && Object.keys(window.ecgRendererInstance.leadMap).length > 0) {
            window.ecgRendererInstance.renderGraph();
        }
    });
}

if (zoomOutBtn && zoomSlider) {
    zoomOutBtn.addEventListener("click", () => {
        zoomSlider.value = Math.max(parseInt(zoomSlider.min, 10), parseInt(zoomSlider.value, 10) - 1);
        if (window.ecgRendererInstance && Object.keys(window.ecgRendererInstance.leadMap).length > 0) {
            window.ecgRendererInstance.renderGraph();
        }
    });
}
