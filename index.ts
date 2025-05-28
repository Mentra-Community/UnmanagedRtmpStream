import { TpaServer, TpaSession } from '@augmentos/sdk';

class ExampleAugmentOSApp extends TpaServer {
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Show welcome message
    session.layouts.showTextWall("Example Photo App Ready!");
    console.log("New session started:", sessionId);
    
    // Take a photo immediately when the app starts
    try {
      console.log("Taking initial photo on startup...");
      session.layouts.showTextWall("Taking initial photo...");
      
      // Request a photo and save it to the gallery
      //const photoUrl = await session.requestPhoto({ saveToGallery: true });
      
      //console.log("Initial photo captured successfully:", photoUrl);
      //session.layouts.showTextWall("Initial photo saved to gallery!");
    } catch (error) {
      console.error("Error capturing initial photo:", error);
      session.layouts.showTextWall("Failed to take initial photo.");
    }

    // Handle real-time transcription
    const cleanup = [
      session.events.onConnected(async (data) => {
        // Show connection message
        console.log('Connected to glasses! Starting RTMP stream...');
        session.layouts.showTextWall('Connected! Starting RTMP stream...');
        
        try {
          // Request RTMP stream to the specified URL
          await session.streaming.requestStream({
            rtmpUrl: 'rtmp://10.0.0.22/s/streamKey',
            video: {
              width: 1280,
              height: 720,
              bitrate: 2000000,  // 2 Mbps
              frameRate: 30
            },
            audio: {
              bitrate: 128000,   // 128 kbps
              sampleRate: 44100,
              echoCancellation: true,
              noiseSuppression: true
            }
          });
          console.log('RTMP stream started successfully');
          session.layouts.showTextWall('RTMP stream started successfully!');
        } catch (error) {
          console.error('Failed to start RTMP stream:', error);
          session.layouts.showTextWall('Failed to start RTMP stream: ' + error.message);
        }
        
        // Still take a photo as before
        const photoUrl = await session.requestPhoto({ saveToGallery: true });
      }),
      session.events.onTranscription(async (data) => {
        // Show transcript text
        session.layouts.showTextWall(data.text, {
          durationMs: data.isFinal ? 3000 : undefined
        });
        
        // Take a photo when the word "photo" appears in a final transcript
        if (data.isFinal && data.text.toLowerCase().includes("photo")) {
          try {
            console.log("Photo keyword detected, taking a photo...");
            session.layouts.showTextWall("Taking a photo...");
            
            // Request a photo and save it to the gallery
            const photoUrl = await session.requestPhoto({ saveToGallery: true });
            
            console.log("Photo captured successfully:", photoUrl);
            session.layouts.showTextWall("Photo saved to gallery!");
          } catch (error) {
            console.error("Error capturing photo:", error);
            session.layouts.showTextWall("Failed to take photo. Please try again.");
          }
        }
        
        // Stop streaming when the phrase "stop streaming" appears in a final transcript
        if (data.isFinal && data.text.toLowerCase().includes("stop streaming")) {
          try {
            console.log("Stop streaming command detected");
            session.layouts.showTextWall("Stopping RTMP stream...");
            
            // Stop the stream
            await session.streaming.stopStream();
            
            console.log("Stream stopped successfully");
            session.layouts.showTextWall("RTMP stream stopped successfully!");
          } catch (error) {
            console.error("Error stopping stream:", error);
            session.layouts.showTextWall("Failed to stop streaming: " + error.message);
          }
        }
        
        // Start streaming again when the phrase "start streaming" appears in a final transcript
        if (data.isFinal && data.text.toLowerCase().includes("start streaming")) {
          try {
            console.log("Start streaming command detected");
            session.layouts.showTextWall("Starting RTMP stream...");
            
            // Start the RTMP stream again
            await session.streaming.requestStream({
              //rtmpUrl: 'rtmp://10.0.0.22/s/streamKey',
              rtmpUrl: 'rtmp://192.168.217.145/s/streamKey',
            
              video: {
                width: 1280,
                height: 720,
                bitrate: 2000000,  // 2 Mbps
                frameRate: 30
              },
              audio: {
                bitrate: 128000,   // 128 kbps
                sampleRate: 44100,
                echoCancellation: true,
                noiseSuppression: true
              }
            });
            
            console.log("RTMP stream started successfully");
            session.layouts.showTextWall("RTMP stream started successfully!");
          } catch (error) {
            console.error("Error starting stream:", error);
            session.layouts.showTextWall("Failed to start streaming: " + error.message);
          }
        }
      }),

      session.events.onPhoneNotifications((data) => {}),

      session.events.onGlassesBattery((data) => {}),

      session.events.onError((error) => {
        console.error('Error:', error);
      }),
      
      // Monitor streaming status
      session.streaming.onStatus((status) => {
        console.log(`Stream status: ${status.status}`);
        
        // Handle different statuses
        switch (status.status) {
          case 'initializing':
            console.log('Stream is initializing...');
            session.layouts.showTextWall('Stream is initializing...');
            break;
          case 'active':
            console.log('Stream is active and running!');
            session.layouts.showTextWall('Stream is active and running!');
            break;
          // case 'busy':
          //   console.log(`Another app is currently streaming: ${status.appId}`);
          //   session.layouts.showTextWall(`Another app is currently streaming: ${status.appId}`);
          //   break;
          case 'error':
            console.error(`Stream error: ${status.errorDetails}`);
            session.layouts.showTextWall(`Stream error: ${status.errorDetails}`);
            break;
          case 'stopped':
            console.log('Stream has stopped');
            session.layouts.showTextWall('Stream has stopped');
            break;
        }
      })
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));
  }
}

// Start the server
// DEV CONSOLE URL: https://console.AugmentOS.org/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ExampleAugmentOSApp({
  packageName: 'com.israelov.local', // The packageName you specified on console.AugmentOS.org
  apiKey: 'cabfa4de8ca320917b2275ccbe62ea30081536ccf28282f9647f7cefcc8b9ff4', // Get this from console.AugmentOS.org
  port: 3000, // The port you're hosting the server on
  augmentOSWebsocketUrl: "ws://localhost:8002/tpa-ws" // Connect directly to the local Docker container
});

app.start().catch(console.error);