require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for Copilot data (in production, use a database)
const copilotData = {};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'copilot-metrics-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// GitHub OAuth Configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3000/auth/callback';

// Routes

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initiate GitHub OAuth
app.get('/auth/github', (req, res) => {
    const scopes = 'user:email read:user read:org repo'; // Added repo scope for private repo access
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${encodeURIComponent(scopes)}`;
    res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code: code,
            redirect_uri: CALLBACK_URL
        }, {
            headers: { 'Accept': 'application/json' }
        });

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            return res.redirect('/?error=no_token');
        }

        // Get user info
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `token ${accessToken}` }
        });

        // Store in session
        req.session.accessToken = accessToken;
        req.session.user = userResponse.data;

        res.redirect('/dashboard.html');
    } catch (error) {
        console.error('OAuth error:', error.message);
        res.redirect('/?error=auth_failed');
    }
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
    if (req.session.user && req.session.accessToken) {
        res.json({ 
            authenticated: true, 
            user: req.session.user 
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Get user profile
app.get('/api/user', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const response = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `token ${req.session.accessToken}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Get user's repositories (for activity metrics)
app.get('/api/repos', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const response = await axios.get('https://api.github.com/user/repos?sort=updated&per_page=20', {
            headers: { 'Authorization': `token ${req.session.accessToken}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch repos' });
    }
});

// Get user's commit activity (as a proxy for Copilot usage)
app.get('/api/activity', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Get user repositories
        const reposResponse = await axios.get(`https://api.github.com/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member`, {
            headers: { 'Authorization': `token ${req.session.accessToken}` }
        });
        const allRepos = reposResponse.data;
        
        console.log(`Found ${allRepos.length} repositories for user ${req.session.user.login}`);

        let totalCommits = 0;
        let totalLinesAdded = 0;
        let totalLineDeleted = 0;
        let pushEvents = 0;

        // Fetch commit data from each repository
        for (const repo of allRepos) {
            try {
                // Get commits without author filter first to debug
                const commitsResponse = await axios.get(`https://api.github.com/repos/${repo.full_name}/commits?per_page=100`, {
                    headers: { 'Authorization': `token ${req.session.accessToken}` }
                });
                
                // Filter by current user's login or email (check multiple sources)
                const userCommits = commitsResponse.data.filter(commit => 
                    commit.author?.login === req.session.user.login || 
                    commit.commit?.author?.email === req.session.user.email ||
                    commit.commit?.committer?.email === req.session.user.email ||
                    commit.commit?.author?.name?.toLowerCase().includes(req.session.user.login?.toLowerCase())
                );
                
                if (userCommits.length > 0) {
                    console.log(`${repo.full_name}: Found ${userCommits.length} commits`);
                    totalCommits += userCommits.length;

                    // Get detailed stats for each of your commits (limit to avoid rate limits)
                    for (const commit of userCommits.slice(0, 30)) {
                        try {
                            const commitDetail = await axios.get(`https://api.github.com/repos/${repo.full_name}/commits/${commit.sha}`, {
                                headers: { 'Authorization': `token ${req.session.accessToken}` }
                            });
                            totalLinesAdded += commitDetail.data.stats?.additions || 0;
                            totalLineDeleted += commitDetail.data.stats?.deletions || 0;
                        } catch (e) {
                            // Skip individual commit if it fails
                            console.log(`Error fetching commit detail: ${e.message}`);
                        }
                    }
                    pushEvents += 1; // Count repo as 1 push event if user has commits
                }
            } catch (error) {
                // Skip repo if commit fetch fails
                console.log(`Skipping ${repo.full_name}: ${error.response?.status} - ${error.message}`);
            }
        }
        
        console.log(`Total commits found: ${totalCommits}, total lines added: ${totalLinesAdded}`);

        // Estimate time saved (assume 30% of code is Copilot-assisted)
        const copilotAssistanceRate = 0.30;
        const timePerLine = 0.5; // minutes per line without Copilot
        const copilotSpeedup = 0.55; // Copilot makes coding 55% faster
        const timeSaved = Math.round(totalLinesAdded * copilotAssistanceRate * timePerLine * copilotSpeedup);

        res.json({
            totalCommits,
            estimatedLinesAdded: totalLinesAdded,
            timeSavedMinutes: timeSaved,
            timeSavedHours: (timeSaved / 60).toFixed(1),
            pushEvents,
            recentRepos: allRepos.slice(0, 10).map(r => ({
                name: r.name,
                language: r.language,
                updated: r.pushed_at
            })),
            lastActivity: allRepos[0]?.pushed_at || null
        });
    } catch (error) {
        console.error('Activity fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch activity data' });
    }
});

// Get Copilot usage for organization (if user has access)
app.get('/api/copilot/org/:org', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const { org } = req.params;
        const response = await axios.get(`https://api.github.com/orgs/${org}/copilot/billing`, {
            headers: { 
                'Authorization': `token ${req.session.accessToken}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        res.json(response.data);
    } catch (error) {
        if (error.response?.status === 404) {
            res.status(404).json({ error: 'Organization not found or no Copilot access' });
        } else if (error.response?.status === 403) {
            res.status(403).json({ error: 'No permission to access Copilot data for this organization' });
        } else {
            res.status(500).json({ error: 'Failed to fetch Copilot data' });
        }
    }
});

// Get user's organizations
app.get('/api/orgs', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const response = await axios.get('https://api.github.com/user/orgs', {
            headers: { 'Authorization': `token ${req.session.accessToken}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});

// Helper: fetch all paginated pages for a given GitHub API URL
async function fetchAllPages(url, headers = {}) {
    const perPage = 100;
    let page = 1;
    let results = [];

    while (true) {
        const resp = await axios.get(`${url}${url.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`, { headers });
        if (!Array.isArray(resp.data)) break;
        results = results.concat(resp.data);
        if (resp.data.length < perPage) break;
        page += 1;
        // small delay to avoid bursting rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    return results;
}

// Helper: fetch additional details for a single repo (limited depth)
async function fetchRepoDetails(repo, token) {
    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
    const details = {
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        fork: repo.fork,
        html_url: repo.html_url,
        description: repo.description,
        language: repo.language,
        topics: [],
        languages: {},
        branches: [],
        contributors: [],
        pulls: [],
        commits: [],
        issues: []
    };

    try {
        const [langsResp, topicsResp] = await Promise.all([
            axios.get(`https://api.github.com/repos/${repo.full_name}/languages`, { headers }).catch(() => ({ data: {} })),
            axios.get(`https://api.github.com/repos/${repo.full_name}/topics`, { headers }).catch(() => ({ data: { names: [] } }))
        ]);
        details.languages = langsResp.data || {};
        details.topics = topicsResp.data.names || [];

        // branches
        const branchesResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/branches?per_page=100`, { headers }).catch(() => ({ data: [] }));
        details.branches = branchesResp.data.map(b => ({ name: b.name, protected: b.protected }));

        // contributors (first page)
        const contributorsResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/contributors?per_page=100`, { headers }).catch(() => ({ data: [] }));
        details.contributors = contributorsResp.data.map(c => ({ login: c.login, contributions: c.contributions }));

        // pulls (open + closed recent)
        const pullsResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/pulls?state=all&per_page=50`, { headers }).catch(() => ({ data: [] }));
        details.pulls = pullsResp.data.map(p => ({ number: p.number, state: p.state, merged_at: p.merged_at, user: p.user?.login }));

        // commits (limit to recent 100)
        const commitsResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/commits?per_page=100`, { headers }).catch(() => ({ data: [] }));
        details.commits = commitsResp.data.map(c => ({ sha: c.sha, author: c.author?.login, commit: c.commit }));

        // issues (first 100)
        const issuesResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/issues?state=all&per_page=100`, { headers }).catch(() => ({ data: [] }));
        // filter out PRs which are returned in issues endpoint
        details.issues = issuesResp.data.filter(i => !i.pull_request).map(i => ({ number: i.number, state: i.state, title: i.title, user: i.user?.login }));
    } catch (e) {
        // swallow repo-level errors to continue overall fetch
        console.log(`Repo details error for ${repo.full_name}: ${e.message}`);
    }

    return details;
}

// Get full GitHub data (as much as practical)
app.get('/api/full', async (req, res) => {
    if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });

    const token = req.session.accessToken;
    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };

    try {
        // Parallel top-level requests
        const userPromise = axios.get('https://api.github.com/user', { headers }).catch(() => null);
        const orgsPromise = axios.get('https://api.github.com/user/orgs', { headers }).catch(() => ({ data: [] }));
        const gistsPromise = axios.get('https://api.github.com/gists', { headers }).catch(() => ({ data: [] }));
        const starredPromise = axios.get('https://api.github.com/user/starred?per_page=100', { headers }).catch(() => ({ data: [] }));
        const followersPromise = axios.get('https://api.github.com/user/followers?per_page=100', { headers }).catch(() => ({ data: [] }));
        const followingPromise = axios.get('https://api.github.com/user/following?per_page=100', { headers }).catch(() => ({ data: [] }));

        const [userResp, orgsResp, gistsResp, starredResp, followersResp, followingResp] = await Promise.all([
            userPromise, orgsPromise, gistsPromise, starredPromise, followersPromise, followingPromise
        ]);

        const user = userResp?.data || req.session.user || null;

        // fetch all repos (can be many) - use helper
        const allRepos = await fetchAllPages('https://api.github.com/user/repos', headers);

        // fetch events (recent) up to 300
        const events = await fetchAllPages(`https://api.github.com/users/${user.login}/events`, headers).catch(() => []);

        // fetch repo-level details in batches to avoid rate limits
        const repoDetails = [];
        const batchSize = 5;
        for (let i = 0; i < allRepos.length; i += batchSize) {
            const batch = allRepos.slice(i, i + batchSize);
            const promises = batch.map(r => fetchRepoDetails(r, token));
            // wait for batch to complete
            const results = await Promise.all(promises);
            repoDetails.push(...results);
            // small pause between batches
            await new Promise(r => setTimeout(r, 200));
        }

        res.json({
            user,
            orgs: orgsResp.data || [],
            gists: gistsResp.data || [],
            starred: starredResp.data || [],
            followers: followersResp.data || [],
            following: followingResp.data || [],
            repos: allRepos,
            repoDetails,
            events
        });
    } catch (error) {
        console.error('Full data fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch full GitHub data', details: error.message });
    }
});

// Save Copilot usage data
app.post('/api/copilot/usage', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { completionsAccepted, completionsRejected, linesGenerated } = req.body;
    const userId = req.session.user.login;

    copilotData[userId] = {
        completionsAccepted: parseInt(completionsAccepted) || 0,
        completionsRejected: parseInt(completionsRejected) || 0,
        linesGenerated: parseInt(linesGenerated) || 0,
        lastUpdated: new Date().toISOString()
    };

    res.json(copilotData[userId]);
});

// Get Copilot usage data
app.get('/api/copilot/usage', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = req.session.user.login;
    const data = copilotData[userId] || {
        completionsAccepted: 0,
        completionsRejected: 0,
        linesGenerated: 0,
        lastUpdated: null
    };

    const total = data.completionsAccepted + data.completionsRejected;
    const acceptanceRate = total > 0 ? ((data.completionsAccepted / total) * 100).toFixed(1) : 0;

    res.json({
        ...data,
        acceptanceRate
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 Copilot Metrics Dashboard ready!`);
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        console.warn('⚠️  Warning: GitHub OAuth credentials not configured. Check your .env file.');
    }
});
