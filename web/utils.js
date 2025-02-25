// Utility functions for the music visualization

// Update the loading progress bar and text
export function updateLoadingProgress(percent, text) {
    const progressBar = document.getElementById('progress-bar');
    const loadingText = document.getElementById('loading-text');
    
    progressBar.style.width = `${percent}%`;
    loadingText.textContent = text;
}

// Load data from CSV files
export function loadData(url, type, dataCallback) {
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
            }
            return response.text();
        })
        .then(text => {
            const lines = text.split('\n');
            const headers = lines[0].split(',');
            const data = [];
            
            if (type === 'structure') {
                // Parse structure data (feature, time)
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') continue;
                    const parts = lines[i].split(',');
                    if (parts.length >= 2) {
                        data.push({
                            feature: parts[0],
                            time: parseFloat(parts[1])
                        });
                    }
                }
            } else if (type === 'zones') {
                // Parse zone data (time, zone)
                console.log("Parsing zone data with headers:", headers);
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') continue;
                    const parts = lines[i].split(',');
                    if (parts.length >= 2) {
                        // Ensure zone is parsed as an integer
                        const entry = {
                            time: parseFloat(parts[0]),
                            zone: parseInt(parts[1], 10)
                        };
                        data.push(entry);
                    }
                }
                // Log some sample zone data for debugging
                if (data.length > 0) {
                    console.log("Zone data sample:", data[0], data[Math.floor(data.length/2)]);
                }
            } else {
                // Parse other CSV types
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') continue;
                    const parts = lines[i].split(',');
                    if (parts.length >= headers.length) {
                        const entry = {};
                        for (let j = 0; j < headers.length; j++) {
                            entry[headers[j]] = parseFloat(parts[j]);
                        }
                        data.push(entry);
                    }
                }
            }
            
            console.log(`Loaded ${type} data: ${data.length} entries`);
            console.log(`Sample data:`, data.length > 0 ? data[0] : 'No data');
            
            updateLoadingProgress(25, `Loaded ${type} data...`);
            dataCallback(type, data);
            return data; // Return data for chaining
        });
}

// Find closest time index in energy data
export function findClosestTimeIndex(time, energyData) {
    // Binary search to find the closest time index
    let left = 0;
    let right = energyData.length - 1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        if (energyData[mid].time < time) {
            left = mid + 1;
        } else if (energyData[mid].time > time) {
            right = mid - 1;
        } else {
            return mid;
        }
    }
    
    // Return the closest index
    if (right < 0) return 0;
    if (left >= energyData.length) return energyData.length - 1;
    
    const leftDiff = Math.abs(energyData[right].time - time);
    const rightDiff = Math.abs(energyData[left].time - time);
    
    return leftDiff < rightDiff ? right : left;
}

// Find exact (floating point) index position from time
export function findExactIndexFromTime(time, energyData) {
    if (!energyData || energyData.length === 0) return 0;
    
    // Ensure time is a valid number
    if (typeof time !== 'number' || isNaN(time)) {
        console.warn("Invalid time provided to findExactIndexFromTime:", time);
        return 0;
    }
    
    try {
        // Binary search to find surrounding indices
        let left = 0;
        let right = energyData.length - 1;
        
        // Ensure we have valid time values in the data
        if (!energyData[left] || typeof energyData[left].time !== 'number' ||
            !energyData[right] || typeof energyData[right].time !== 'number') {
            console.warn("Invalid time values in energy data");
            return 0;
        }
        
        while (right - left > 1) {
            const mid = Math.floor((left + right) / 2);
            
            // Ensure we have valid data at mid
            if (!energyData[mid] || typeof energyData[mid].time !== 'number') {
                // If mid is invalid, try to find a valid index
                let validIndex = -1;
                for (let i = mid; i <= right; i++) {
                    if (energyData[i] && typeof energyData[i].time === 'number') {
                        validIndex = i;
                        break;
                    }
                }
                
                if (validIndex === -1) {
                    // Try looking backwards
                    for (let i = mid - 1; i >= left; i--) {
                        if (energyData[i] && typeof energyData[i].time === 'number') {
                            validIndex = i;
                            break;
                        }
                    }
                }
                
                if (validIndex === -1) {
                    // No valid indices found
                    return 0;
                }
                
                // Use the valid index
                if (validIndex >= mid) {
                    left = validIndex;
                } else {
                    right = validIndex;
                }
                continue;
            }
            
            if (energyData[mid].time < time) {
                left = mid;
            } else {
                right = mid;
            }
        }
        
        // If we're at exact timestamps, return that index
        if (Math.abs(energyData[left].time - time) < 0.001) return left;
        if (Math.abs(energyData[right].time - time) < 0.001) return right;
        
        // Otherwise interpolate between the two closest indices
        const leftTime = energyData[left].time;
        const rightTime = energyData[right].time;
        const timeDiff = rightTime - leftTime;
        
        if (timeDiff <= 0) return left;
        
        // Calculate the exact fractional index through linear interpolation
        const fraction = (time - leftTime) / timeDiff;
        return left + fraction;
    } catch (error) {
        console.error("Error in findExactIndexFromTime:", error);
        return 0;
    }
}

// Find normalized position (0-1) along the path based on exact audio time
export function findNormalizedPositionFromTime(time, energyData) {
    if (!energyData || energyData.length === 0) return 0;
    
    // Ensure time is a valid number
    if (typeof time !== 'number' || isNaN(time)) {
        console.warn("Invalid time provided to findNormalizedPositionFromTime:", time);
        return 0;
    }
    
    try {
        // Find the closest indices
        const exactIndex = findExactIndexFromTime(time, energyData);
        
        // Ensure we stay within path bounds
        if (exactIndex <= 0) return 0;
        if (exactIndex >= energyData.length - 1) return 0.99; // Avoid exactly 1.0
        
        // Calculate energy derivative (change rate) at this position
        const idx = Math.floor(exactIndex);
        const nextIdx = Math.min(idx + 1, energyData.length - 1);
        
        // Only calculate derivative if we have valid energy values
        let energyChangeRate = 0;
        if (energyData[nextIdx] && energyData[idx] && 
            typeof energyData[nextIdx].energy === 'number' && 
            typeof energyData[idx].energy === 'number') {
            energyChangeRate = Math.abs(energyData[nextIdx].energy - energyData[idx].energy);
        }
        
        // Speed up during energy transitions (high derivative)
        // Apply a non-linear scaling to the position to speed up when energy is changing
        const speedMultiplier = 1.5 + energyChangeRate * 5.0;
        
        // Apply speed multiplier to create a non-linear mapping of time to position
        const basePosition = exactIndex / (energyData.length - 1);
        
        // Use the speed multiplier to adjust position, but ensure we don't exceed valid range
        return Math.min(0.99, basePosition * speedMultiplier);
    } catch (error) {
        console.error("Error in findNormalizedPositionFromTime:", error);
        return 0;
    }
} 