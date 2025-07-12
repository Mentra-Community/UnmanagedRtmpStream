import { TpaServer, TpaSession, RtmpStreamStatus, GlassesToCloudMessageType, CloudToAppMessageType, AppServer, ManagedStreamStatus, StreamType } from '@mentra/sdk';
import { setupExpressRoutes } from './webview';
import path from 'path';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY;

// Interface for per-session stream state
interface UserStreamState {
  rtmpUrl: string;
  streamStatus: RtmpStreamStatus;
  managedStreamStatus: ManagedStreamStatus | null;
  session: TpaSession;
}

// Interface for persistent user settings that survive disconnections
interface UserPersistentSettings {
  rtmpUrl: string;
}

class SimpleRtmpStreamingApp extends AppServer {
  // Map userId to their session and stream state
  private activeUserStates: Map<string, UserStreamState> = new Map();

  // Map userId to their persistent settings (survives disconnections)
  private persistentUserSettings: Map<string, UserPersistentSettings> = new Map();

  private defaultRtmpUrl: string = 'rtmp://0.0.0.0/s/streamKey';

  constructor() {
    if (!PACKAGE_NAME || !MENTRAOS_API_KEY) {
      throw new Error("PACKAGE_NAME and API_KEY must be set");
    }
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: path.join(__dirname, '../public'),
      //augmentOSWebsocketUrl: 'ws://localhost:80/ws'
    });
    setupExpressRoutes(this);
  }

  private getInitialStreamStatus(): RtmpStreamStatus {
    return { type: GlassesToCloudMessageType.RTMP_STREAM_STATUS, status: 'stopped', timestamp: new Date() };
  }

  /**
   * Updates the RTMP URL for a specific user
   * @param userId - The user ID to update the RTMP URL for
   * @param newUrl - The new RTMP URL to set
   * @throws {Error} If the URL is invalid or user has no active session
   */
  public setRtmpUrlForUser(userId: string, newUrl: string): void {
    // Basic URL validation
    if (!newUrl || typeof newUrl !== 'string') {
      throw new Error('RTMP URL must be a non-empty string');
    }

    // Basic RTMP URL format validation
    if (!newUrl.startsWith('rtmp://') && !newUrl.startsWith('rtmps://')) {
      console.warn(`Warning: RTMP URL for user ${userId} does not start with rtmp:// or rtmps://`);
    }

    // Save to persistent storage first
    this.persistentUserSettings.set(userId, { rtmpUrl: newUrl });

    const userState = this.activeUserStates.get(userId);
    if (userState) {
      const previousUrl = userState.rtmpUrl;
      userState.rtmpUrl = newUrl;
      console.log(`RTMP URL updated for user ${userId}: ${previousUrl} -> ${newUrl}`);

      // Notify the user's glasses that the URL has been updated
      userState.session.layouts.showTextWall(`RTMP URL updated to: ${newUrl}`);
    } else {
      console.log(`RTMP URL saved for user ${userId} (no active session): ${newUrl}`);
    }
  }

  /**
   * Gets the RTMP URL for a specific user
   * @param userId - The user ID to get the RTMP URL for
   * @returns The user's RTMP URL or the default URL if user not found
   */
  public getRtmpUrlForUser(userId: string): string | undefined {
    // Check persistent storage first, then active state, then default
    const persistentSettings = this.persistentUserSettings.get(userId);
    if (persistentSettings) {
      return persistentSettings.rtmpUrl;
    }

    return this.activeUserStates.get(userId)?.rtmpUrl || this.defaultRtmpUrl;
  }

  /**
   * Gets the default RTMP URL
   * @returns The default RTMP URL
   */
  public getDefaultRtmpUrl(): string {
    return this.defaultRtmpUrl;
  }

  /**
   * Gets the stream status for a specific user
   * @param userId - The user ID to get the stream status for
   * @returns The user's stream status or a default stopped status
   */
  public getStreamStatusForUser(userId: string): RtmpStreamStatus | undefined {
    return this.activeUserStates.get(userId)?.streamStatus || this.getInitialStreamStatus();
  }

  public streamStoppedStatus: RtmpStreamStatus = { type: GlassesToCloudMessageType.RTMP_STREAM_STATUS, status: 'stopped', timestamp: new Date() };

  /**
   * Gets the managed stream status for a specific user
   * @param userId - The user ID to get the managed stream status for
   * @returns The user's managed stream status or null
   */
  public getManagedStreamStatusForUser(userId: string): ManagedStreamStatus | null {
    const userState = this.activeUserStates.get(userId);
    const status = userState?.managedStreamStatus || null;
    console.log(`Getting managed stream status for user ${userId}:`, status);
    return status;
  }

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
      await userState.session.camera.startStream({
        rtmpUrl: urlToUse,
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
      await userState.session.camera.stopStream();
      console.log("Stream stop requested successfully via web for user:", userId);
      // Status will be updated by onStatus handler
    } catch (error: any) {
      console.error(`Failed to stop stream for user ${userId}:`, error);
      userState.session.layouts.showTextWall(`Failed to stop stream: ${error.message}`);
      userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
      throw error;
    }
  }

  // Method to start managed stream for a user
  public async startManagedStreamForUser(userId: string): Promise<any> {
    const userState = this.activeUserStates.get(userId);
    if (!userState) {
      console.error("No active session for user:", userId);
      throw new Error("No active session for user to start managed stream.");
    }

    console.log(`Attempting to start managed stream for user ${userId}`);
    userState.session.layouts.showTextWall("Starting managed RTMP stream via web...");
    try {
      const urls = await userState.session.camera.startManagedStream();
      console.log("Managed stream URLs received for user:", userId, urls);
      
      // Initialize managed stream status
      userState.managedStreamStatus = {
        type: CloudToAppMessageType.MANAGED_STREAM_STATUS,
        status: 'initializing',
        hlsUrl: urls.hlsUrl,
        dashUrl: urls.dashUrl,
        webrtcUrl: urls.webrtcUrl,
        streamId: urls.streamId,
        timestamp: new Date()
      };
      
      return urls;
    } catch (error: any) {
      console.error(`Failed to start managed stream for user ${userId}:`, error);
      userState.session.layouts.showTextWall(`Failed to start managed stream: ${error.message}`);
      userState.managedStreamStatus = {
        type: CloudToAppMessageType.MANAGED_STREAM_STATUS,
        status: 'error',
        message: error.message,
        timestamp: new Date()
      };
      throw error;
    }
  }

  // Method to stop managed stream for a user
  public async stopManagedStreamForUser(userId: string): Promise<void> {
    const userState = this.activeUserStates.get(userId);
    if (!userState) {
      console.error("No active session for user:", userId);
      throw new Error("No active session for user to stop managed stream.");
    }
    
    // Log current state for debugging
    const hasLocalManagedStream = userState.managedStreamStatus && 
                                  userState.managedStreamStatus.status !== 'stopped' && 
                                  userState.managedStreamStatus.status !== 'error';
    const hasSdkManagedStream = userState.session.camera.isManagedStreamActive();
    
    console.log(`Managed stream status for user ${userId}: local=${hasLocalManagedStream}, sdk=${hasSdkManagedStream}, status=${userState.managedStreamStatus?.status}`);
    
    // Always allow stopping - the cloud will handle if there's nothing to stop
    // This ensures we can clean up orphaned streams
    
    console.log(`Attempting to stop managed stream for user ${userId}`);
    userState.session.layouts.showTextWall("Stopping managed RTMP stream via web...");
    try {
      await userState.session.camera.stopManagedStream();
      console.log("Managed stream stop requested successfully via web for user:", userId);
      // Don't immediately set to null - wait for the 'stopped' status from the cloud
      // userState.managedStreamStatus = null;
    } catch (error: any) {
      console.error(`Failed to stop managed stream for user ${userId}:`, error);
      userState.session.layouts.showTextWall(`Failed to stop managed stream: ${error.message}`);
      if (userState.managedStreamStatus) {
        userState.managedStreamStatus = {
          ...userState.managedStreamStatus,
          status: 'error',
          message: error.message,
          timestamp: new Date()
        };
      }
      throw error;
    }
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session started: ${sessionId} for user ${userId}`);

    // Get the user's persistent RTMP URL or use default
    const persistentSettings = this.persistentUserSettings.get(userId);
    const userRtmpUrl = persistentSettings?.rtmpUrl || this.defaultRtmpUrl;

    // Initialize state for this user with their persistent RTMP URL
    const userState: UserStreamState = {
      rtmpUrl: userRtmpUrl,
      streamStatus: this.getInitialStreamStatus(),
      managedStreamStatus: null,
      session: session,
    };
    this.activeUserStates.set(userId, userState);

    console.log(`User ${userId} restored with RTMP URL: ${userRtmpUrl}`);
    
    // Subscribe to managed stream status updates
    //session.subscribe(StreamType.MANAGED_STREAM_STATUS);
    //session.subscribe(StreamType.RTMP_STREAM_STATUS);
    
    // Set up managed stream status handler EARLY to catch all updates
    const managedStreamCleanup = session.camera.onManagedStreamStatus((status: ManagedStreamStatus) => {
        console.log(`Managed stream status update for user ${userId}: ${status.status}`, status);
        const currentUserState = this.activeUserStates.get(userId);
        if (currentUserState) {
            currentUserState.managedStreamStatus = { ...status, timestamp: new Date() };
            console.log(`Updated managed stream status in state for user ${userId}:`, currentUserState.managedStreamStatus);
            // Propagate essential parts of status for UI update to glasses
            switch (status.status) {
                case 'initializing':
                    session.layouts.showTextWall('Managed stream is initializing...');
                    break;
                case 'active':
                    session.layouts.showTextWall('Managed stream is live! URLs ready.');
                    break;
                case 'error':
                    session.layouts.showTextWall(`Managed stream error: ${status.message}`);
                    break;
                case 'stopped':
                    session.layouts.showTextWall('Managed stream has stopped');
                    // Clear the managed stream status when stopped
                    currentUserState.managedStreamStatus = null;
                    break;
            }
        } else {
            console.warn("Received managed stream status for a user with no active state object:", userId);
        }
    });
    
    session.layouts.showTextWall("RTMP Streaming Example Ready!");
    // ... (rest of initial photo logic if any, currently commented out)

    const cleanup = [
      managedStreamCleanup,
      session.events.onConnected(async (data) => {
        console.log(`Glass connected for user ${userId}! Starting RTMP stream check...`);
        session.layouts.showTextWall('Connected! Starting RTMP stream...');
        try {
          await session.camera.startStream({
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
        const photoUrl = await session.camera.requestPhoto({ saveToGallery: true });
      }),
      session.events.onPhoneNotifications((data) => { }),
      session.events.onGlassesBattery((data) => { }),
      session.events.onError((error) => { console.error('Session Error for user '+ userId + ':', error); }),
      session.camera.onStreamStatus((status: RtmpStreamStatus) => {
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
      session.events.onDisconnected((data: string | { message: string; code: number; reason: string; wasClean: boolean; permanent?: boolean }) => {
        const reason = typeof data === 'string' ? data : data.reason;
        console.log(`Session ${sessionId} for user ${userId} disconnected. Reason: ${reason}`);

        // Only remove the active session state, preserve persistent settings
        this.activeUserStates.delete(userId);
        console.log(`Active session for ${userId} removed. Active sessions: ${this.activeUserStates.size}. Persistent settings preserved.`);
      })
    ];

    cleanup.forEach(handler => {
      if (handler && typeof handler === 'function') {
        this.addCleanupHandler(handler);
      }
    });
  }
}

const app = new SimpleRtmpStreamingApp();
app.start().catch(console.error);

export { SimpleRtmpStreamingApp };