# Copilot Metrics Dashboard 🚀

A web application that lets users authenticate with GitHub and view their estimated Copilot productivity metrics.

![Dashboard Preview](https://img.shields.io/badge/Status-Ready-green)

## Features

- 🔐 **GitHub OAuth Authentication** - Secure login with GitHub
- 📊 **Productivity Metrics** - View estimated time saved, commits, and lines of code
- 🏢 **Organization Support** - View Copilot data for organizations (admin access required)
- 📱 **Responsive Design** - Works on desktop and mobile

## Setup Instructions

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the details:
   - **Application name**: Copilot Metrics Dashboard
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/auth/callback`
4. Click **"Register application"**
5. Copy your **Client ID**
6. Generate and copy a **Client Secret**

### 2. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   SESSION_SECRET=any_random_string_here
   PORT=3000
   CALLBACK_URL=http://localhost:3000/auth/callback
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Application

```bash
npm start
```

The app will be available at **http://localhost:3000**

## Usage

1. Open http://localhost:3000 in your browser
2. Click **"Sign in with GitHub"**
3. Authorize the application
4. View your productivity metrics!

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /auth/github` | Initiates GitHub OAuth flow |
| `GET /auth/callback` | OAuth callback handler |
| `GET /auth/logout` | Logs out the user |
| `GET /api/auth/status` | Check authentication status |
| `GET /api/user` | Get authenticated user info |
| `GET /api/activity` | Get user activity and metrics |
| `GET /api/orgs` | Get user's organizations |
| `GET /api/copilot/org/:org` | Get Copilot data for an organization |

## Metrics Calculation

The app estimates productivity metrics based on:

- **Time Saved**: Calculated assuming 30% of code is Copilot-assisted with 55% speed improvement
- **Lines of Code**: Estimated based on commit activity
- **Commits & Push Events**: Retrieved from GitHub Events API

> ⚠️ **Note**: These are estimated metrics. Actual Copilot usage data requires GitHub Enterprise with Copilot Business/Enterprise.

## Tech Stack

- **Backend**: Node.js, Express
- **Authentication**: GitHub OAuth 2.0
- **Frontend**: HTML, CSS, JavaScript
- **APIs**: GitHub REST API

## Project Structure

```
copilot-metrics-app/
├── server.js           # Express server with OAuth
├── package.json        # Dependencies
├── .env.example        # Environment template
├── README.md           # This file
└── public/
    ├── index.html      # Login page
    ├── dashboard.html  # Metrics dashboard
    ├── styles.css      # Styling
    └── app.js          # Frontend JavaScript
```

## Production Deployment

For production, update:

1. `CALLBACK_URL` to your production URL
2. Set `cookie.secure: true` in session config
3. Use environment variables for secrets
4. Consider using a database for session storage

## License

MIT
# GITHUB-ANALYTICS
