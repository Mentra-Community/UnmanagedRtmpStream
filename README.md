# AugmentOS-Cloud-Example-App

### Install AugmentOS on your phone

AugmentOS install links: [AugmentOS.org/install](https://AugmentOS.org/install)

### (Easiest way to get started) Set up ngrok

1. `brew install ngrok`

2. Make an ngrok account

3. [Use ngrok to make a static address/URL](https://dashboard.ngrok.com/)

### Register your APP with AugmentOS

<img width="181" alt="image" src="https://github.com/user-attachments/assets/36192c2b-e1ba-423b-90de-47ff8cd91318" />

1. Navigate to [console.AugmentOS.org](https://console.AugmentOS.org/)

2. Click "Sign In", and log in with the same account you're using for AugmentOS

3. Click "Create App"

4. Set a unique package name like `com.yourName.yourAppName`

5. For "Public URL", enter your Ngrok's static URL

### Get your APP running!

1. [Install bun](https://bun.sh/docs/installation)

2. Clone this repo: `git clone git@github.com:AugmentOS-Community/AugmentOS-Cloud-Example-App.git`

3. cd into your repo, then type `bun install`

4. Edit your `index.ts` to match the app you registered at [console.AugmentOS.org](https://console.AugmentOS.org/)
    
```typescript
const app = new ExampleAugmentOSApp({
  packageName: 'com.yourName.yourAppName', // The packageName you specified on console.AugmentOS.org
  apiKey: 'your_api_key', // Get this from console.AugmentOS.org
  port: 3000 // The port you're hosting the server on
});
```

7. Run your app with `bun run index.ts`

8. To expose your app to the internet (and thus AugmentOS) with ngrok, run: `ngrok http --url=<YOUR_NGROK_URL_HERE> 3000`
    * `3000` is the port. It must match what is in the app config. If you entered `port: 8080`, use `8080` for ngrok instead.
