# Localhost Testing with Ngrok

> **🎉 Live Demo Available!**
> The application is securely hosted and fully accessible online. You can skip the local setup and test the live version directly at:
> **👉 [https://examproctorclient.onrender.com](https://examproctorclient.onrender.com)**

---

To test the application on local network devices securely (since some Web APIs like camera and microphone access require a secure `HTTPS` context), you can use [ngrok](https://ngrok.com/) to expose both the client and the signaling server over HTTPS.

## 1. Prerequisites
- Setup Supabase and ensure `.env` files are configured for both `client/` and `signaling-server/`.
  *(Although you can find `.env` files provided by us for testing purposes, they are available for a limited time and will be removed soon.)*
- **Testing for Hackathon Organizers**: To test the platform, you can either:
  1. Create a new Proctor (Admin) account and a Student account through the application.
  2. Or, log in using our pre-existing testing accounts:
     - **Proctor Account:** `p@gmail.com` | Password: `123456`
     - **Student Account:** `s@gmail.com` | Password: `123456`
- Install [ngrok](https://ngrok.com/download) on your machine.
- Authenticate your ngrok account using your auth token:
  ```bash
  ngrok config add-authtoken <YOUR_TOKEN>
  ```

## 2. Start Local Servers
Open two terminal windows and start your development servers:

**Terminal 1 (Signaling Server)**
```bash
cd signaling-server
npm install
npm run dev
# Normally runs on localhost:3001
```

**Terminal 2 (Client)**
```bash
cd client
npm install
npm run dev
# Normally runs on localhost:5173
```

## 3. Expose the Signaling Server
Open a third terminal and create an HTTPS tunnel for the background port (3001):
```bash
ngrok http 3001
```
Ngrok will generate a secure HTTPS URL (e.g., `https://<random-id>.ngrok-free.app`).

**Update Client Configuration:**
In `client/.env`, update the signaling server URL to use the secure ngrok URL instead of localhost:
```env
VITE_SIGNALING_SERVER_URL=https://<random-id>.ngrok-free.app
```
*Note: Make sure to remove the trailing slash.*

**Restart your client development server** (`Terminal 2`) so the new environment variable is loaded.

## 4. Expose the Client App
Open a fourth terminal and expose the client dev server port (typically 5173):
```bash
ngrok http 5173
```
You will get another secure HTTPS URL for your frontend (e.g., `https://<another-id>.ngrok-free.app`).

## 5. Test on Devices
You can now open this frontend HTTPS URL on your phone or any other remote device. Because the site is served over an official HTTPS connection, the device browser will allow access to device features like the camera (which is required for the proctoring process).

## 6. Folder Structure

For hackathon organizers and contributors, here is an overview of the project's folder structure:

```text
examProctorSoftware/
├── client/                 # Frontend React application (Vite)
│   ├── public/             
│   ├── src/                
│   │   ├── assets/         # Images, fonts, etc.
│   │   ├── components/     # Reusable React components
│   │   ├── lib/            # Utility libraries and helpers
│   │   ├── pages/          # Application routes/pages
│   │   ├── App.tsx         # Main application component
│   │   ├── index.css       # Global styles
│   │   └── main.tsx        # Application entry point
│   ├── package.json        # Frontend dependencies
│   └── vite.config.ts      # Vite configuration
├── signaling-server/       # WebRTC signaling backend (WebHook) (Node.js)
│   ├── src/                
│   │   ├── handlers/       # Socket.io event handlers
│   │   ├── lib/            # Server utilities
│   │   ├── services/       # Core business logic services
│   │   ├── socket.js       # Socket.io setup
│   │   └── store.js        # In-memory state management
│   ├── index.js            # Main server entry point
│   └── package.json        # Backend dependencies
└── supabase_schema.sql     # Database schema for Supabase
```
