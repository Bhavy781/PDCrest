# Making Super work on your own website

The `server` folder is a small backend. It holds your API keys safely on Render's servers (never in the website files) and passes Super's messages to Gemini and its voice to ElevenLabs.

## 1. Get NEW keys
The keys you pasted into the chat earlier are visible there, so treat them as leaked. Revoke them and create new ones:
- Gemini: aistudio.google.com, then Get API key.
- ElevenLabs: elevenlabs.io, then your profile, then API Keys.
Never paste keys into chat, GitHub, or the website files.

## 2. Put the server folder on GitHub
In your PDCrest repository, click Add file, then Upload files, and drag in the whole `server` folder (server.js, package.json, env.example, SERVER-GUIDE.md). Commit. The repository must be public if Render can't see your private repositories.

## 3. Create the web service on Render
1. In Render click New, then Web Service.
2. Choose your PDCrest repository (or the Public Git Repository tab, then paste the repository address).
3. Set Root Directory to `server`.
4. Runtime: Node. Build Command: `npm install`. Start Command: `node server.js`. Plan: Free.
5. Under Environment, add these variables with your NEW keys:
   - `GEMINI_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `ALLOWED_ORIGIN` (your website address with no slash at the end, for example `https://bhavy781.github.io`)
6. Click Create Web Service. When it shows Live, copy its address, such as `https://pdcrest-api.onrender.com`.

## 4. Connect the website
In `index.html` find `window.PDC_API=''` near the top and put the server address between the quotes:
`window.PDC_API='https://pdcrest-api.onrender.com';`
Commit the change. After the site redeploys, Super answers through Gemini, and each of its replies has a Listen button that uses ElevenLabs.

## Things to know
- Free Render web services go to sleep when unused, so the first message after a quiet spell can take about a minute.
- The server allows 20 requests a minute per visitor to protect your keys and bill.
- If Gemini's model name changes, set `GEMINI_MODEL` in Render's Environment.
- ElevenLabs free accounts limit which voices the API can use. If voice fails, set `ELEVENLABS_VOICE_ID` to a voice from your own account.
