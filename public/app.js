// Check authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const authResponse = await fetch('/api/auth/status');
        const authData = await authResponse.json();

        if (!authData.authenticated) {
            window.location.href = '/';
            return;
        }

        // Set user info
        document.getElementById('userAvatar').src = authData.user.avatar_url;
        document.getElementById('userName').textContent = authData.user.login;

        // Load dashboard data
        await loadDashboardData();
        await loadOrganizations();
        await loadCopilotUsage();

        // Full data button
        const loadFullBtn = document.getElementById('loadFullData');
        if (loadFullBtn) loadFullBtn.addEventListener('click', loadFullData);

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to load dashboard data');
    }
});

async function loadDashboardData() {
    try {
        const response = await fetch('/api/activity');
        const data = await response.json();

        if (response.ok) {
            // Update metrics
            document.getElementById('timeSaved').textContent = data.timeSavedHours;
            document.getElementById('totalCommits').textContent = data.totalCommits;
            document.getElementById('linesOfCode').textContent = formatNumber(data.estimatedLinesAdded);
            document.getElementById('pushEvents').textContent = data.pushEvents;

            // Populate repos list
            const reposList = document.getElementById('reposList');
            if (data.recentRepos && data.recentRepos.length > 0) {
                reposList.innerHTML = data.recentRepos.map(repo => `
                    <div class="repo-item">
                        <div class="repo-name">
                            <span class="repo-icon">📁</span>
                            ${repo.name}
                        </div>
                        <div class="repo-meta">
                            <span class="language-badge">${repo.language || 'Unknown'}</span>
                            <span class="updated">Updated ${formatDate(repo.updated)}</span>
                        </div>
                    </div>
                `).join('');
            } else {
                reposList.innerHTML = '<p class="no-data">No recent repositories found</p>';
            }

            // Show dashboard content
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboardContent').style.display = 'block';
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading activity:', error);
        document.getElementById('loading').innerHTML = `
            <p class="error">Failed to load metrics. Please try again.</p>
            <a href="/" class="btn btn-primary">Go Back</a>
        `;
    }
}

async function loadOrganizations() {
    try {
        const response = await fetch('/api/orgs');
        const orgs = await response.json();

        const select = document.getElementById('orgSelect');
        orgs.forEach(org => {
            const option = document.createElement('option');
            option.value = org.login;
            option.textContent = org.login;
            select.appendChild(option);
        });

        // Add event listener for loading org data
        document.getElementById('loadOrgData').addEventListener('click', loadOrgCopilotData);

    } catch (error) {
        console.error('Error loading organizations:', error);
    }
}

async function loadOrgCopilotData() {
    const orgSelect = document.getElementById('orgSelect');
    const orgName = orgSelect.value;

    if (!orgName) {
        alert('Please select an organization');
        return;
    }

    const orgDataDiv = document.getElementById('orgData');
    orgDataDiv.style.display = 'block';
    orgDataDiv.innerHTML = '<div class="spinner"></div><p>Loading organization data...</p>';

    try {
        const response = await fetch(`/api/copilot/org/${orgName}`);
        const data = await response.json();

        if (response.ok) {
            orgDataDiv.innerHTML = `
                <div class="org-metrics">
                    <div class="org-metric">
                        <span class="org-metric-value">${data.seat_breakdown?.total || 'N/A'}</span>
                        <span class="org-metric-label">Total Seats</span>
                    </div>
                    <div class="org-metric">
                        <span class="org-metric-value">${data.seat_breakdown?.active_this_cycle || 'N/A'}</span>
                        <span class="org-metric-label">Active This Cycle</span>
                    </div>
                    <div class="org-metric">
                        <span class="org-metric-value">${data.seat_management_setting || 'N/A'}</span>
                        <span class="org-metric-label">Seat Management</span>
                    </div>
                </div>
            `;
        } else {
            orgDataDiv.innerHTML = `
                <div class="error-box">
                    <p>⚠️ ${data.error}</p>
                    <p class="hint">You may need organization admin access to view Copilot billing data.</p>
                </div>
            `;
        }
    } catch (error) {
        orgDataDiv.innerHTML = `
            <div class="error-box">
                <p>Failed to load organization data</p>
            </div>
        `;
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

function showError(message) {
    const loading = document.getElementById('loading');
    loading.innerHTML = `
        <p class="error">${message}</p>
        <a href="/" class="btn btn-primary">Go Back</a>
    `;
}

async function loadCopilotUsage() {
    try {
        const response = await fetch('/api/copilot/usage');
        const data = await response.json();

        // Display Copilot stats
        document.getElementById('acceptedCount').textContent = data.completionsAccepted;
        document.getElementById('rejectedCount').textContent = data.completionsRejected;
        document.getElementById('acceptanceRate').textContent = data.acceptanceRate + '%';
        document.getElementById('copilotLineCount').textContent = formatNumber(data.linesGenerated);

        // Always show the stats grid
        document.getElementById('copilotStats').style.display = 'grid';

        // Add save button listener
        document.getElementById('saveCopilotData').addEventListener('click', saveCopilotData);
    } catch (error) {
        console.error('Error loading Copilot usage:', error);
    }
}

async function saveCopilotData() {
    const completionsAccepted = document.getElementById('copilotCompletions').value;
    const completionsRejected = document.getElementById('copilotRejections').value;
    const linesGenerated = document.getElementById('copilotLinesGenerated').value;

    if (!completionsAccepted && !completionsRejected && !linesGenerated) {
        alert('Please enter at least one value');
        return;
    }

    try {
        const response = await fetch('/api/copilot/usage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                completionsAccepted,
                completionsRejected,
                linesGenerated
            })
        });

        if (response.ok) {
            // Reload Copilot data
            await loadCopilotUsage();
            // Clear inputs
            document.getElementById('copilotCompletions').value = '';
            document.getElementById('copilotRejections').value = '';
            document.getElementById('copilotLinesGenerated').value = '';
            alert('Copilot data saved!');
        } else {
            alert('Failed to save data');
        }
    } catch (error) {
        console.error('Error saving Copilot data:', error);
        alert('Error saving data');
    }
}

// Load full GitHub data and show summary + raw JSON
async function loadFullData() {
    const status = document.getElementById('fullDataStatus');
    const viewer = document.getElementById('fullDataViewer');
    const summary = document.getElementById('fullDataSummary');
    const raw = document.getElementById('fullDataRaw');

    try {
        status.textContent = 'Fetching... this can take a while';
        const resp = await fetch('/api/full');
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            status.textContent = `Error: ${err.error || resp.status}`;
            return;
        }

        const data = await resp.json();
        status.textContent = `Loaded: ${data.repos?.length || 0} repos, ${data.repoDetails?.length || 0} detailed repos`;
        viewer.style.display = 'block';

        // Build short summary
        const lines = [];
        lines.push(`<strong>User:</strong> ${data.user?.login || 'N/A'}`);
        lines.push(`<strong>Orgs:</strong> ${data.orgs?.length || 0}`);
        lines.push(`<strong>Gists:</strong> ${data.gists?.length || 0}`);
        lines.push(`<strong>Followers:</strong> ${data.followers?.length || 0}`);
        lines.push(`<strong>Following:</strong> ${data.following?.length || 0}`);
        lines.push(`<strong>Repos:</strong> ${data.repos?.length || 0}`);
        lines.push(`<strong>Events (recent):</strong> ${data.events?.length || 0}`);
        lines.push(`<strong>Repo details fetched:</strong> ${data.repoDetails?.length || 0}`);

        // Top languages across repos (simple tally)
        const langCounts = {};
        (data.repos || []).forEach(r => { if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1; });
        const topLang = Object.entries(langCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([l,c])=>`${l}(${c})`).join(', ');
        lines.push(`<strong>Top languages:</strong> ${topLang || 'N/A'}`);

        summary.innerHTML = lines.join('<br/>');
        raw.textContent = JSON.stringify(data, null, 2);

        // toggle raw
        document.getElementById('toggleRaw').onclick = () => { raw.style.display = raw.style.display === 'none' ? 'block' : 'none'; };
    } catch (e) {
        status.textContent = `Failed: ${e.message}`;
    }
}
