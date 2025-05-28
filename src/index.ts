import { TpaServer, TpaSession, ViewType } from '@augmentos/sdk';


const PACKAGE_NAME = process.env.PACKAGE_NAME || 'org.nicolo.exampleapp';
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY || 'your_api_key';
const PORT = parseInt(process.env.PORT || '3001');

class ExampleAugmentOSApp extends TpaServer {

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY,
      port: PORT,
    });
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {

    // Show welcome message
    session.layouts.showTextWall("Example Captions App Ready!");

    // Handle real-time transcription
    const cleanup = [
      session.events.onTranscription((data) => {
        session.layouts.showTextWall(data.text, {
          view: ViewType.MAIN,
          durationMs: data.isFinal ? 3000 : undefined
        });
      }),

      session.events.onPhoneNotifications((data) => {}),

      session.events.onGlassesBattery((data) => {
        console.log('Glasses battery:', data);
      }),

      session.events.onError((error) => {
        console.log('Error:', error);
        console.error('Error:', error);
      })
    ];

    // Add cleanup handlers
    cleanup.forEach(eventHandler => this.addCleanupHandler(eventHandler));
  }
}

// Start the server
// DEV CONSOLE URL: https://console.AugmentOS.org/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ExampleAugmentOSApp();

app.start().catch(console.error);