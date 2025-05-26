
document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const config = {
        blurtApi: 'https://api.blurt.blog',
        corsProxy: 'https://corsproxy.io/?',
        postsPerPage: 10,
        defaultAvatar: 'https://via.placeholder.com/150',
        smallAvatar: 'https://via.placeholder.com/40'
    };

    // State management
    const state = {
        currentFilter: 'created',
        currentTag: '',
        isLoading: false,
        startAuthor: '',
        startPermlink: '',
        hasMorePosts: true,
        currentUsername: ''
    };

    // DOM Elements
    const elements = {
        postsContainer: document.getElementById('postsContainer'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        trendingTags: document.getElementById('trendingTags'),
        searchForm: document.getElementById('searchForm'),
        searchInput: document.getElementById('searchInput'),
        usernameSearchInput: document.getElementById('usernameSearchInput'),
        usernameSearchButton: document.getElementById('usernameSearchButton'),
        userProfileModal: new bootstrap.Modal(document.getElementById('userProfileModal')),
        userProfileContent: document.getElementById('userProfileContent'),
        userProfileLoading: document.getElementById('userProfileLoading'),
        userProfileModalTitle: document.getElementById('userProfileModalTitle'),
        viewProfileOnBlurt: document.getElementById('viewProfileOnBlurt')
    };

    // Initialize the application
    function init() {
        fetchTrendingTags();
        fetchPosts();
        setupEventListeners();
    }

    // Set up event listeners
    function setupEventListeners() {
        // Filter posts by new/trending/hot
        document.querySelectorAll('[data-filter]').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                state.currentFilter = this.getAttribute('data-filter');
                state.currentTag = '';
                state.startAuthor = '';
                state.startPermlink = '';
                state.hasMorePosts = true;
                elements.postsContainer.innerHTML = '';
                fetchPosts();
            });
        });

        // Search form (for tags)
        elements.searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const searchTerm = elements.searchInput.value.trim();
            if (searchTerm) {
                state.currentTag = searchTerm;
                state.currentFilter = 'created';
                state.startAuthor = '';
                state.startPermlink = '';
                state.hasMorePosts = true;
                elements.postsContainer.innerHTML = '';
                fetchPosts();
            }
        });

        // Search user profile
        elements.usernameSearchButton.addEventListener('click', searchUser);
        elements.usernameSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchUser();
        });

        // Infinite scroll
        window.addEventListener('scroll', throttle(function() {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                if (!state.isLoading && state.hasMorePosts) {
                    fetchPosts();
                }
            }
        }, 200));
    }

    // Throttle function for scroll events
    function throttle(func, limit) {
        let lastFunc;
        let lastRan;
        return function() {
            const context = this;
            const args = arguments;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function() {
                    if ((Date.now() - lastRan) >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        };
    }

    // Fetch posts from Blurt API
    async function fetchPosts() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        elements.loadingSpinner.style.display = 'block';
        
        try {
            let method, params;
            
            if (state.currentTag) {
                method = 'get_discussions_by_created';
                params = [state.currentTag, {
                    limit: config.postsPerPage,
                    start_author: state.startAuthor,
                    start_permlink: state.startPermlink
                }];
            } else {
                method = `get_discussions_by_${state.currentFilter}`;
                params = [{
                    limit: config.postsPerPage,
                    start_author: state.startAuthor,
                    start_permlink: state.startPermlink
                }];
            }
            
            const response = await callBlurtApi(method, params);
            
            if (!response.result || response.result.length === 0) {
                state.hasMorePosts = false;
                return;
            }
            
            response.result.forEach(post => {
                const postElement = createPostCard(post);
                elements.postsContainer.appendChild(postElement);
            });
            
            // Update pagination markers
            const lastPost = response.result[response.result.length - 1];
            state.startAuthor = lastPost.author;
            state.startPermlink = lastPost.permlink;
            
        } catch (error) {
            console.error('Error fetching posts:', error);
            showErrorToast('Failed to load posts. Please try again later.');
        } finally {
            state.isLoading = false;
            elements.loadingSpinner.style.display = 'none';
        }
    }

    // Fetch trending tags
    async function fetchTrendingTags() {
        try {
            const response = await callBlurtApi('get_trending_tags', ['', 20]);
            
            elements.trendingTags.innerHTML = '';
            
            response.result.forEach(tag => {
                const tagElement = document.createElement('a');
                tagElement.href = '#';
                tagElement.className = 'trending-tag';
                tagElement.textContent = `#${tag.name}`;
                tagElement.addEventListener('click', function(e) {
                    e.preventDefault();
                    state.currentTag = tag.name;
                    state.currentFilter = 'created';
                    state.startAuthor = '';
                    state.startPermlink = '';
                    state.hasMorePosts = true;
                    elements.postsContainer.innerHTML = '';
                    elements.searchInput.value = tag.name;
                    fetchPosts();
                });
                elements.trendingTags.appendChild(tagElement);
            });
        } catch (error) {
            console.error('Error fetching trending tags:', error);
        }
    }

    // Search user profile
    function searchUser() {
        const username = elements.usernameSearchInput.value.trim();
        if (username) {
            state.currentUsername = username;
            fetchUserProfile(username);
        }
    }

    // Fetch user profile data
    async function fetchUserProfile(username) {
        elements.userProfileLoading.style.display = 'block';
        elements.userProfileContent.style.display = 'none';
        elements.userProfileContent.innerHTML = '';
        elements.viewProfileOnBlurt.href = `https://blurt.blog/@${username}`;
        elements.userProfileModalTitle.textContent = `@${username}`;
        
        elements.userProfileModal.show();
        
        try {
            // Fetch account data
            const accountResponse = await callBlurtApi('get_accounts', [[username]]);
            
            if (!accountResponse.result || accountResponse.result.length === 0) {
                throw new Error('User not found');
            }
            
            const user = accountResponse.result[0];
            
            // Fetch additional data in parallel
            const [posts, followCount] = await Promise.all([
                fetchUserPosts(username),
                callBlurtApi('get_follow_count', [username])
            ]);
            
            displayUserProfile(user, posts, followCount.result);
            
        } catch (error) {
            console.error('Error fetching user profile:', error);
            elements.userProfileContent.innerHTML = `
                <div class="alert alert-danger">
                    Error loading profile: ${error.message || 'Unknown error'}
                    <br><small>Please check the username and try again</small>
                </div>
            `;
        } finally {
            elements.userProfileLoading.style.display = 'none';
            elements.userProfileContent.style.display = 'block';
        }
    }

    // Fetch user's posts
    async function fetchUserPosts(username) {
        try {
            const response = await callBlurtApi('get_discussions_by_author_before_date', [
                username, '', '2030-01-01T00:00:00', 5
            ]);
            return response.result || [];
        } catch (error) {
            console.error('Error fetching user posts:', error);
            return [];
        }
    }

    // Display user profile
    function displayUserProfile(user, posts, followCount) {
        const metadata = user.json_metadata ? 
            (typeof user.json_metadata === 'string' ? 
                JSON.parse(user.json_metadata) : 
                user.json_metadata) : 
            {};
        
        const profile = metadata.profile || {};
        
        elements.userProfileContent.innerHTML = `
            <div class="row">
                <div class="col-md-4 text-center">
                    <img src="${profile.profile_image || `https://images.blurt.blog/u/${user.name}/avatar/medium`}" 
                         alt="${user.name}" class="modal-profile-img" 
                         onerror="this.src='${config.defaultAvatar}'">
                    <h4>@${user.name}</h4>
                    
                    ${profile.about ? `<p class="text-muted">${profile.about}</p>` : ''}
                    ${profile.location ? `<p><i class="fas fa-map-marker-alt me-2"></i>${profile.location}</p>` : ''}
                    
                    <div class="d-flex justify-content-center gap-4 my-3">
                        <div class="text-center">
                            <div class="h5">${followCount.follower_count || 0}</div>
                            <small>Followers</small>
                        </div>
                        <div class="text-center">
                            <div class="h5">${followCount.following_count || 0}</div>
                            <small>Following</small>
                        </div>
                    </div>
                    
                    ${profile.website ? `
                        <a href="${profile.website}" class="btn btn-outline-primary btn-sm" target="_blank">
                            <i class="fas fa-globe me-1"></i> Website
                        </a>
                    ` : ''}
                </div>
                <div class="col-md-8">
                    <h5 class="mb-3">Recent Posts</h5>
                    
                    ${posts.length > 0 ? `
                        <div class="list-group">
                            ${posts.map(post => `
                                <a href="https://blurt.blog/${post.url}" class="list-group-item list-group-item-action" target="_blank">
                                    <div class="d-flex w-100 justify-content-between">
                                        <h6 class="mb-1">${post.title || 'Untitled Post'}</h6>
                                        <small>${new Date(post.created).toLocaleDateString()}</small>
                                    </div>
                                    <small class="text-muted">
                                        <i class="fas fa-heart text-danger"></i> ${post.active_votes.length} | 
                                        <i class="fas fa-comment text-primary"></i> ${post.children} | 
                                        ${parseFloat(post.pending_payout_value.split(' ')[0]).toFixed(2)} BLURT
                                    </small>
                                </a>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="alert alert-info">
                            No recent posts found for this user.
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    // Create post card element
    function createPostCard(post) {
        // Extract first image from body for thumbnail
        let imageUrl = '';
        const imgRegex = /<img[^>]+src="([^">]+)"/;
        const imgMatch = post.body.match(imgRegex);
        if (imgMatch && imgMatch[1]) {
            imageUrl = imgMatch[1];
        }
        
        // Format date
        const postDate = new Date(post.created);
        const formattedDate = postDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Format payout
        const payout = parseFloat(post.pending_payout_value.split(' ')[0]).toFixed(2);
        
        // Create card element
        const postCard = document.createElement('div');
        postCard.className = 'card post-card';
        
        postCard.innerHTML = `
            ${imageUrl ? `
                <img src="${imageUrl}" class="card-img-top post-image" alt="${post.title}"
                     onerror="this.style.display='none'">
            ` : ''}
            <div class="card-body">
                <h5 class="card-title">${post.title || 'Untitled Post'}</h5>
                <p class="card-text text-muted">${truncateText(removeMarkdown(post.body), 150)}</p>
                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center" style="cursor: pointer;" 
                         onclick="app.fetchUserProfile('${post.author}')">
                        <img src="https://images.blurt.blog/u/${post.author}/avatar" 
                             alt="${post.author}" class="author-img me-2" 
                             onerror="this.src='${config.smallAvatar}'">
                        <div>
                            <small class="d-block">${post.author}</small>
                            <small class="text-muted">${formattedDate}</small>
                        </div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-primary">${payout} BLURT</span>
                        <div class="vote-count">
                            <i class="fas fa-heart text-danger"></i> ${post.active_votes.length}
                            <i class="fas fa-comment text-primary ms-2"></i> ${post.children}
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-footer bg-white">
                <a href="https://blurt.blog/${post.url}" class="btn btn-sm btn-outline-primary" target="_blank">
                    Read More
                </a>
                <div class="float-end">
                    ${post.json_metadata.tags ? post.json_metadata.tags.slice(0, 3).map(tag => `
                        <span class="badge bg-light text-dark me-1">#${tag}</span>
                    `).join('') : ''}
                </div>
            </div>
        `;
        
        return postCard;
    }

    // Call Blurt API with CORS proxy
    async function callBlurtApi(method, params) {
        const requestData = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: 1
        };
        
        try {
            // First try direct API call
            const response = await fetch(config.blurtApi, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            // If direct call fails, try with CORS proxy
            const proxyUrl = `${config.corsProxy}${encodeURIComponent(config.blurtApi)}`;
            const proxyResponse = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (!proxyResponse.ok) {
                throw new Error(`API request failed with status ${proxyResponse.status}`);
            }
            
            return await proxyResponse.json();
            
        } catch (error) {
            console.error(`API call failed (${method}):`, error);
            throw error;
        }
    }

    // Helper functions
    function removeMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/[#*_`\[\]]/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n/g, ' ')
            .trim();
    }

    function truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function showErrorToast(message) {
        // Simple error display (could be enhanced with a proper toast library)
        const toast = document.createElement('div');
        toast.className = 'position-fixed bottom-0 end-0 p-3';
        toast.style.zIndex = '11';
        toast.innerHTML = `
            <div class="toast show" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header bg-danger text-white">
                    <strong class="me-auto">Error</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    // Make functions available globally for HTML onclick attributes
    window.app = {
        fetchUserProfile: fetchUserProfile
    };

    // Initialize the app
    init();
});
