javascript
document.addEventListener('DOMContentLoaded', function() {
    // Global variables
    let currentTag = '';
    let isLoading = false;
    let startAuthor = '';
    let startPermlink = '';
    let hasMorePosts = true;

    // Initialize the page
    fetchTrendingTags();
    fetchPosts();

    // Search functionality
    document.getElementById('searchButton').addEventListener('click', function() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (searchTerm) {
            currentTag = searchTerm;
            document.getElementById('postsContainer').innerHTML = '';
            startAuthor = '';
            startPermlink = '';
            hasMorePosts = true;
            fetchPosts();
        }
    });

    // Infinite scroll
    window.addEventListener('scroll', function() {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            if (!isLoading && hasMorePosts) {
                fetchPosts();
            }
        }
    });

    // Fetch trending tags
    function fetchTrendingTags() {
        fetch('https://api.blurt.blog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'get_trending_tags',
                params: ['', 20],
                id: 1
            })
        })
        .then(response => response.json())
        .then(data => {
            const tagsContainer = document.getElementById('trendingTags');
            tagsContainer.innerHTML = '';
            
            data.result.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'tag';
                tagElement.textContent = tag.name;
                tagElement.style.cursor = 'pointer';
                tagElement.addEventListener('click', function() {
                    currentTag = tag.name;
                    document.getElementById('postsContainer').innerHTML = '';
                    startAuthor = '';
                    startPermlink = '';
                    hasMorePosts = true;
                    fetchPosts();
                });
                tagsContainer.appendChild(tagElement);
            });
        })
        .catch(error => console.error('Error fetching trending tags:', error));
    }

    // Fetch posts
    function fetchPosts() {
        if (isLoading) return;
        
        isLoading = true;
        document.getElementById('loadingSpinner').style.display = 'block';
        
        const method = currentTag ? 'get_discussions_by_created' : 'get_discussions_by_created';
        const params = currentTag ? 
            [currentTag, {limit: 10, start_author: startAuthor, start_permlink: startPermlink}] : 
            [{limit: 10, start_author: startAuthor, start_permlink: startPermlink}];
        
        fetch('https://api.blurt.blog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: method,
                params: params,
                id: 1
            })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.result || data.result.length === 0) {
                hasMorePosts = false;
                return;
            }
            
            const postsContainer = document.getElementById('postsContainer');
            
            data.result.forEach(post => {
                const postElement = createPostCard(post);
                postsContainer.appendChild(postElement);
            });
            
            // Update pagination markers
            const lastPost = data.result[data.result.length - 1];
            startAuthor = lastPost.author;
            startPermlink = lastPost.permlink;
        })
        .catch(error => console.error('Error fetching posts:', error))
        .finally(() => {
            isLoading = false;
            document.getElementById('loadingSpinner').style.display = 'none';
        });
    }

    // Create post card element
    function createPostCard(post) {
        const postCard = document.createElement('div');
        postCard.className = 'card post-card mb-4';
        
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
            month: 'long',
            day: 'numeric'
        });
        
        // Format payout
        const payout = parseFloat(post.pending_payout_value.split(' ')[0]).toFixed(2);
        
        // Create card HTML
        postCard.innerHTML = `
            ${imageUrl ? `
            <img src="${imageUrl}" class="card-img-top post-image" alt="${post.title}">
            ` : ''}
            <div class="card-body">
                <h5 class="card-title">${post.title}</h5>
                <p class="card-text text-muted">${truncateText(removeMarkdown(post.body), 150)}</p>
                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center">
                        <img src="https://images.blurt.blog/u/${post.author}/avatar" alt="${post.author}" 
                             class="author-img me-2" onerror="this.src='https://via.placeholder.com/40'">
                        <div>
                            <small class="d-block">${post.author}</small>
                            <small class="text-muted">${formattedDate}</small>
                        </div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-primary">${payout} BLURT</span>
                        <div>
                            <small class="text-muted">
                                <i class="fas fa-heart"></i> ${post.active_votes.length}
                                <i class="fas fa-comment ms-2"></i> ${post.children}
                            </small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-footer bg-white">
                <a href="https://blurt.blog/${post.url}" class="btn btn-sm btn-outline-primary" target="_blank">Read More</a>
                <small class="text-muted float-end">
                    ${post.json_metadata.tags ? post.json_metadata.tags.slice(0, 3).map(tag => 
                        `<span class="badge bg-light text-dark me-1">#${tag}</span>`
                    ).join('') : ''}
                </small>
            </div>
        `;
        
        return postCard;
    }

    // Helper function to remove markdown
    function removeMarkdown(text) {
        return text.replace(/[#*_`\[\]]/g, '');
    }

    // Helper function to truncate text
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
});