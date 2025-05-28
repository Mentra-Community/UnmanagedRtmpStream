import { TpaServer, TpaSession, RtmpStreamStatus, GlassesToCloudMessageType } from '@augmentos/sdk';
import { setupExpressRoutes } from './webview';
import path from 'path';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;

// Interface for per-session stream state
interface UserStreamState {
  rtmpUrl: string;
  streamStatus: RtmpStreamStatus;
  session: TpaSession;
}

class ExampleAugmentOSApp extends TpaServer {
  // Map userId to their session and stream state
  private activeUserStates: Map<string, UserStreamState> = new Map();
  private defaultRtmpUrl: string = 'rtmp://0.0.0.0/s/streamKey';

  constructor() {
    if (!PACKAGE_NAME || !AUGMENTOS_API_KEY) {
      throw new Error("PACKAGE_NAME and API_KEY must be set");
    }
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY,
      port: PORT,
      publicDir: path.join(__dirname, '../public'),
      augmentOSWebsocketUrl: 'ws://localhost:80/ws'
    });
    setupExpressRoutes(this);
  }

  private getInitialStreamStatus(): RtmpStreamStatus {
    return { type: GlassesToCloudMessageType.RTMP_STREAM_STATUS, status: 'stopped', timestamp: new Date() };
  }

  // Method to update RTMP URL for a specific user
  public setRtmpUrlForUser(userId: string, newUrl: string): void {
    const userState = this.activeUserStates.get(userId);
    if (userState) {
      userState.rtmpUrl = newUrl;
      console.log(`RTMP URL updated to: ${newUrl} for user ${userId}`);
    } else {
      console.warn(`No active session for user ${userId} to set RTMP URL.`);
      // Optionally, store it if you want to persist it for next session, or handle error
    }
  }

  // Method to get current RTMP URL for a specific user
  public getRtmpUrlForUser(userId: string): string | undefined {
    return this.activeUserStates.get(userId)?.rtmpUrl || this.defaultRtmpUrl;
  }

  public getDefaultRtmpUrl(): string {
    return this.defaultRtmpUrl;
  }

  // Method to get stream status for a specific user
  public getStreamStatusForUser(userId: string): RtmpStreamStatus | undefined {
    return this.activeUserStates.get(userId)?.streamStatus || this.getInitialStreamStatus();
  }

  public streamStoppedStatus: RtmpStreamStatus = { type: GlassesToCloudMessageType.RTMP_STREAM_STATUS, status: 'stopped', timestamp: new Date() };

  // Method to start stream for a user
  public async startStreamForUser(userId: string, rtmpUrl?: string): Promise<void> {
    const userState = this.activeUserStates.get(userId);
    if (!userState) {
      console.error("No active session for user:", userId);
      throw new Error("No active session for user to start stream.");
    }
    const urlToUse = rtmpUrl || userState.rtmpUrl || this.defaultRtmpUrl;
    userState.rtmpUrl = urlToUse; // Update the user's state with the URL being used

    console.log(`Attempting to start stream for user ${userId} to URL ${urlToUse}`);
    userState.session.layouts.showTextWall("Starting RTMP stream via web...");
    try {
      await userState.session.streaming.requestStream({
        rtmpUrl: urlToUse,
        video: { width: 1280, height: 720, bitrate: 2000000, frameRate: 30 },
        audio: { bitrate: 128000, sampleRate: 44100, echoCancellation: true, noiseSuppression: true }
      });
      console.log("RTMP stream requested successfully via web for user:", userId);
      // Status will be updated by onStatus handler
    } catch (error: any) {
      console.error(`Failed to start stream for user ${userId}:`, error);
      userState.session.layouts.showTextWall(`Failed to start stream: ${error.message}`);
      // Update status to reflect error if possible, or rely on onStatus
      userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
      throw error;
    }
  }

  // Method to stop stream for a user
  public async stopStreamForUser(userId: string): Promise<void> {
    const userState = this.activeUserStates.get(userId);
    if (!userState) {
      console.error("No active session for user:", userId);
      throw new Error("No active session for user to stop stream.");
    }
    console.log(`Attempting to stop stream for user ${userId}`);
    userState.session.layouts.showTextWall("Stopping RTMP stream via web...");
    try {
      await userState.session.streaming.stopStream();
      console.log("Stream stop requested successfully via web for user:", userId);
      // Status will be updated by onStatus handler
    } catch (error: any) {
      console.error(`Failed to stop stream for user ${userId}:`, error);
      userState.session.layouts.showTextWall(`Failed to stop stream: ${error.message}`);
      userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
      throw error;
    }
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session started: ${sessionId} for user ${userId}`);
    // Initialize state for this user
    const userState: UserStreamState = {
      rtmpUrl: this.defaultRtmpUrl, // Start with default
      streamStatus: this.getInitialStreamStatus(),
      session: session,
    };
    this.activeUserStates.set(userId, userState);

    session.layouts.showTextWall("Example Photo App Ready!");
    // ... (rest of initial photo logic if any, currently commented out)

    const cleanup = [
      session.events.onConnected(async (data) => {
        console.log(`Glass connected for user ${userId}! Starting RTMP stream check...`);
        session.layouts.showTextWall('Connected! Starting RTMP stream...');
        try {
          await session.streaming.requestStream({
            rtmpUrl: userState.rtmpUrl, // Use user-specific RTMP URL
            video: { width: 1280, height: 720, bitrate: 2000000, frameRate: 30 },
            audio: { bitrate: 128000, sampleRate: 44100, echoCancellation: true, noiseSuppression: true }
          });
          console.log('Initial RTMP stream requested successfully for user:', userId);
        } catch (error: any) {
          console.error('Error capturing initial photo or starting stream:', error);
          session.layouts.showTextWall("Failed to take initial photo/stream: " + error.message);
          userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
        }
        const photoUrl = await session.requestPhoto({ saveToGallery: true });
      }),
      session.events.onTranscription(async (data) => {
        session.layouts.showTextWall(data.text, { durationMs: data.isFinal ? 3000 : undefined });
        if (data.isFinal && data.text.toLowerCase().includes("photo")) { /* ... photo logic ... */ }

        if (data.isFinal && data.text.toLowerCase().includes("stop streaming")) {
          try {
            console.log("Stop streaming command detected for user:", userId);
            session.layouts.showTextWall("Stopping RTMP stream...");
            await session.streaming.stopStream();
            console.log("Stream stopped successfully by voice for user:", userId);
            // userState.streamStatus will be updated by onStatus
          } catch (error: any) {
            console.error("Error stopping stream by voice:", error);
            session.layouts.showTextWall("Failed to stop streaming: " + error.message);
            userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
          }
        }

        if (data.isFinal && data.text.toLowerCase().includes("start streaming")) {
          try {
            console.log("Start streaming command detected for user:", userId);
            session.layouts.showTextWall("Starting RTMP stream...");
            await session.streaming.requestStream({
              rtmpUrl: userState.rtmpUrl, // Use user-specific RTMP URL
              video: { width: 1280, height: 720, bitrate: 2000000, frameRate: 30 },
              audio: { bitrate: 128000, sampleRate: 44100, echoCancellation: true, noiseSuppression: true }
            });
            console.log("RTMP stream started successfully by voice for user:", userId);
            // userState.streamStatus will be updated by onStatus
          } catch (error: any) {
            console.error("Error starting stream by voice:", error);
            session.layouts.showTextWall("Failed to start streaming: " + error.message);
            userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
          }
        }
      }),
      session.events.onPhoneNotifications((data) => { }),
      session.events.onGlassesBattery((data) => { }),
      session.events.onError((error) => { console.error('Session Error for user '+ userId + ':', error); }),
      session.streaming.onStatus((status: RtmpStreamStatus) => {
        console.log(`Stream status update for user ${userId}: ${status.status}`, status);
        const currentUserState = this.activeUserStates.get(userId);
        if (currentUserState) {
            currentUserState.streamStatus = { ...status, timestamp: new Date() };
            // Propagate essential parts of status for UI update to glasses
            switch (status.status) {
                case 'initializing':
                    session.layouts.showTextWall('Stream is initializing...');
                    break;
                case 'active':
                    session.layouts.showTextWall('Stream is active and running!');
                    break;
                case 'error':
                    session.layouts.showTextWall(`Stream error: ${status.errorDetails}`);
                    break;
                case 'stopped':
                    session.layouts.showTextWall('Stream has stopped');
                    // Ensure the type is correctly set for a definitive stopped state
                    currentUserState.streamStatus.type = GlassesToCloudMessageType.RTMP_STREAM_STATUS;
                    currentUserState.streamStatus.status = 'stopped'; // Force status if not already
                    break;
            }
        } else {
            console.warn("Received stream status for a user with no active state object:", userId);
        }
      }),
      session.events.onDisconnected((reason: string) => {
        console.log(`Session ${sessionId} for user ${userId} disconnected. Reason: ${reason}`);
        this.activeUserStates.delete(userId);
        console.log(`User state for ${userId} removed. Active states: ${this.activeUserStates.size}`);
      })
    ];

    cleanup.forEach(handler => {
      if (handler && typeof handler === 'function') {
        this.addCleanupHandler(handler);
      }
    });
  }
}

const app = new ExampleAugmentOSApp();
app.start().catch(console.error);

export { ExampleAugmentOSApp };