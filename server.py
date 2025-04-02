import os
import http.server
import socketserver
from http import HTTPStatus

# Parse .env file manually
MAPBOX_TOKEN = None
try:
    with open('.env', 'r') as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                if key == 'MAPBOX_ACCESS_TOKEN':
                    MAPBOX_TOKEN = value
                    break
except Exception as e:
    print(f"Error loading .env file: {e}")
    print("Using empty token - map will not work properly")
    MAPBOX_TOKEN = ''

print(f"Loaded Mapbox token: {MAPBOX_TOKEN[:5]}..." if MAPBOX_TOKEN else "No token found")

class EnvHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle app.js request to inject environment variables
        if self.path == '/js/app.js':
            # Read the app.js file
            with open('js/app.js', 'r') as file:
                content = file.read()
            
            # Replace the environment variable placeholder with the actual token
            content = content.replace(
                "process.env.MAPBOX_ACCESS_TOKEN || ''", 
                f"'{MAPBOX_TOKEN}'"
            )
            
            # Send response
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-type", "application/javascript")
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            return
        
        # Add proper content-type for CSV files
        elif self.path.endswith('.csv'):
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-type", "text/csv")
            self.end_headers()
            
            # Read the file and send it back
            with open(self.path[1:], 'rb') as file:  # remove leading slash
                self.wfile.write(file.read())
            return
        
        # Handle all other requests normally
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

# Set up the server
PORT = 8000
handler = EnvHandler

with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()