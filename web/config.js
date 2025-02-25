// Global configuration for the music visualization

// Color palettes for different zones
export const zonePalettes = {
    0: { // Low energy zone - blue underwater theme
        name: 'low',
        displayName: 'Low Energy',
        main: 0x1a237e,
        accent: 0x4fc3f7,
        ground: 0x0d47a1,
        ambient: 0x0d47a1,
        particles: 0xb3e5fc,
        emissive: 0x0288d1,
        fogColor: 0x0a1a4d
    },
    1: { // Medium energy zone - green forest theme
        name: 'medium',
        displayName: 'Medium Energy',
        main: 0x2e7d32,
        accent: 0x81c784,
        ground: 0x1b5e20,
        ambient: 0x1b5e20,
        particles: 0xc8e6c9,
        emissive: 0x00c853,
        fogColor: 0x0a3a1d
    },
    2: { // High energy zone - red/orange fire theme
        name: 'high',
        displayName: 'High Energy',
        main: 0xbf360c, 
        accent: 0xff9800,
        ground: 0x7f0000,
        ambient: 0x7f0000,
        particles: 0xffab91,
        emissive: 0xff3d00,
        fogColor: 0x3a0a0a
    },
    // Add more zones as needed
    3: { // Ethereal zone - purple/violet theme
        name: 'ethereal',
        displayName: 'Ethereal',
        main: 0x6a0dad,
        accent: 0xd8bfd8,
        ground: 0x4b0082,
        ambient: 0x4b0082,
        particles: 0xe6e6fa,
        emissive: 0x9370db,
        fogColor: 0x2a0a3d
    },
    4: { // Cosmic zone - dark space theme
        name: 'cosmic',
        displayName: 'Cosmic',
        main: 0x000033,
        accent: 0x4169e1,
        ground: 0x191970,
        ambient: 0x191970,
        particles: 0x87cefa,
        emissive: 0x00bfff,
        fogColor: 0x000020
    }
    // You can add more zones here following the same pattern
};

// Get the number of zones
export const zoneCount = Object.keys(zonePalettes).length;

// Generate colors object with named zone keys for easier access
export const colors = {};
Object.entries(zonePalettes).forEach(([key, palette]) => {
    colors[palette.name + 'Zone'] = palette;
});

// Shared configuration values
export const config = {
    particleCount: 5000,
    fogDensity: 0.008,
    cameraFOV: 75,
    cameraNear: 0.1,
    cameraFar: 1000,
    defaultHeightAboveTrack: 4
};

// Shared state that can be accessed by different modules
export const state = {
    isPlaying: false,
    currentIndex: 0,
    currentZone: 'low',  // Default zone
    firstPersonMode: true,
    psychedelicEffectsEnabled: true,
    lastBarTime: 0,
    lastTime: 0
};

// Geometry creators for trippy objects
export const geometryCreators = [
    // Torus
    (THREE) => new THREE.TorusGeometry(2 + Math.random() * 3, 0.5 + Math.random() * 1, 16, 50),
    // Knot
    (THREE) => new THREE.TorusKnotGeometry(1.5 + Math.random() * 2, 0.4 + Math.random() * 0.6, 64, 8),
    // Icosahedron
    (THREE) => new THREE.IcosahedronGeometry(1 + Math.random() * 2, 0),
    // Octahedron
    (THREE) => new THREE.OctahedronGeometry(1 + Math.random() * 2, 0),
    // Tetrahedron
    (THREE) => new THREE.TetrahedronGeometry(1 + Math.random() * 2, 0)
];

// Export particleCount directly for easier import
export const particleCount = config.particleCount; 

// Helper function to get zone name from zone value
export function getZoneNameFromValue(zoneValue) {
    // Ensure zoneValue is a number
    const numericZoneValue = Number(zoneValue);
    
    // If the zone value is invalid or out of range, default to the first zone
    if (isNaN(numericZoneValue) || numericZoneValue < 0) {
        console.warn(`Invalid zone value: ${zoneValue}, defaulting to zone 0`);
        return zonePalettes[0].name;
    }
    
    // If the zone value is a valid index in zonePalettes, use it directly
    if (zonePalettes[numericZoneValue]) {
        return zonePalettes[numericZoneValue].name;
    }
    
    // If the zone value is larger than the available zones, use modulo to wrap around
    // This ensures any arbitrary zone value can be mapped to an available zone
    const wrappedZoneValue = numericZoneValue % zoneCount;
    return zonePalettes[wrappedZoneValue].name;
}

// Helper function to get zone display name from zone value
export function getZoneDisplayName(zoneValue) {
    // Ensure zoneValue is a number
    const numericZoneValue = Number(zoneValue);
    
    // If the zone value is invalid or out of range, default to the first zone
    if (isNaN(numericZoneValue) || numericZoneValue < 0) {
        return zonePalettes[0].displayName;
    }
    
    // If the zone value is a valid index in zonePalettes, use it directly
    if (zonePalettes[numericZoneValue]) {
        return zonePalettes[numericZoneValue].displayName;
    }
    
    // If the zone value is larger than the available zones, use modulo to wrap around
    const wrappedZoneValue = numericZoneValue % zoneCount;
    return zonePalettes[wrappedZoneValue].displayName;
}

// Helper function to get all zone names
export function getAllZoneNames() {
    return Object.values(zonePalettes).map(palette => palette.name);
} 