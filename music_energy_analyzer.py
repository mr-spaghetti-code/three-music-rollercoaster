import numpy as np
import librosa
import scipy.signal
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter1d, median_filter
import pygame
import threading
import time
import matplotlib.animation as animation
from matplotlib.widgets import Button
from matplotlib.patches import Rectangle, Polygon
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap
import colorsys
import warnings

# Suppress scikit-learn warnings
warnings.filterwarnings("ignore", category=FutureWarning)

def extract_energy_metric(audio_path, output_file=None, visualize=False):
    """
    Analyze an MP3 file and output a smooth energy metric at 24 Hz.
    
    Parameters:
    - audio_path: Path to the MP3 file
    - output_file: Optional path to save the energy values as CSV
    - visualize: If True, displays a visualization of the energy curve
    
    Returns:
    - energy_curve: numpy array containing the energy values (0-1) at 24 Hz
    - Additional musical features for 3D visualization
    """
    # Load the audio file
    print(f"Loading audio file: {audio_path}")
    y, sr = librosa.load(audio_path, sr=None)  # Use native sampling rate
    
    # Duration in seconds
    duration = librosa.get_duration(y=y, sr=sr)
    print(f"Audio duration: {duration:.2f} seconds")
    
    # Target sampling rate for our energy metric (24 Hz)
    target_fps = 24
    target_hop_length = sr // target_fps
    
    # First, downsample the audio to focus on lower frequencies
    # This helps remove high-frequency jitter that doesn't contribute to the rollercoaster feel
    y_downsampled = librosa.resample(y, orig_sr=sr, target_sr=sr//2)
    sr_downsampled = sr//2
    
    # Extract various audio features with larger frame sizes for smoother analysis
    # 1. RMS Energy (volume/intensity) - use larger frame size
    rms = librosa.feature.rms(y=y_downsampled, frame_length=4096, hop_length=1024)[0]
    rms = librosa.util.normalize(rms)
    
    # Pre-smooth RMS with a large window to reduce jitter
    rms = gaussian_filter1d(rms, sigma=15)
    
    # 2. Spectral contrast (difference between peaks and valleys in the spectrum)
    contrast = librosa.feature.spectral_contrast(y=y_downsampled, sr=sr_downsampled, hop_length=1024, fmin=20)
    # Use the mean across frequency bands
    contrast_mean = np.mean(contrast, axis=0)
    contrast_mean = librosa.util.normalize(contrast_mean)
    
    # Pre-smooth contrast with a large window
    contrast_mean = gaussian_filter1d(contrast_mean, sigma=15)
    
    # 3. Spectral flux (rate of change of the spectrum) with smoother window
    spec = np.abs(librosa.stft(y_downsampled, n_fft=4096, hop_length=1024))
    spec_flux = np.diff(spec, axis=1)
    spec_flux = np.concatenate([np.zeros((spec.shape[0], 1)), spec_flux], axis=1)
    spec_flux = np.mean(spec_flux, axis=0)
    spec_flux = librosa.util.normalize(spec_flux)
    
    # Pre-smooth flux
    spec_flux = gaussian_filter1d(spec_flux, sigma=10)
    
    # 4. Beat detection with larger analysis window
    tempo, beats = librosa.beat.beat_track(y=y_downsampled, sr=sr_downsampled, hop_length=1024)
    
    # Handle the case where tempo is returned as an array instead of a scalar
    if isinstance(tempo, np.ndarray):
        if tempo.size == 1:
            tempo = float(tempo[0])  # Extract single value from array
        else:
            tempo = float(np.mean(tempo))  # Take the mean if it's an array with multiple values
    
    print(f"Estimated tempo: {tempo:.2f} BPM")
    
    # Create a smoother beat envelope
    beat_env = np.zeros_like(rms)
    beat_frames = librosa.frames_to_samples(beats, hop_length=1024) // 1024
    valid_indices = beat_frames[beat_frames < len(beat_env)]
    beat_env[valid_indices] = 1.0
    
    # Very smooth beat envelope - much wider filter
    beat_env = gaussian_filter1d(beat_env, sigma=20)
    beat_env = librosa.util.normalize(beat_env)
    
    # 5. Harmonic-percussive source separation for better build-up and drop detection
    harmonic, percussive = librosa.effects.hpss(y_downsampled)
    
    # Calculate percussive energy for drop detection - smoother frame
    percussive_rms = librosa.feature.rms(y=percussive, frame_length=4096, hop_length=1024)[0]
    percussive_rms = librosa.util.normalize(percussive_rms)
    
    # Calculate harmonic energy for melodic segments and buildups
    harmonic_rms = librosa.feature.rms(y=harmonic, frame_length=4096, hop_length=1024)[0]
    harmonic_rms = librosa.util.normalize(harmonic_rms)
    
    # 6. Improved build-up detection with much smoother trend analysis
    # Calculate a very smooth spectral change trend
    spec_diff = np.diff(np.mean(spec, axis=0))
    spec_diff = np.concatenate([[0], spec_diff])
    
    # Apply strong smoothing to the trend
    spec_trend = gaussian_filter1d(spec_diff, sigma=60)  # Much stronger smoothing
    
    # Identify potential buildups where energy is consistently increasing
    buildup_detection = np.zeros_like(spec_diff)
    
    # Enhanced window approach for build-up detection - longer windows
    window_size = int(5 * sr_downsampled / 1024)  # 5 seconds for more gradual buildups
    min_buildup_length = int(2 * sr_downsampled / 1024)  # Minimum 2 seconds for a buildup
    
    for i in range(len(spec_trend) - window_size):
        # Check if we have a significant and consistent increase in energy
        window_trend = spec_trend[i:i+window_size]
        if np.sum(window_trend > 0) > 0.8 * window_size and np.mean(window_trend) > 0.015:
            # Ensure it's actually building up (increasingly positive slope)
            if np.polyfit(np.arange(window_size), window_trend, 1)[0] > 0:
                # Create a very smooth ramp for the buildup
                buildup_detection[i:i+window_size] = np.linspace(0.2, 1.0, window_size) * 0.7
    
    # Very smooth the buildup detection 
    buildup_detection = gaussian_filter1d(buildup_detection, sigma=40)
    
    # 7. Drop detection with fewer but more pronounced drops
    drop_detection = np.zeros_like(percussive_rms)
    
    # First identify potential drop points (significant increases in percussive energy)
    percussive_diff = np.diff(percussive_rms)
    percussive_diff = np.concatenate([[0], percussive_diff])
    
    # Only identify the most significant drops (top 5 percentile)
    potential_drops = percussive_diff > np.percentile(percussive_diff, 95)
    
    # Require minimum spacing between drops (at least 10 seconds)
    min_drop_spacing = int(10 * sr_downsampled / 1024)
    last_drop_idx = -min_drop_spacing  # Initialize to allow a drop at the beginning
    
    # Store the location of significant drops for visualization
    drop_locations = []
    
    # For each potential drop, check if it follows a buildup and has enough spacing
    for i in range(len(potential_drops)):
        if potential_drops[i] and i > min_buildup_length and (i - last_drop_idx) > min_drop_spacing:
            # Check if there was a buildup before this point
            if np.mean(buildup_detection[max(0, i-min_buildup_length):i]) > 0.25:
                # Mark this as a drop with more pronounced effect
                if i + 150 < len(drop_detection):
                    # Record this drop location
                    drop_time = i * 1024 / sr_downsampled
                    drop_locations.append(drop_time)
                    
                    # Create a longer, smoother drop curve
                    drop_length = min(300, len(drop_detection) - i)
                    
                    # Start with a base curve that rises and falls smoothly
                    drop_curve = 0.8 + 0.2 * np.sin(np.linspace(0, np.pi, drop_length))
                    
                    # Add gentle oscillations that sync with the beat (fewer cycles)
                    beat_period = max(8, int(60 / tempo * target_fps / 2))  # Longer period between oscillations
                    oscillation = 0.2 * np.sin(np.linspace(0, drop_length/beat_period * np.pi, drop_length))
                    
                    # Apply very gradual decay to the oscillations
                    decay = np.exp(-np.linspace(0, 2, drop_length))
                    drop_curve += oscillation * decay
                    
                    # Smooth the drop curve itself
                    drop_curve = gaussian_filter1d(drop_curve, sigma=10)
                    
                    # Apply the drop curve
                    end_idx = min(i + drop_length, len(drop_detection))
                    drop_detection[i:end_idx] = drop_curve[:end_idx-i]
                    
                    # Update last drop position
                    last_drop_idx = i
    
    # Smooth the drop detection
    drop_detection = gaussian_filter1d(drop_detection, sigma=15)  # Much stronger smoothing
    
    # 8. Combine features with rollercoaster physics in mind
    combined_energy = (
        0.30 * rms +                # Base energy/intensity
        0.10 * contrast_mean +      # Tonal characteristics
        0.15 * spec_flux +          # Changes in the spectrum
        0.20 * beat_env +           # Beat emphasis for rhythm sections
        0.40 * buildup_detection +  # Enhanced buildups for anticipation
        0.45 * drop_detection       # Pronounced drops with oscillations
    )
    
    # Normalize to 0-1 range
    combined_energy = librosa.util.normalize(combined_energy)
    
    # Apply median filtering to remove any remaining spikes (outliers)
    combined_energy = median_filter(combined_energy, size=5)
    
    # 9. Apply enhanced rollercoaster physics constraints
    energy_physics = np.copy(combined_energy)
    
    # Simulate momentum with stricter constraints - a real rollercoaster has significant momentum
    # Apply a physical constraint: max acceleration/deceleration per frame (much lower now)
    max_change_per_frame = 0.05  # Much smaller maximum change rate
    
    # First smooth pass - apply momentum physics
    for i in range(1, len(energy_physics)):
        # Allow slightly faster changes during high-energy segments
        max_change = max_change_per_frame * (1 + combined_energy[i])
        current_change = energy_physics[i] - energy_physics[i-1]
        if abs(current_change) > max_change:
            energy_physics[i] = energy_physics[i-1] + np.sign(current_change) * max_change
    
    # Apply a Savitzky-Golay filter to preserve the important peaks and valleys
    # while removing smaller fluctuations
    window_length = 101  # Must be odd and <= len(energy_physics)
    if len(energy_physics) > window_length:
        energy_physics = scipy.signal.savgol_filter(energy_physics, window_length, 3)
    
    # 10. Apply final multi-stage smoothing for a realistic rollercoaster feel
    # First, apply a long-window Gaussian filter
    energy_curve = gaussian_filter1d(energy_physics, sigma=30)
    
    # Then apply a second targeted smoothing pass
    window_size = 61  # Must be odd
    half_window = window_size // 2
    
    # Only process if we have enough data points
    if len(energy_curve) > window_size:
        # Create a temporary array to hold the smoothed values
        temp_curve = np.copy(energy_curve)
        
        for i in range(half_window, len(energy_curve) - half_window):
            # Calculate smoothing window with adaptive width
            # More smoothing for low-energy parts, less for high-energy
            local_energy = energy_curve[i]
            sigma = 10 + 20 * (1.0 - local_energy)  # Stronger adaptive smoothing
            
            # Create Gaussian window
            window = np.exp(-0.5 * np.square(np.arange(-half_window, half_window+1) / sigma))
            window = window / np.sum(window)  # Normalize weights
            
            # Apply weighted average
            temp_curve[i] = np.sum(energy_curve[i-half_window:i+half_window+1] * window)
        
        energy_curve = temp_curve
    
    # Apply one final Gaussian filter for ultra-smooth results
    energy_curve = gaussian_filter1d(energy_curve, sigma=10)
    
    # Ensure we still have peaks and valleys by stretching the dynamic range
    energy_min = np.min(energy_curve)
    energy_max = np.max(energy_curve)
    energy_range = energy_max - energy_min
    
    # Expand the dynamic range while keeping within 0-1
    if energy_range > 0:
        # Stretch the range to utilize more of the 0-1 space
        energy_curve = (energy_curve - energy_min) / energy_range
        # Apply a mild non-linear transformation to emphasize peaks and valleys
        energy_curve = np.power(energy_curve, 0.8)  # Values < 1 will enhance contrast
    
    # Resample to exactly 24 Hz
    num_frames = int(duration * target_fps)
    energy_resampled = scipy.signal.resample(energy_curve, num_frames)
    
    # Ensure the energy is in range 0-1
    energy_resampled = np.clip(energy_resampled, 0, 1)
    
    # Final pass of smoothing at the target sample rate
    energy_resampled = gaussian_filter1d(energy_resampled, sigma=5)
    
    # NEW FEATURES FOR 3D VISUALIZATION
    # ================================
    
    # 1. Bar detection (musical bars/measures)
    # Calculate the number of beats per bar (assuming 4/4 time signature for most music)
    beats_per_bar = 4  # Default to 4/4 time signature
    
    # Convert beat frames to time
    beat_times = librosa.frames_to_time(beats, sr=sr_downsampled, hop_length=1024)
    
    # Calculate bar boundaries
    bar_boundaries = []
    for i in range(0, len(beat_times), beats_per_bar):
        if i < len(beat_times):
            bar_boundaries.append(beat_times[i])
    
    # 2. Energy zone classification
    # Classify energy into more fine-grained zones based on energy levels and dynamics
    energy_zones = np.zeros_like(energy_resampled)
    time_array = np.linspace(0, duration, len(energy_resampled))
    
    # Define zone types
    ZONE_QUIET = 0      # Low energy, minimal movement
    ZONE_BUILDUP = 1    # Increasing energy trend
    ZONE_DROP = 2       # High energy after sudden increase
    ZONE_SUSTAINED = 3  # Maintained high energy
    ZONE_DECAY = 4      # Decreasing energy trend
    ZONE_BRIDGE = 5     # Medium energy transitional sections
    
    # Define thresholds for energy zones
    low_threshold = 0.3
    medium_threshold = 0.6
    high_threshold = 0.8
    
    # Create zone labels for visualization
    zone_labels = ['Quiet', 'Buildup', 'Drop', 'Sustained', 'Decay', 'Bridge']
    
    # Create zone colors with meaningful colors for each type
    zone_colors = [
        '#1a237e',  # Dark blue for quiet
        '#ff9800',  # Orange for buildup
        '#f44336',  # Red for drop
        '#9c27b0',  # Purple for sustained
        '#4caf50',  # Green for decay
        '#03a9f4',  # Light blue for bridge
    ]
    zone_cmap = LinearSegmentedColormap.from_list('zone_cmap', zone_colors)
    
    # Calculate energy derivative for trend analysis
    energy_diff = np.gradient(energy_resampled)
    # Smooth the derivative
    energy_diff = gaussian_filter1d(energy_diff, sigma=10)
    
    # Define trend thresholds
    increasing_threshold = 0.01
    decreasing_threshold = -0.01
    
    # Find beat frames at our target sample rate
    beat_frames = []
    for beat_time in bar_boundaries:
        beat_frame = int(beat_time * target_fps)
        if beat_frame < len(energy_resampled):
            beat_frames.append(beat_frame)
    
    # Function to get zone between beats
    def classify_zone_between_beats(start_idx, end_idx):
        segment_energy = energy_resampled[start_idx:end_idx]
        segment_diff = energy_diff[start_idx:end_idx]
        
        avg_energy = np.mean(segment_energy)
        avg_diff = np.mean(segment_diff)
        max_energy = np.max(segment_energy)
        
        # Check for drop (high energy after a buildup)
        if max_energy > high_threshold and avg_diff > 0:
            return ZONE_DROP
        
        # Check for buildup (consistently increasing energy)
        if avg_diff > increasing_threshold:
            return ZONE_BUILDUP
        
        # Check for decay (consistently decreasing energy)
        if avg_diff < decreasing_threshold:
            return ZONE_DECAY
        
        # Check for sustained high energy
        if avg_energy > medium_threshold:
            return ZONE_SUSTAINED
        
        # Check for quiet section
        if avg_energy < low_threshold:
            return ZONE_QUIET
        
        # Default to bridge for medium energy transitional sections
        return ZONE_BRIDGE
    
    # Process zones between beats
    for i in range(len(beat_frames) - 1):
        start_idx = beat_frames[i]
        end_idx = beat_frames[i + 1]
        zone = classify_zone_between_beats(start_idx, end_idx)
        energy_zones[start_idx:end_idx] = zone
    
    # Handle the final segment
    if beat_frames:
        final_zone = classify_zone_between_beats(beat_frames[-1], len(energy_resampled))
        energy_zones[beat_frames[-1]:] = final_zone
    
    # Smooth zone transitions to avoid rapid changes
    # Use a median filter to remove very short zones
    energy_zones_smooth = median_filter(energy_zones, size=51)
    
    # 3. Extract spectral features for color/texture mapping
    # Spectral centroid - brightness of sound (for height or color)
    spectral_centroid = librosa.feature.spectral_centroid(y=y_downsampled, sr=sr_downsampled, hop_length=1024)[0]
    spectral_centroid = librosa.util.normalize(spectral_centroid)
    spectral_centroid = gaussian_filter1d(spectral_centroid, sigma=15)
    
    # Spectral bandwidth - width of the spectrum (for width or scale)
    spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y_downsampled, sr=sr_downsampled, hop_length=1024)[0]
    spectral_bandwidth = librosa.util.normalize(spectral_bandwidth)
    spectral_bandwidth = gaussian_filter1d(spectral_bandwidth, sigma=15)
    
    # Chroma features - harmonic content (for color palette)
    chroma = librosa.feature.chroma_stft(y=y_downsampled, sr=sr_downsampled, hop_length=1024)
    # Get dominant pitch class at each time
    dominant_chroma = np.argmax(chroma, axis=0)
    
    # 4. Onset detection for triggering visual events
    onset_env = librosa.onset.onset_strength(y=y_downsampled, sr=sr_downsampled, hop_length=1024)
    onset_env = librosa.util.normalize(onset_env)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr_downsampled, hop_length=1024)
    onset_times = librosa.frames_to_time(onsets, sr=sr_downsampled, hop_length=1024)
    
    # 5. Estimate musical structure - find repeated sections
    try:
        # Try using K-means for section detection
        print("Detecting song sections using ML approach...")
        
        # Extract MFCCs for section detection
        mfcc = librosa.feature.mfcc(y=y_downsampled, sr=sr_downsampled, hop_length=1024, n_mfcc=13)
        mfcc = mfcc.T  # Transpose to time x features
        
        from sklearn.cluster import KMeans
        
        # Determine optimal number of clusters (sections)
        max_clusters = min(8, len(mfcc) // 100)  # Limit based on song length
        n_clusters = min(max(2, int(duration / 30)), max_clusters)  # Roughly one section per 30 seconds
        
        # Use K-means to cluster similar frames
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)  # Explicitly set n_init
        segment_labels = km.fit_predict(mfcc)
        
        # Smooth the segment labels to avoid rapid changes
        segment_labels_smooth = np.copy(segment_labels)
        for _ in range(5):  # Apply multiple passes of smoothing
            for i in range(1, len(segment_labels_smooth)-1):
                if segment_labels_smooth[i-1] == segment_labels_smooth[i+1] and segment_labels_smooth[i] != segment_labels_smooth[i-1]:
                    segment_labels_smooth[i] = segment_labels_smooth[i-1]
        
        # Find boundaries between sections
        section_boundaries = []
        for i in range(1, len(segment_labels_smooth)):
            if segment_labels_smooth[i] != segment_labels_smooth[i-1]:
                boundary_time = i * 1024 / sr_downsampled
                section_boundaries.append(boundary_time)
                
    except Exception as e:
        print(f"ML-based section detection failed with error: {e}")
        print("Using fallback method for section detection...")
        
        # Fallback: Simple energy-based section detection
        # Divide the song into equal segments and look for energy changes
        
        # First smooth the energy curve even more for reliable section detection
        super_smooth_energy = gaussian_filter1d(combined_energy, sigma=50)
        
        # Get the normalized rate of change
        energy_change = np.abs(np.diff(super_smooth_energy))
        energy_change = np.concatenate([[0], energy_change])
        energy_change = energy_change / np.max(energy_change)
        
        # Find peaks in the energy change rate (potential section boundaries)
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(energy_change, height=0.2, distance=sr_downsampled//1024*15)  # At least 15 seconds apart
        
        # Convert peak indices to time
        section_boundaries = [(peak * 1024 / sr_downsampled) for peak in peaks]
        
        # If we still don't have enough sections, add some based on duration
        if len(section_boundaries) < 2:
            # Determine how many sections to create
            num_sections = max(2, int(duration / 45))  # One section per ~45 seconds
            
            # Create evenly spaced sections
            section_boundaries = np.linspace(30, duration-30, num_sections-1).tolist()
    
    # Resample all features to match the 24 Hz target rate
    resample_features = {}
    
    # Create time arrays for original feature time bases
    feature_time = np.linspace(0, duration, len(spectral_centroid))
    target_time = np.linspace(0, duration, num_frames)
    
    # Resample all the features to 24 Hz
    spectral_centroid_resampled = np.interp(target_time, feature_time, spectral_centroid)
    spectral_bandwidth_resampled = np.interp(target_time, feature_time, spectral_bandwidth)
    
    # Create a simple mapping of dominant chroma to hue (0-1)
    chroma_hue = np.zeros(len(dominant_chroma))
    for i in range(len(dominant_chroma)):
        chroma_hue[i] = dominant_chroma[i] / 12.0  # Map 0-11 to 0-0.92
    
    chroma_hue_resampled = np.interp(target_time, feature_time, chroma_hue)
    
    # Save to file if requested
    if output_file:
        base_filename = output_file.rsplit('.', 1)[0]
        
        # Save energy curve
        timestamps = np.linspace(0, duration, num_frames)
        output_data = np.column_stack((timestamps, energy_resampled))
        np.savetxt(f"{base_filename}_energy.csv", output_data, delimiter=',', 
                   header='time,energy', comments='')
        
        # Save zones
        zone_data = np.column_stack((timestamps, energy_zones_smooth))
        np.savetxt(f"{base_filename}_zones.csv", zone_data, delimiter=',', 
                   header='time,zone', comments='')
        
        # Save spectral features
        spectral_data = np.column_stack((
            timestamps, 
            spectral_centroid_resampled, 
            spectral_bandwidth_resampled,
            chroma_hue_resampled
        ))
        np.savetxt(f"{base_filename}_spectral.csv", spectral_data, delimiter=',', 
                   header='time,centroid,bandwidth,chroma_hue', comments='')
        
        # Save structural information
        structure_info = {
            'bar_boundaries': bar_boundaries,
            'section_boundaries': section_boundaries,
            'drop_locations': drop_locations,
            'onset_times': onset_times.tolist()
        }
        
        # Convert to CSV format
        with open(f"{base_filename}_structure.csv", 'w') as f:
            f.write("feature,time\n")
            for feature, times in structure_info.items():
                for t in times:
                    f.write(f"{feature},{t}\n")
        
        print(f"All visualization data saved to {base_filename}_*.csv files")
    
    # Visualize if requested
    if visualize:
        plt.figure(figsize=(14, 8))
        
        # Plot the resulting energy curve
        time_axis = np.linspace(0, duration, len(energy_resampled))
        plt.subplot(211)
        plt.plot(time_axis, energy_resampled)
        plt.title('Smooth Rollercoaster Energy Curve (24 Hz)')
        plt.xlabel('Time (seconds)')
        plt.ylabel('Energy (0-1)')
        plt.grid(True, alpha=0.3)
        
        # Plot the original audio waveform for comparison
        plt.subplot(212)
        librosa.display.waveshow(y, sr=sr, alpha=0.6)
        plt.title('Audio Waveform')
        plt.xlabel('Time (seconds)')
        plt.tight_layout()
        plt.show()
    
    # Return all the features
    return {
        'energy': energy_resampled,
        'time': np.linspace(0, duration, len(energy_resampled)),
        'audio_data': y,
        'sr': sr,
        'duration': duration,
        'bar_boundaries': bar_boundaries,
        'energy_zones': energy_zones_smooth,
        'spectral_centroid': spectral_centroid_resampled,
        'spectral_bandwidth': spectral_bandwidth_resampled,
        'chroma_hue': chroma_hue_resampled,
        'section_boundaries': section_boundaries,
        'drop_locations': drop_locations,
        'onset_times': onset_times
    }

def play_music_with_visualization(audio_path, output_file=None):
    """
    Play music while showing a real-time visualization of the energy curve with a moving dot.
    
    Parameters:
    - audio_path: Path to the MP3 file
    - output_file: Optional path to save the energy values as CSV
    """
    # Initialize pygame for audio playback
    pygame.init()
    pygame.mixer.init()
    
    # Extract energy metrics and all features
    features = extract_energy_metric(audio_path, output_file=output_file, visualize=False)
    
    energy_curve = features['energy']
    audio_data = features['audio_data']
    sr = features['sr']
    duration = features['duration']
    
    # Additional visualization features
    bar_boundaries = features['bar_boundaries']
    energy_zones = features['energy_zones']
    spectral_centroid = features['spectral_centroid']
    spectral_bandwidth = features['spectral_bandwidth']
    chroma_hue = features['chroma_hue']
    section_boundaries = features['section_boundaries']
    drop_locations = features['drop_locations']
    onset_times = features['onset_times']
    
    print(f"Preparing to play audio: {audio_path}")
    
    # Setup the plot with more panels for visualization
    fig = plt.figure(figsize=(16, 12))
    grid = plt.GridSpec(4, 1, height_ratios=[3, 1, 1, 1], hspace=0.4)
    
    # Energy curve plot (main rollercoaster)
    ax_energy = fig.add_subplot(grid[0])
    ax_waveform = fig.add_subplot(grid[1])
    ax_features = fig.add_subplot(grid[2])
    ax_structure = fig.add_subplot(grid[3])
    
    # Time array for x-axis
    time_array = np.linspace(0, duration, len(energy_curve))
    
    # Define zone colors and labels
    zone_colors = [
        '#1a237e',  # Dark blue for quiet
        '#ff9800',  # Orange for buildup
        '#f44336',  # Red for drop
        '#9c27b0',  # Purple for sustained
        '#4caf50',  # Green for decay
        '#03a9f4',  # Light blue for bridge
    ]
    zone_labels = ['Quiet', 'Buildup', 'Drop', 'Sustained', 'Decay', 'Bridge']
    
    # Create legend patches
    legend_patches = [Rectangle((0, 0), 1, 1, facecolor=zone_colors[i], alpha=0.2,
                              label=zone_labels[i]) for i in range(len(zone_colors))]
    
    # Add legend to the energy plot
    ax_energy.legend(handles=legend_patches, loc='upper right', bbox_to_anchor=(1.15, 1),
                    fontsize=8)
    
    # Plot the energy curve
    ax_energy.plot(time_array, energy_curve, 'k-', linewidth=2, alpha=0.7)
    
    # Plot colored background for energy zones
    prev_zone = energy_zones[0]
    zone_start = 0
    
    for i in range(1, len(energy_zones)):
        if energy_zones[i] != prev_zone or i == len(energy_zones) - 1:
            # End of zone, create a rectangle
            zone_width = time_array[i] - time_array[zone_start]
            rect = Rectangle((time_array[zone_start], 0), zone_width, 1.0,
                           color=zone_colors[int(prev_zone)], alpha=0.2)
            ax_energy.add_patch(rect)
            
            # Start new zone
            zone_start = i
            prev_zone = energy_zones[i]
    
    # Add drop markers
    for drop_time in drop_locations:
        ax_energy.axvline(x=drop_time, color='r', linestyle='--', alpha=0.7, linewidth=1.5)
        ax_energy.text(drop_time, 1.05, 'Drop', rotation=90, fontsize=8, va='bottom')
    
    # Add section boundary markers
    for section_time in section_boundaries:
        ax_energy.axvline(x=section_time, color='purple', linestyle='-', alpha=0.5, linewidth=1.5)
        ax_energy.text(section_time, 0.95, 'Section', rotation=90, fontsize=8, ha='right')
    
    # Set up for animation
    line_energy, = ax_energy.plot([], [], 'r-', linewidth=3)  # Energy curve up to current position
    position_dot, = ax_energy.plot([], [], 'ro', markersize=10)  # Red dot for current position
    
    # Start in full view mode by default
    ax_energy.set_xlim(0, duration)
    ax_energy.set_ylim(0, 1.1)
    ax_energy.set_title('3D Rollercoaster Energy Curve with Zones', fontsize=12)
    ax_energy.set_ylabel('Energy (0-1)')
    ax_energy.grid(True, alpha=0.3)
    
    # 2. Plot the audio waveform with bar markers
    librosa.display.waveshow(audio_data, sr=sr, ax=ax_waveform, alpha=0.6)
    waveform_position, = ax_waveform.plot([], [], 'r-', linewidth=2)  # Vertical line for current position
    
    # Add bar markers
    for bar_time in bar_boundaries:
        ax_waveform.axvline(x=bar_time, color='blue', linestyle='-', alpha=0.3, linewidth=0.5)
    
    ax_waveform.set_xlim(0, duration)
    ax_waveform.set_title('Audio Waveform with Bar Markers', fontsize=12)
    
    # 3. Plot spectral features
    # Use a color gradient to show chroma changes
    points = np.array([time_array, spectral_centroid]).T.reshape(-1, 1, 2)
    segments = np.concatenate([points[:-1], points[1:]], axis=1)
    
    # Create a colormap that cycles through HSV
    norm = plt.Normalize(0, 1)
    lc = LineCollection(segments, cmap='hsv', norm=norm, linewidth=2)
    lc.set_array(chroma_hue)
    spectral_line = ax_features.add_collection(lc)
    
    # Also plot spectral bandwidth
    ax_features.plot(time_array, spectral_bandwidth, 'k-', alpha=0.5, linewidth=1)
    
    # Add onset markers
    for onset_time in onset_times:
        ax_features.axvline(x=onset_time, color='green', linestyle='-', alpha=0.3, linewidth=0.5)
    
    # Set up for animation
    features_position, = ax_features.plot([], [], 'r-', linewidth=2)  # Current position line
    
    ax_features.set_xlim(0, duration)
    ax_features.set_ylim(0, 1.1)
    ax_features.set_title('Spectral Features (Centroid=color, Bandwidth=black) & Onsets', fontsize=12)
    
    # 4. Plot structural information
    # Create a colormap for sections
    section_colors = plt.cm.tab10(np.linspace(0, 1, len(section_boundaries)+1))
    
    # Plot sections as colored regions
    prev_section_time = 0
    for i, section_time in enumerate(section_boundaries):
        # Draw a section rectangle
        rect = Rectangle((prev_section_time, 0), section_time - prev_section_time, 1.0,
                         color=section_colors[i], alpha=0.5)
        ax_structure.add_patch(rect)
        
        # Add section label
        midpoint = (prev_section_time + section_time) / 2
        ax_structure.text(midpoint, 0.5, f"Section {i+1}", 
                         horizontalalignment='center', verticalalignment='center', fontsize=10)
        
        prev_section_time = section_time
    
    # Add the final section
    if section_boundaries:
        rect = Rectangle((prev_section_time, 0), duration - prev_section_time, 1.0,
                        color=section_colors[-1], alpha=0.5)
        ax_structure.add_patch(rect)
        midpoint = (prev_section_time + duration) / 2
        ax_structure.text(midpoint, 0.5, f"Section {len(section_boundaries)+1}", 
                         horizontalalignment='center', verticalalignment='center', fontsize=10)
    
    # Set up for animation
    structure_position, = ax_structure.plot([], [], 'r-', linewidth=2)  # Current position line
    
    ax_structure.set_xlim(0, duration)
    ax_structure.set_ylim(0, 1)
    ax_structure.set_title('Song Structure', fontsize=12)
    ax_structure.set_xlabel('Time (seconds)')
    
    # Adjust layout - we won't use tight_layout() since it causes warnings
    fig.subplots_adjust(left=0.08, right=0.92, bottom=0.1, top=0.95, hspace=0.4)
    
    # Variables for playback control and state
    playback_state = {
        'current_time': 0,
        'full_view': True,  # Start in full view mode
        'auto_scroll': False,  # Auto-scroll disabled in full view
        'playback_active': True,
        'force_refresh': False,
    }
    
    # Add control buttons with more horizontal spacing
    button_width = 0.08
    button_spacing = 0.02
    button_y = 0.02
    button_height = 0.04
    
    # Skip backward button
    ax_back_button = plt.axes([0.2, button_y, button_width, button_height])
    back_button = Button(ax_back_button, '◀ -10s')
    
    # Pause/play button
    ax_pause_button = plt.axes([0.3 + button_spacing, button_y, button_width, button_height])
    pause_button = Button(ax_pause_button, 'Pause')
    
    # Skip forward button
    ax_forward_button = plt.axes([0.4 + button_spacing*2, button_y, button_width, button_height])
    forward_button = Button(ax_forward_button, '+10s ▶')
    
    # View toggle button
    ax_view_button = plt.axes([0.5 + button_spacing*3, button_y, button_width, button_height])
    view_button = Button(ax_view_button, 'Scroll View')  # Start in full view, so button says "Scroll View"
    
    def skip_backward(event):
        # Get current position
        current_time = pygame.mixer.music.get_pos() / 1000.0
        # Skip back 10 seconds, but don't go below 0
        new_time = max(0, current_time - 10)
        
        # Pygame doesn't have a reliable way to set absolute position, so restart
        # from the beginning and skip forward to the new position
        pygame.mixer.music.stop()
        pygame.mixer.music.play(0)
        
        # For very short skips, we can just let it play
        # For longer skips, we'll use pygame.mixer.music.set_pos
        if new_time > 0.5:  # Only set position if we're skipping more than 0.5 seconds
            pygame.mixer.music.set_pos(new_time)
        
        # Force refresh on next animation frame
        playback_state['force_refresh'] = True
        playback_state['current_time'] = new_time
        
        # Update scrolling view if needed
        if not playback_state['full_view']:
            window_size = 30
            new_left = max(0, new_time - 5)
            new_right = min(duration, new_left + window_size)
            
            ax_energy.set_xlim(new_left, new_right)
            ax_waveform.set_xlim(new_left, new_right)
            ax_features.set_xlim(new_left, new_right)
            ax_structure.set_xlim(new_left, new_right)
            plt.draw()
    
    def skip_forward(event):
        # Get current position
        current_time = pygame.mixer.music.get_pos() / 1000.0
        # Skip forward 10 seconds, but don't exceed duration
        new_time = min(duration - 0.5, current_time + 10)
        
        # Pygame doesn't have a reliable way to set absolute position, so restart
        # from the beginning and skip forward to the new position
        pygame.mixer.music.stop()
        pygame.mixer.music.play(0)
        
        # Skip to the new position
        if new_time > 0.5:  # Only set position if we're skipping more than 0.5 seconds
            pygame.mixer.music.set_pos(new_time)
        
        # Force refresh on next animation frame
        playback_state['force_refresh'] = True
        playback_state['current_time'] = new_time
        
        # Update scrolling view if needed
        if not playback_state['full_view']:
            window_size = 30
            new_left = max(0, new_time - 5)
            new_right = min(duration, new_left + window_size)
            
            ax_energy.set_xlim(new_left, new_right)
            ax_waveform.set_xlim(new_left, new_right)
            ax_features.set_xlim(new_left, new_right)
            ax_structure.set_xlim(new_left, new_right)
            plt.draw()
    
    def toggle_playback(event):
        if playback_state['playback_active']:
            pygame.mixer.music.pause()
            pause_button.label.set_text('Play')
        else:
            pygame.mixer.music.unpause()
            pause_button.label.set_text('Pause')
        playback_state['playback_active'] = not playback_state['playback_active']
        plt.draw()  # Force redraw
    
    def toggle_view(event):
        playback_state['full_view'] = not playback_state['full_view']
        
        if playback_state['full_view']:
            # Show full song view
            ax_energy.set_xlim(0, duration)
            ax_waveform.set_xlim(0, duration)
            ax_features.set_xlim(0, duration)
            ax_structure.set_xlim(0, duration)
            view_button.label.set_text('Scroll View')
            playback_state['auto_scroll'] = False
        else:
            # Switch to scrolling view, focused on current position
            current_time = pygame.mixer.music.get_pos() / 1000.0
            if current_time < 0:
                current_time = 0
                
            window_size = 30  # 30-second window
            new_left = max(0, current_time - 5)
            new_right = min(duration, new_left + window_size)
            
            ax_energy.set_xlim(new_left, new_right)
            ax_waveform.set_xlim(new_left, new_right)
            ax_features.set_xlim(new_left, new_right)
            ax_structure.set_xlim(new_left, new_right)
            view_button.label.set_text('Full View')
            playback_state['auto_scroll'] = True
        
        plt.draw()  # Force redraw to update the view immediately
    
    # Connect button callbacks
    back_button.on_clicked(skip_backward)
    pause_button.on_clicked(toggle_playback)
    forward_button.on_clicked(skip_forward)
    view_button.on_clicked(toggle_view)
    
    # Convert audio data to pygame format
    pygame.mixer.music.load(audio_path)
    
    # Animation function to update the plot
    def update_plot(frame):
        if not playback_state['playback_active'] and not playback_state['force_refresh']:
            return position_dot, line_energy, waveform_position, features_position, structure_position
        
        # Get the current playback time
        current_time = pygame.mixer.music.get_pos() / 1000.0  # Convert ms to seconds
        
        # If we've just skipped, use our stored time
        if playback_state['force_refresh']:
            current_time = playback_state['current_time']
            playback_state['force_refresh'] = False
            
        if current_time < 0:  # Sometimes returns negative values when starting
            current_time = 0
            
        # Update stored time
        playback_state['current_time'] = current_time
            
        # Find the corresponding index in our data
        idx = min(int(current_time * 24), len(energy_curve) - 1)
        
        if idx >= 0:
            # Update the position of the red dot
            position_dot.set_data([current_time], [energy_curve[idx]])
            
            # Update the highlighted portion of the energy curve
            visible_idx = max(0, min(idx + 1, len(time_array)))
            line_energy.set_data(time_array[:visible_idx], energy_curve[:visible_idx])
            
            # Update the position lines on all plots
            waveform_position.set_data([current_time, current_time], [-1, 1])
            features_position.set_data([current_time, current_time], [0, 1.1])
            structure_position.set_data([current_time, current_time], [0, 1])
            
            # Auto-scroll all plots if approaching the right edge and in scroll view mode
            if playback_state['auto_scroll'] and current_time > ax_energy.get_xlim()[1] - 5:
                window_size = 30  # Show 30 seconds window
                new_left = current_time - 5
                new_right = current_time + window_size - 5
                
                # Don't scroll beyond the song duration
                if new_right > duration:
                    new_right = duration
                    new_left = max(0, new_right - window_size)
                
                ax_energy.set_xlim(new_left, new_right)
                ax_waveform.set_xlim(new_left, new_right)
                ax_features.set_xlim(new_left, new_right)
                ax_structure.set_xlim(new_left, new_right)
                
        return position_dot, line_energy, waveform_position, features_position, structure_position
    
    # Create the animation - fix the warning by setting save_count
    # Estimate frames based on duration and FPS
    max_frames = int(duration * 24)  # Assuming 24 fps matching our energy curve sampling rate
    
    ani = animation.FuncAnimation(
        fig, update_plot, 
        frames=max_frames,  # Set explicit frame count
        interval=20, 
        blit=True, 
        repeat=False,
        cache_frame_data=False  # Disable frame caching to save memory
    )
    
    # Start playback
    pygame.mixer.music.play(0)
    
    # Show the plot
    plt.show()
    
    # Stop playback when the plot is closed
    pygame.mixer.music.stop()
    pygame.mixer.quit()
    pygame.quit()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Extract energy metrics from music files")
    parser.add_argument("audio_file", help="Path to the audio file (MP3, WAV, etc.)")
    parser.add_argument("--output", "-o", help="Output CSV file path")
    parser.add_argument("--visualize", "-v", action="store_true", help="Visualize the energy curve")
    parser.add_argument("--play", "-p", action="store_true", help="Play audio with real-time visualization")
    
    args = parser.parse_args()
    
    if args.play:
        # Play music with visualization
        play_music_with_visualization(args.audio_file, args.output)
    else:
        # Just analyze and optionally visualize
        features = extract_energy_metric(
            args.audio_file, 
            output_file=args.output,
            visualize=args.visualize
        )
        
        print(f"Generated smooth rollercoaster energy curve with {len(features['energy'])} points at 24 Hz") 