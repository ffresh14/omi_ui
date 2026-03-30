// ==========================================
// MODULE 1: API CLIENT
// ==========================================
// This script interfaces with the Python FastAPI Backend.

class ApiClient {
    // Point directly to the new XML handling endpoint
    static API_URL = "http://localhost:8000/AnalyzeXMLFile";

    /**
     * Sends the physical raw XML file directly to the backend
     * @param {File} xmlFile - The chosen .xml File object
     * @returns {Promise<Object>} The probabilities computed by PyTorch
     */
    static async getAnalysis(xmlFile) {
        
        // 1. Pack the physical file object into a form
        const formData = new FormData();
        formData.append("file", xmlFile);

        // 2. Send POST request as multipart/form-data
        const response = await fetch(this.API_URL, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        const data = await response.json();
        
        // 3. The API wraps data in `{status: "success", analysisResult: {...}}`
        if (data.status === "error") {
             throw new Error(data.analysisResult);
        }
        
        return data.analysisResult;
    }
}
