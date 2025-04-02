// Access token is loaded from .env file
// This will be replaced at build time or loaded by the server
mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN || '';

// Flight paths data - will be loaded from CSV
let flightPaths = [];

// Function to parse CSV and load flight data
async function loadFlightData() {
  try {
    const response = await fetch('data/flights.csv');
    const csvData = await response.text();
    
    // Simple CSV parser
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    
    flightPaths = lines.slice(1).map(line => {
      const values = line.split(',');
      const record = {};
      
      headers.forEach((header, index) => {
        record[header] = values[index];
      });
      
      // Convert to the structure our app expects
      return {
        id: parseInt(record.id),
        name: record.text, // Updated from name to text
        origin_name: record.origin_name,
        origin: { 
          lon: parseFloat(record.origin_lon), 
          lat: parseFloat(record.origin_lat) 
        },
        destination_name: record.destination_name,
        destination: { 
          lon: parseFloat(record.destination_lon), 
          lat: parseFloat(record.destination_lat) 
        },
        color: record.color
      };
    });
    
    console.log('Flight data loaded:', flightPaths);
    
    // Initialize the map once data is loaded
    initializeMap();
  } catch (error) {
    console.error('Error loading flight data:', error);
    // Fallback to empty array
    flightPaths = [];
    // Still initialize the map
    initializeMap();
  }
}

// Global variables for animation state and map
let map;
let isAnimating = false;
let currentAnimationFrameId = null;
let currentPathIndex = 0;
let animationProgress = 0;
let pausedAt = null;

// Track plane position for smoother animation
let lastPlanePosition = null;
let lastBearings = {};

// Track camera position for smoother following
let targetCameraPosition = null;
let currentCameraPosition = null;
let cameraSmoothing = true;

// Track destination markers/popups
let destinationMarkers = [];

// No need to track fades anymore as we'll just remove markers directly

// Animation settings
let pathPauseDuration = 1500; // Default pause between paths (ms)

// Map styles
const mapStyles = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  streets: 'mapbox://styles/mapbox/streets-v12'
};

// Current map style
let currentMapStyle = 'dark';

// Control elements
const animationToggleBtn = document.getElementById('animationToggle');
const resetBtn = document.getElementById('resetAnimation');
const darkStyleBtn = document.getElementById('darkStyle');
const streetsStyleBtn = document.getElementById('streetsStyle');
const followPlaneCheckbox = document.getElementById('followPlane');
const cameraSmoothingCheckbox = document.getElementById('cameraSmoothing');
const currentFlightElement = document.getElementById('currentFlight');
const musicToggle = document.getElementById('musicToggle');
const spotifyEmbed = document.getElementById('spotify-embed');
const musicPlayer = document.getElementById('music-player');

// Initialize map
function initializeMap() {
  map = new mapboxgl.Map({
    container: 'map',
    style: mapStyles[currentMapStyle],
    center: [0, 20],
    zoom: 1.5
  });

  // Wait for map to load
  map.on('load', () => {
    setupPlaneIcon();
    setupFlightPaths();
    setupEventListeners();
  });
}

function setupPlaneIcon() {
  // Try to load PNG first, fall back to SVG
  const planeIcon = new Image();
  
  planeIcon.onload = function() {
    map.addImage('custom-plane', planeIcon, { 
      sdf: false, // Non-SDF rendering for smoother scaling
      pixelRatio: 3 // Higher resolution for smoother rendering
    });
    console.log("Plane PNG loaded successfully");
  };
  
  planeIcon.onerror = function() {
    // If PNG fails, try the SVG
    console.log('Could not load plane-icon.png, trying SVG fallback...');
    fetch('plane-icon.svg')
      .then(response => response.text())
      .then(svgData => {
        const svgBlob = new Blob([svgData], {type: 'image/svg+xml'});
        const url = URL.createObjectURL(svgBlob);
        const svgImage = new Image();
        
        svgImage.onload = function() {
          map.addImage('custom-plane', svgImage, { 
            sdf: false, 
            pixelRatio: 3 
          });
          URL.revokeObjectURL(url);
          console.log("Plane SVG loaded successfully");
        };
        
        svgImage.src = url;
      })
      .catch(error => {
        console.error('Failed to load custom plane icon:', error);
        // Create a simple plane icon as a fallback
        createFallbackPlaneIcon();
      });
  };
  
  planeIcon.src = 'plane-icon.png';
}

function createFallbackPlaneIcon() {
  // Create a canvas with a simple plane shape as a fallback
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Clear background
  ctx.clearRect(0, 0, size, size);
  
  // Draw a better plane shape
  ctx.fillStyle = '#FFFFFF';
  
  // Plane body
  ctx.beginPath();
  ctx.moveTo(size/2, size/6);           // Nose
  ctx.lineTo(size/2 - size/8, size/2);  // Left side
  ctx.lineTo(size/2, size*2/3);         // Tail indent
  ctx.lineTo(size/2 + size/8, size/2);  // Right side
  ctx.closePath();
  ctx.fill();
  
  // Wings
  ctx.beginPath();
  ctx.moveTo(size/4, size/2);           // Left wing tip
  ctx.lineTo(size/2 - size/10, size/2); // Left wing inner
  ctx.lineTo(size/2 + size/10, size/2); // Right wing inner
  ctx.lineTo(size*3/4, size/2);         // Right wing tip
  ctx.closePath();
  ctx.fill();
  
  // Tail
  ctx.beginPath();
  ctx.moveTo(size/2 - size/10, size*2/3); // Left tail
  ctx.lineTo(size/2, size*5/6);           // Tail bottom
  ctx.lineTo(size/2 + size/10, size*2/3); // Right tail
  ctx.closePath();
  ctx.fill();
  
  map.addImage('custom-plane', canvas, { sdf: false, pixelRatio: 3 });
  console.log("Using fallback plane icon");
}

function setupFlightPaths() {
  // Initialize map layers and flight paths
  flightPaths.forEach((path, index) => {
    console.log(`Setting up flight path ${index} with color ${path.color}`);
    
    // Add an empty source for the path
    map.addSource(`flight-path-${index}`, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: []
        }
      }
    });

    // Add line layer for the path
    map.addLayer({
      id: `flight-path-${index}`,
      type: 'line',
      source: `flight-path-${index}`,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        'visibility': 'visible'
      },
      paint: {
        'line-color': path.color || '#FF5733', // Fallback color if none provided
        'line-width': 3,
        'line-opacity': 0.8
      }
    });

    // Add a layer for the animated plane
    map.addSource(`plane-${index}`, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [path.origin.lon, path.origin.lat]
        }
      }
    });

    map.addLayer({
      id: `plane-${index}`,
      type: 'symbol',
      source: `plane-${index}`,
      layout: {
        'icon-image': 'custom-plane',
        'icon-size': 0.8,
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-z-order': 'source',
        'icon-pitch-alignment': 'map',
        'icon-anchor': 'center'
      },
      paint: {
        'icon-opacity': 0,
        'icon-translate': [0, 0],
        'icon-translate-anchor': 'map'
      }
    }, 'waterway-label');
  });
}

// Function to update active style button
function setActiveStyleButton(style) {
  if (style === 'dark') {
    darkStyleBtn.classList.add('style-btn-active');
    streetsStyleBtn.classList.remove('style-btn-active');
  } else {
    darkStyleBtn.classList.remove('style-btn-active');
    streetsStyleBtn.classList.add('style-btn-active');
  }
}

function setupEventListeners() {
  // Animation toggle button
  animationToggleBtn.addEventListener('click', function() {
    if (!isAnimating) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });

  // Reset button
  resetBtn.addEventListener('click', function() {
    resetAnimation();
    if (isAnimating) {
      stopAnimation();
    }
  });
  
  // Map style buttons
  darkStyleBtn.addEventListener('click', function() {
    changeMapStyle('dark');
  });
  
  streetsStyleBtn.addEventListener('click', function() {
    changeMapStyle('streets');
  });
  
  // Camera smoothing toggle
  cameraSmoothingCheckbox.addEventListener('change', function() {
    cameraSmoothing = this.checked;
    // Reset camera position tracking when toggling smoothing
    currentCameraPosition = null;
    targetCameraPosition = null;
  });
  
  // Fixed pause duration at 1.5 seconds (1500ms)
  
  // Music toggle
  musicToggle.addEventListener('change', function() {
    toggleMusic(this.checked);
  });
  
  // Hide music player initially
  musicPlayer.style.display = 'none';
}

// Featured track for the flight animation
const featuredTrack = 'https://open.spotify.com/embed/track/1VLZs2A4GUrd8jCZJRiTzb?utm_source=generator';

function toggleMusic(show) {
  if (show) {
    // Show player and load Spotify embed
    musicPlayer.style.display = 'flex';
    if (spotifyEmbed.src === 'about:blank') {
      // Load the featured track
      spotifyEmbed.src = featuredTrack;
    }
  } else {
    // Hide player
    musicPlayer.style.display = 'none';
    // Optional: pause music by loading blank page
    // spotifyEmbed.src = 'about:blank';
  }
}

// Function to change map style
function changeMapStyle(style) {
  if (mapStyles[style] && style !== currentMapStyle) {
    currentMapStyle = style;
    
    // Update active button state
    setActiveStyleButton(style);
    
    // Reset animation when style changes
    resetAnimation();
    if (isAnimating) {
      stopAnimation();
      animationToggleBtn.textContent = 'Start Animation';
    }
    
    // Remove all destination markers and popups
    destinationMarkers.forEach(item => {
      // Remove the marker
      item.marker.remove();
      // If there's a popup, remove it too (might be null if no image was found)
      if (item.popup) {
        item.popup.remove();
      }
    });
    destinationMarkers = [];
    
    // Store any important map state that needs to be preserved
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    
    // Save visibility of flight paths and planes
    const layerVisibility = {};
    flightPaths.forEach((_, index) => {
      layerVisibility[`flight-path-${index}`] = map.getLayoutProperty(`flight-path-${index}`, 'visibility');
      layerVisibility[`plane-${index}`] = map.getLayoutProperty(`plane-${index}`, 'visibility');
    });
    
    // Change map style
    map.setStyle(mapStyles[style]);
    
    // After style is loaded, re-setup the map
    map.once('style.load', () => {
      // Restore the center and zoom
      map.setCenter(currentCenter);
      map.setZoom(currentZoom);
      
      // Re-setup plane icon, flight paths and event listeners
      setupPlaneIcon();
      setupFlightPaths();
      
      // Restore visibility of flight paths and planes
      flightPaths.forEach((_, index) => {
        if (layerVisibility[`flight-path-${index}`]) {
          map.setLayoutProperty(`flight-path-${index}`, 'visibility', layerVisibility[`flight-path-${index}`]);
        }
        if (layerVisibility[`plane-${index}`]) {
          map.setLayoutProperty(`plane-${index}`, 'visibility', layerVisibility[`plane-${index}`]);
        }
      });
      
      console.log(`Map style changed to ${style}`);
    });
  }
}

function startAnimation() {
  // Toggle animation state
  isAnimating = true;
  animationToggleBtn.textContent = 'Pause Animation';
  animationToggleBtn.classList.remove('start-btn');
  animationToggleBtn.classList.add('stop-btn');
  
  // If resuming, continue from where we left off, otherwise start fresh
  if (pausedAt !== null) {
    // Resume animation from where it was paused
    animatePath(currentPathIndex, animationProgress);
    pausedAt = null;
  } else {
    // Start from the beginning
    animateFlightPaths();
  }
  
  console.log("Animation started");
}

function stopAnimation() {
  // Cancel the animation frame and store the current progress
  if (currentAnimationFrameId) {
    cancelAnimationFrame(currentAnimationFrameId);
    currentAnimationFrameId = null;
    pausedAt = Date.now();
  }
  
  // Update UI
  isAnimating = false;
  animationToggleBtn.textContent = 'Resume Animation';
  animationToggleBtn.classList.remove('stop-btn');
  animationToggleBtn.classList.add('start-btn');
  
  console.log("Animation paused");
}

function resetAnimation() {
  // Reset all paths and planes
  flightPaths.forEach((path, index) => {
    map.getSource(`flight-path-${index}`).setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: []
      }
    });

    // Make sure the line will be visible when redrawn
    map.setPaintProperty(`flight-path-${index}`, 'line-opacity', 0.8);
    map.setPaintProperty(`flight-path-${index}`, 'line-width', 3);
    
    // Hide the plane
    map.setPaintProperty(`plane-${index}`, 'icon-opacity', 0);
  });
  
  // Remove all destination markers and popups
  destinationMarkers.forEach(item => {
    // Remove the marker
    item.marker.remove();
    // If there's a popup, remove it too (might be null if no image was found)
    if (item.popup) {
      item.popup.remove();
    }
  });
  destinationMarkers = [];
  
  // Reset animation state variables
  currentPathIndex = 0;
  animationProgress = 0;
  pausedAt = null;
  lastPlanePosition = null;
  lastBearings = {};
  // No need to reset fade tracker anymore
  
  currentFlightElement.textContent = '-';
  
  // Update button text if it was in "Resume" state
  if (animationToggleBtn.textContent === 'Resume Animation') {
    animationToggleBtn.textContent = 'Start Animation';
  }
  
  console.log("Animation reset");
}

function animateFlightPaths() {
  resetAnimation();
  currentPathIndex = 0;
  animatePath(currentPathIndex, 0);
}

function animatePath(pathIndex, initialProgress = 0) {
  // Check if we've completed all paths
  if (pathIndex >= flightPaths.length) {
    // Reset animation state completely when all paths are done
    stopAnimation();
    pausedAt = null;
    animationProgress = 0;
    animationToggleBtn.textContent = 'Start Animation';
    return;
  }

  const path = flightPaths[pathIndex];
  const arcPath = getArcPath(path.origin, path.destination);
  const bearing = getBearing(path.origin, path.destination);
  const duration = 8000; // Animation duration in ms

  // Update current flight info with origin and destination names only
  currentFlightElement.textContent = `${path.origin_name} to ${path.destination_name}`;
  
  // Make sure the featured track is loaded if music is enabled
  if (musicToggle.checked && spotifyEmbed.src !== featuredTrack) {
    spotifyEmbed.src = featuredTrack;
  }
  
  // Show the plane
  map.setPaintProperty(`plane-${pathIndex}`, 'icon-opacity', 1);
  
  // If resuming from a pause, set the animation to the saved progress point
  if (initialProgress > 0) {
    const exactProgress = initialProgress * arcPath.length;
    const currentIndex = Math.floor(exactProgress);
    const nextIndex = Math.min(currentIndex + 1, arcPath.length - 1);
    const fraction = exactProgress - currentIndex; // For interpolation
    const currentCoords = arcPath.slice(0, currentIndex + 1);
    
    // Update the flight path line to show progress so far
    map.getSource(`flight-path-${pathIndex}`).setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: currentCoords
      }
    });
    
    // Ensure the line is visible by checking the paint property
    if (map.getPaintProperty(`flight-path-${pathIndex}`, 'line-opacity') !== 0.8) {
      map.setPaintProperty(`flight-path-${pathIndex}`, 'line-opacity', 0.8);
    }
    
    // Update the plane position with interpolation for smoother picking up where we left off
    if (currentIndex < arcPath.length) {
      let currentPosition;
      let currentBearing;
      
      if (currentIndex < arcPath.length - 1) {
        // Interpolate between current and next point
        const currPoint = arcPath[currentIndex];
        const nextPoint = arcPath[nextIndex];
        
        // Linear interpolation between points
        currentPosition = [
          currPoint[0] + (nextPoint[0] - currPoint[0]) * fraction,
          currPoint[1] + (nextPoint[1] - currPoint[1]) * fraction
        ];
        
        // Calculate the bearing for rotation
        currentBearing = getSegmentBearing(currPoint, nextPoint);
      } else {
        currentPosition = arcPath[currentIndex];
        currentBearing = bearing;
      }
      
      map.getSource(`plane-${pathIndex}`).setData({
        type: 'Feature',
        properties: {
          bearing: currentBearing
        },
        geometry: {
          type: 'Point',
          coordinates: currentPosition
        }
      });
      
      // Follow the plane if option is checked
      if (followPlaneCheckbox.checked) {
        map.panTo(currentPosition, { duration: 500 });
      }
    }
  } else {
    // Starting fresh, position plane at origin
    map.getSource(`plane-${pathIndex}`).setData({
      type: 'Feature',
      properties: {
        bearing: bearing
      },
      geometry: {
        type: 'Point',
        coordinates: [path.origin.lon, path.origin.lat]
      }
    });

    // Zoom to the start of this path
    if (followPlaneCheckbox.checked) {
      // Reset camera tracking for new path
      currentCameraPosition = map.getCenter();
      targetCameraPosition = [path.origin.lon, path.origin.lat];
      
      // Use flyTo for the initial zoom with a smooth animation
      map.flyTo({
        center: [path.origin.lon, path.origin.lat],
        zoom: 3.5,
        duration: 2000,
        easing: t => {
          // Custom easing function for very smooth motion
          return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        }
      });
    }
  }

  let startTime;
  
  function animate(timestamp) {
    // Check if animation should continue
    if (!isAnimating) {
      // Save the current progress when paused
      animationProgress = startTime ? (timestamp - startTime) / duration : 0;
      return;
    }
    
    if (!startTime) {
      startTime = timestamp - (initialProgress * duration); // Adjust start time for resuming
    }
    
    const progress = (timestamp - startTime) / duration;
    animationProgress = progress; // Store current progress for potential pause
    
    if (progress <= 1) {
      // Use precise progress value for smoother animation
      const exactProgress = progress * arcPath.length;
      const currentIndex = Math.floor(exactProgress);
      const nextIndex = Math.min(currentIndex + 1, arcPath.length - 1);
      const fraction = exactProgress - currentIndex; // For interpolation
      
      // Get the coords for the trail
      const currentCoords = arcPath.slice(0, currentIndex + 1);
      
      // Update the flight path line
      map.getSource(`flight-path-${pathIndex}`).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: currentCoords
        }
      });
      
      // Ensure the line is visible by checking the paint property
      if (map.getPaintProperty(`flight-path-${pathIndex}`, 'line-opacity') !== 0.8) {
        map.setPaintProperty(`flight-path-${pathIndex}`, 'line-opacity', 0.8);
      }
      
      // Calculate interpolated position for smoother movement
      if (currentIndex < arcPath.length) {
        let currentPosition;
        let currentBearing;
        
        if (currentIndex < arcPath.length - 1) {
          // Interpolate between current and next point for smoother motion
          const currPoint = arcPath[currentIndex];
          const nextPoint = arcPath[nextIndex];
          
          // Linear interpolation between points
          currentPosition = [
            currPoint[0] + (nextPoint[0] - currPoint[0]) * fraction,
            currPoint[1] + (nextPoint[1] - currPoint[1]) * fraction
          ];
          
          // Calculate the bearing for rotation
          currentBearing = getSegmentBearing(currPoint, nextPoint);
        } else {
          currentPosition = arcPath[currentIndex];
          currentBearing = bearing;
        }
        
        // We'll handle removing markers when adding new ones instead
        
        // Update the plane position with interpolated coordinates and smooth movement
        
        // Apply position smoothing - if we have a previous position, smooth the transition
        let smoothPosition = currentPosition;
        if (lastPlanePosition) {
          // Apply slight smoothing to position (less aggressive than bearing)
          smoothPosition = [
            lastPlanePosition[0] * 0.2 + currentPosition[0] * 0.8,
            lastPlanePosition[1] * 0.2 + currentPosition[1] * 0.8
          ];
        }
        lastPlanePosition = smoothPosition;
        
        // Apply bearing smoothing to avoid jittery rotation
        let smoothBearing = currentBearing;
        if (!lastBearings[pathIndex]) {
          lastBearings[pathIndex] = currentBearing;
        } else if (Math.abs(lastBearings[pathIndex] - currentBearing) < 45) {
          // Only smooth if the bearing change is not too extreme
          smoothBearing = lastBearings[pathIndex] * 0.85 + currentBearing * 0.15;
        }
        lastBearings[pathIndex] = smoothBearing;
        
        map.getSource(`plane-${pathIndex}`).setData({
          type: 'Feature',
          properties: {
            bearing: smoothBearing
          },
          geometry: {
            type: 'Point',
            coordinates: smoothPosition
          }
        });
        
        // Follow the plane if option is checked - with smooth camera movement
        if (followPlaneCheckbox.checked) {
          // Update target position for camera
          targetCameraPosition = currentPosition;
          
          // Initialize camera position tracking if not set
          if (!currentCameraPosition) {
            currentCameraPosition = map.getCenter();
          }
          
          // Apply camera smoothing
          if (cameraSmoothing) {
            // Update every frame for smoother motion - we can do this now with less aggressive smoothing
            // and the animation will still look smooth but more responsive
            // Get current camera position
            const center = map.getCenter();
            currentCameraPosition = [center.lng, center.lat];
            
            // Interpolate between current camera position and target position
            // Using less smoothing (0.7/0.3 instead of 0.9/0.1) to reduce lag
            const smoothedPosition = [
              currentCameraPosition[0] * 0.7 + targetCameraPosition[0] * 0.3,
              currentCameraPosition[1] * 0.7 + targetCameraPosition[1] * 0.3
            ];
            
            // Apply camera movement with subtle easing and shorter duration
            map.panTo(smoothedPosition, { 
              duration: 500, // Reduced from 800ms for more responsive following
              easing: t => 1 - Math.pow(1 - t, 3) // Cubic ease out for smoother motion
            });
          } else {
            // Direct following without smoothing
            map.panTo(currentPosition, { duration: 50 });
          }
        }
      }
      
      currentAnimationFrameId = requestAnimationFrame(animate);
    } else {
      // Animation complete, show destination image and start the next path after a delay
      
      // Create a marker at the destination
      const destination = flightPaths[pathIndex].destination;
      
      // Before creating the new marker, remove any existing marker at the origin of this path
      if (pathIndex > 0) {
        const currentOrigin = flightPaths[pathIndex].origin;
        
        // Find and remove any markers that are at or very close to this origin
        for (let i = destinationMarkers.length - 1; i >= 0; i--) {
          const item = destinationMarkers[i];
          const markerLngLat = item.marker.getLngLat();
          
          // Check if this marker is at the origin of the current path (with small tolerance)
          const isAtOrigin = 
            Math.abs(markerLngLat.lng - currentOrigin.lon) < 0.1 && 
            Math.abs(markerLngLat.lat - currentOrigin.lat) < 0.1;
            
          if (isAtOrigin) {
            // Found it! Remove this marker immediately
            item.marker.remove();
            // Also remove popup if it exists
            if (item.popup) {
              item.popup.remove();
            }
            destinationMarkers.splice(i, 1);
            break;
          }
        }
      }
      
      // Get the flight ID for the current path
      const flightId = flightPaths[pathIndex].id;
      const imageUrl = `img/${flightId}.png`;
      
      // Create a marker for the destination but DON'T add it to the map yet
      // This prevents the flash at [0,0]
      const marker = new mapboxgl.Marker({ 
        color: flightPaths[pathIndex].color || '#FF5733',
        // Use an anchor to center the marker
        anchor: 'center'
      });
      
      // Set its position (again, not adding to map yet)
      marker.setLngLat([destination.lon, destination.lat]);
      
      // Use a timeout to ensure DOM is ready before adding
      setTimeout(() => {
        // Add to map after a slight delay
        marker.addTo(map);
        
        // Check if the image exists before creating a popup
        const img = new Image();
        img.onload = function() {
          // Image exists, create and show popup with white background
          const popup = new mapboxgl.Popup({ 
            closeButton: false, 
            closeOnClick: false,
            className: 'custom-popup' // Add a custom class
          })
          .setLngLat([destination.lon, destination.lat])
          .setHTML(`<div class="destination-popup">
            <img src="${imageUrl}" alt="Destination" width="160">
            <div class="popup-text">${path.name}</div>
          </div>`);
          
          // Add popup to marker
          marker.setPopup(popup);
          
          // Show the popup
          popup.addTo(map);
          
          // Store both marker and popup for later reference
          destinationMarkers.push({ marker, popup });
        };
        
        img.onerror = function() {
          // Image doesn't exist, only add the marker without a popup
          console.log(`No image found for flight ID ${flightId}`);
          destinationMarkers.push({ marker, popup: null });
        };
        
        // Start loading the image
        img.src = imageUrl;
      }, 10); // Very short timeout to ensure DOM is ready
      
      
      // Begin next path after pause
      setTimeout(() => {
        // Hide current plane before showing next one
        map.setPaintProperty(`plane-${pathIndex}`, 'icon-opacity', 0);
        
        // Begin next flight path
        const nextPathIndex = pathIndex + 1;
        
        // If we've reached the end of all paths, don't try to start another one
        if (nextPathIndex < flightPaths.length) {
          // Start the next flight path
          currentPathIndex = nextPathIndex;
          animatePath(nextPathIndex, 0);
          
          // Start the animation for the next path - but DON'T fade out the previous destination yet
          // We'll fade it out when this animation completes (when the plane arrives at the next destination)
          // So we're just preparing the next path here
        } else {
          // This was the last path, stop the animation
          stopAnimation();
          pausedAt = null;
          animationProgress = 0;
          animationToggleBtn.textContent = 'Start Animation';
        }
      }, pathPauseDuration);
    }
  }
  
  currentAnimationFrameId = requestAnimationFrame(animate);
}

// Get the great circle path between two points
function getArcPath(start, end, steps = 500) {
  const coordinates = [];
  
  // Add the start point explicitly
  coordinates.push([start.lon, start.lat]);
  
  // Create the curved path between start and end
  for (let i = 1; i < steps; i++) {
    const fraction = i / steps;
    
    // Use a smooth arc for better flight paths - approximating great circle with quad interpolation
    // This creates a curved path that looks more natural for flights
    const t = fraction;
    const u = 1 - t;
    const cp = { 
      // Control point for the curve - midpoint raised/lowered depending on path length
      lon: (start.lon + end.lon) / 2,
      lat: (start.lat + end.lat) / 2 + (Math.abs(start.lon - end.lon) > 90 ? 15 : 5) * (Math.sin(fraction * Math.PI))
    };
    
    // Quadratic Bezier interpolation for more natural curved paths
    const lon = u * u * start.lon + 2 * u * t * cp.lon + t * t * end.lon;
    const lat = u * u * start.lat + 2 * u * t * cp.lat + t * t * end.lat;
    
    coordinates.push([lon, lat]);
  }
  
  // Add the end point explicitly
  coordinates.push([end.lon, end.lat]);
  
  // Ensure we have at least 2 points to form a valid LineString
  if (coordinates.length < 2) {
    console.warn("Warning: Path has less than 2 points, adding endpoints explicitly");
    coordinates.push([start.lon, start.lat]);
    coordinates.push([end.lon, end.lat]);
  }
  
  console.log(`Generated path with ${coordinates.length} points`);
  return coordinates;
}

// Calculate bearing between two points
function getBearing(start, end) {
  const startLat = start.lat * Math.PI / 180;
  const startLng = start.lon * Math.PI / 180;
  const destLat = end.lat * Math.PI / 180;
  const destLng = end.lon * Math.PI / 180;

  const y = Math.sin(destLng - startLng) * Math.cos(destLat);
  const x = Math.cos(startLat) * Math.sin(destLat) -
          Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

// Calculate bearing between two adjacent points
function getSegmentBearing(pointA, pointB) {
  // Convert from [lon, lat] format to {lon, lat} format
  const start = { lon: pointA[0], lat: pointA[1] };
  const end = { lon: pointB[0], lat: pointB[1] };
  return getBearing(start, end);
}