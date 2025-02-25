# Music Energy Analyzer

This tool analyzes music files and extracts a smooth energy metric at 24 Hz, perfect for driving animations, visualizations, or any application that needs to sync with music energy. The energy curve resembles a rollercoaster that follows the natural rises and falls of the music.

## Features

### Core Audio Analysis
- **Energy Curve Extraction**: Generates a smooth 24Hz energy metric (0-1) that captures the dynamic intensity of music
- **Physics-Based Smoothing**: Applies momentum and inertia constraints for natural, rollercoaster-like movement
- **Multi-Stage Processing**: Uses cascaded filtering techniques to create natural-feeling rises and falls

### Music Structure Detection
- **Beat & Bar Detection**: Identifies musical beats and organizes them into bars/measures
- **Section Identification**: Uses machine learning (K-means clustering) to detect different song sections
- **Fallback Algorithm**: Energy-based section detection when ML approach fails
- **Drop Detection**: Identifies significant musical drops with precise timing
- **Build-up Recognition**: Detects gradual energy increases before drops

### Spectral Feature Extraction
- **Spectral Centroid**: Measures brightness/sharpness of sound
- **Spectral Bandwidth**: Captures width/spread of frequencies
- **Chroma Features**: Analyzes harmonic content and pitch classes
- **Energy Zone Classification**: Categorizes into low/medium/high energy zones

### Real-Time Visualization
- **Multi-Panel Display**: Four synchronized visualization panels:
  1. Energy curve with zone coloring (blue/green/red)
  2. Audio waveform with bar markers
  3. Spectral features with color-mapped pitch information
  4. Song structure with section boundaries

- **Interactive Controls**:
  - Play/pause toggle
  - Skip forward/backward 10 seconds
  - Toggle between full song view and scrolling view
  - Real-time highlighting of played segments

### Data Export
Four CSV files with synchronized timestamps:
1. **Energy Data**: Time-synchronized energy values
2. **Zone Data**: Energy zone classifications (low/medium/high)
3. **Spectral Data**: Centroid, bandwidth, and chroma values
4. **Structure Data**: Bar boundaries, section changes, drops, and onsets

## 3D Music Rollercoaster Visualization

We've also created an immersive 3D visualization using Three.js that turns the music energy data into a first-person rollercoaster experience.

### Visualization Features

- **First-Person Rollercoaster**: Ride a rollercoaster track generated from music energy data
- **Dynamic Environment**: Environment changes between three themed zones based on music energy:
  - **Low Energy Zone**: Underwater world with swaying plants and swimming fish
  - **Medium Energy Zone**: Forest environment with pulsing trees and floating particles
  - **High Energy Zone**: Volcanic landscape with rising fire particles and pulsing rocks
- **Music-Reactive Elements**: All objects in the scene react to different frequency bands:
  - Bass frequencies affect object size and movement intensity
  - Mid-range frequencies create pulsing effects
  - Treble frequencies drive smaller particle animations
- **Interactive Controls**: 
  - Play/pause the music and restart the ride
  - Toggle between first-person and orbit camera views (press 'V')
  - Real-time display of current energy level and zone

### Running the Visualization

```bash
# Navigate to the web directory
cd web

# Install dependencies
npm install

# Start the development server
npm run dev
```

Then open http://localhost:3000 in your browser to experience the visualization.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/music-energy-analyzer.git
cd music-energy-analyzer

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Basic Analysis

```bash
# Basic analysis with output to console
python music_energy_analyzer.py your_song.mp3

# Save the energy values to CSV files
python music_energy_analyzer.py your_song.mp3 --output energy_data.csv

# Static visualization of the energy curve
python music_energy_analyzer.py your_song.mp3 --visualize
```

### Interactive Playback Visualization

```bash
# Play the song with real-time visualization
python music_energy_analyzer.py your_song.mp3 --play

# Play and save data simultaneously
python music_energy_analyzer.py your_song.mp3 --play --output energy_data.csv
```

### Visualization Controls
- **Full/Scroll View**: Toggle between seeing the entire song or a scrolling window
- **Skip Controls**: Navigate 10 seconds forward or backward
- **Play/Pause**: Control audio playback
- **Auto-Scrolling**: Visualization follows playback position in scroll view mode

## How It Works

The script processes audio through multiple stages:

1. **Feature Extraction**: Extracts multiple audio features including:
   - RMS energy (volume/intensity)
   - Spectral contrast (difference between peaks and valleys in the spectrum)
   - Spectral flux (rate of change of the spectrum)
   - Beat detection and emphasis
   - Build-up detection and drop recognition

2. **Feature Combination**: Combines these features with carefully tuned weights

3. **Physics Simulation**: Applies constraints that mimic real rollercoaster physics:
   - Maximum acceleration/deceleration limits
   - Momentum simulation
   - Gravity effects

4. **Multi-stage Smoothing**: Creates a continuous, non-noisy curve:
   - Savitzky-Golay filtering to preserve meaningful peaks
   - Gaussian filtering for overall smoothness
   - Adaptive smoothing based on local energy

5. **Structural Analysis**: Identifies important musical elements:
   - Bar detection based on beats
   - Section boundaries using machine learning
   - Energy zone classification

6. **Final Processing**: Resamples data to exactly 24 Hz and normalizes to 0-1 range

## Output Format

When saving data with the `--output` flag, the program generates four CSV files:

1. `*_energy.csv`: Time and energy values (0-1)
   - Columns: `time,energy`

2. `*_zones.csv`: Energy zone classifications
   - Columns: `time,zone` (0=low, 1=medium, 2=high)

3. `*_spectral.csv`: Spectral characteristics
   - Columns: `time,centroid,bandwidth,chroma_hue`

4. `*_structure.csv`: Structural elements
   - Columns: `feature,time` with features including:
     - `bar_boundaries`
     - `section_boundaries`
     - `drop_locations`
     - `onset_times`

## Applications

The extracted features can be used for:
- Driving 3D visualizations that react to music
- Synchronizing lighting systems or visual effects
- Creating music-reactive games or experiences
- Analyzing music structure for composition or remixing
- Music education and analysis

## Requirements

- Python 3.6+
- librosa
- numpy
- scipy
- matplotlib
- pygame (for interactive visualization)
- scikit-learn (for music structure detection) 