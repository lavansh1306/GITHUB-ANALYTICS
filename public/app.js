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
