# Earth Recollections Interface (ERI)
A Mapbox GL JS web application that visualizes and animates travel paths across our beautiful Earth, with customizable markers and images.
 
Record your travel memories, or use it for video projects and sentimental builds!

## Flight Paths

The visualization loads flight paths from a CSV file located at `data/flights.csv`. The application animates journeys between multiple destinations with a plane icon, curved paths, and destination images.

### CSV Format

The travel and flight dataset follows this format:
```
id,name,origin_name,origin_lon,origin_lat,destination_name,destination_lon,destination_lat,color
```

For example:
```
0,Singapore to Chicago,Singapore,103.8198,1.3521,Chicago,-87.6298,41.8781,#FF5733
```

Each record represents a flight path with:
- `id`: Unique identifier for the flight (used to match with destination images)
- `name`: Display name for the flight
- `origin_name`: Name of the origin city
- `origin_lon`, `origin_lat`: Coordinates of the origin
- `destination_name`: Name of the destination city
- `destination_lon`, `destination_lat`: Coordinates of the destination
- `color`: Color for the flight path and marker (hex format)(**in development**)

You can modify the `data/flights.csv` file to create your own flight paths.

## Destination Images

The application displays images at destination points when flights arrive. Images are shown in popups and are determined by the flight's ID:

- Images must be placed in the `/img/` directory
- Name format: `{id}.png` (e.g., `0.png`, `1.png`, etc.)
- If an image with the matching ID doesn't exist, no popup will be shown at that destination
- Recommended image size: 150px width for optimal display

## Features

- Animated paths with smooth curved trajectories
- Custom plane icon that rotates based on direction of travel
- Destination markers with images shown in popups
- Multiple map styles (Dark and Streets)
- Camera tracking that follows the plane
- Musical accompaniment option with Spotify integration
- Automatic cleanup of previous destination images when new flights begin

## Setup

1. Get a free Mapbox access token at https://account.mapbox.com/
2. Copy `.env.example` to `.env` and add your Mapbox access token:
   ```
   MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
   ```
3. Create your own plane icon:
   - You can use the included plane-icon.svg as a template
   - Or create your own PNG image (recommended size: 32x32 pixels)
   - Save it as 'plane-icon.png' in the same directory as index.html
4. Add destination images to the `/img/` directory (named `0.png`, `1.png`, etc.)
5. For local development, use the included Python server:
   ```
   # Run the server (no dependencies required)
   python3 server.py
   ```
6. Open your browser and navigate to http://localhost:8000

## Usage

- Click "Start Animation" to begin the flight path animation
- "Pause Animation" to temporarily stop the animation
- "Reset" to clear all paths and start over
- Change "Map Style" to switch between dark and street views (resets animation)
- Toggle "Follow Plane" to enable/disable camera following the plane
- Toggle "Smooth Camera" for smoother camera transitions when following
- Toggle "Music" to enable/disable the Spotify music player

## Contributor(s)
[Leoson Hoay](https://www.linkedin.com/in/leoson-hoay/)

This was originally a passion project that was intended as a dedication to the author's ex-partner as a segment in their potential wedding (it did not happen, of course). After refining it for use at a friend's wedding, he decided to release an open-source version for folks to enjoy. Continued development is expected! 
