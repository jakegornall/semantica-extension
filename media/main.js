(function() {
    const vscode = acquireVsCodeApi();
    let currentVersion = '';
    let currentView = 'chunks';

    // Initialize
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('Received message:', message); // Debug log

        switch (message.command) {
            case 'versions':
                renderVersionTabs(message.data);
                renderViewTabs();
                if (message.data.length > 0) {
                    selectVersion(message.data[0]);
                }
                break;

            case 'chunks':
                if (message.data) {
                    updateVersionTabStatus(message.version, message.data);
                    if (message.version === currentVersion) {
                        renderChunks(message.data);
                    }
                }
                break;

            case 'reasoning':
                if (message.version === currentVersion) {
                    renderReasoning(message.data);
                }
                break;

            case 'refreshChunks':
                if (message.version === currentVersion) {
                    renderChunks(message.chunks);
                }
                updateVersionTabStatus(message.version, message.chunks);
                break;
        }
    });

    // Initialize by requesting versions
    vscode.postMessage({ command: 'getVersions' });

    function renderVersionTabs(versions) {
        const container = document.getElementById('version-tabs');
        container.innerHTML = versions.map(version => `
            <button class="version-tab" data-version="${version}">
                ${version}
                <span class="approval-indicator"></span>
            </button>
        `).join('');

        // Update approval status for each version tab
        versions.forEach(version => {
            vscode.postMessage({ 
                command: 'getChunks',
                version: version
            });
        });

        container.addEventListener('click', e => {
            if (e.target.classList.contains('version-tab')) {
                selectVersion(e.target.dataset.version);
            }
        });
    }

    function selectVersion(version) {
        currentVersion = version;
        document.querySelectorAll('.version-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.version === version);
        });
        refreshView();
    }

    function showEditForm(chunk, index) {
        const chunkCard = document.querySelector(`[data-index="${index}"]`);
        const editButton = chunkCard.querySelector('.edit-chunk');
        
        // If already in edit mode, return
        if (chunkCard.classList.contains('editing')) {
            return;
        }

        // Mark as editing
        chunkCard.classList.add('editing');
        editButton.disabled = true;

        const form = document.createElement('div');
        form.innerHTML = `
            <div class="chunk-field">
                <label>Title</label>
                <input type="text" class="chunk-title" value="${chunk.title}">
            </div>
            <div class="chunk-field">
                <label>Description</label>
                <textarea class="chunk-description">${chunk.description}</textarea>
            </div>
            <div class="chunk-field">
                <label>Tags (comma-separated)</label>
                <input type="text" class="chunk-tags" value="${chunk.tags.join(', ')}">
            </div>
            ${chunk.examples ? chunk.examples.map((example, exampleIndex) => `
                <div class="chunk-field example-edit">
                    <label>Example ${exampleIndex + 1} Code</label>
                    <textarea class="example-code">${example.code}</textarea>
                    <label>Example ${exampleIndex + 1} Explanation</label>
                    <textarea class="example-explanation">${example.explanation}</textarea>
                </div>
            `).join('') : ''}
            <button class="button save-changes">Save Changes</button>
            <button class="button cancel-edit">Cancel</button>
        `;

        const chunkContent = chunkCard.querySelector('.chunk-content');
        const originalContent = chunkContent.innerHTML;
        chunkContent.innerHTML = '';
        chunkContent.appendChild(form);

        function exitEditMode() {
            chunkContent.innerHTML = originalContent;
            chunkCard.classList.remove('editing');
            editButton.disabled = false;
        }

        // Add event listeners using event delegation
        chunkContent.addEventListener('click', (e) => {
            if (e.target.classList.contains('save-changes')) {
                e.preventDefault();
                const updatedChunk = {
                    ...chunk,
                    title: form.querySelector('.chunk-title').value,
                    description: form.querySelector('.chunk-description').value,
                    tags: form.querySelector('.chunk-tags').value.split(',').map(tag => tag.trim())
                };

                // Update examples if they exist
                if (chunk.examples) {
                    updatedChunk.examples = Array.from(form.querySelectorAll('.example-edit')).map((exampleEdit, i) => ({
                        code: exampleEdit.querySelector('.example-code').value,
                        explanation: exampleEdit.querySelector('.example-explanation').value
                    }));
                }

                const message = {
                    command: 'semantica-extension.updateChunk',
                    chunkIndex: index,
                    version: currentVersion,
                    chunk: updatedChunk
                };
                console.log('Sending update message:', message);
                vscode.postMessage(message);
                exitEditMode();
            } else if (e.target.classList.contains('cancel-edit')) {
                exitEditMode();
            }
        });
    }

    function renderChunks(chunks) {
        const container = document.getElementById('chunks-container');
        container.innerHTML = chunks.map((chunk, index) => `
            <div class="chunk-card" data-index="${index}">
                <div class="chunk-header">
                    <div class="chunk-title">${chunk.title}</div>
                    <div class="chunk-actions">
                        <button class="button approve-chunk ${chunk.approved ? 'approved' : ''}" title="${chunk.approved ? 'Approved' : 'Not approved'}">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" fill="currentColor"/>
                            </svg>
                        </button>
                        <button class="button edit-chunk">Edit</button>
                        <button class="button delete delete-chunk">Delete</button>
                    </div>
                </div>
                <div class="chunk-content">
                    <div class="chunk-field">
                        <label>Description</label>
                        <div>${chunk.description}</div>
                    </div>
                    <div class="chunk-field">
                        <label>Tags</label>
                        <div>${chunk.tags.join(', ')}</div>
                    </div>
                    ${renderExamples(chunk.examples)}
                </div>
            </div>
        `).join('');

        // Add event listeners
        document.querySelectorAll('.chunk-card').forEach(card => {
            const index = parseInt(card.dataset.index);
            const chunk = chunks[index];

            // Approve button listener
            card.querySelector('.approve-chunk').addEventListener('click', async () => {
                const updatedChunk = {
                    ...chunk,
                    approved: !chunk.approved
                };
                
                vscode.postMessage({
                    command: 'semantica-extension.updateChunk',
                    chunkIndex: index,
                    version: currentVersion,
                    chunk: updatedChunk
                });
            });

            // Edit button listener
            card.querySelector('.edit-chunk').addEventListener('click', () => {
                console.log('Edit button clicked for index:', index); // Debug log
                showEditForm(chunk, index);
            });

            // Delete button listener
            card.querySelector('.delete-chunk').addEventListener('click', (e) => {
                console.log('Delete button clicked for index:', index); // Debug log
                
                // if (confirm('Are you sure you want to delete this chunk?')) {
                    const message = {
                        command: 'deleteChunk',
                        params: {
                            chunkIndex: index,
                            version: currentVersion
                        }
                    };
                    console.log('Sending delete message:', message); // Debug log
                    vscode.postMessage(message);
                // }
            });
        });
    }

    function renderExamples(examples) {
        if (!examples || examples.length === 0) return '';
        
        return `
            <div class="chunk-field">
                <label>Examples</label>
                ${examples.map(example => `
                    <div class="example">
                        <pre>${example.code}</pre>
                        <div class="example-explanation">${example.explanation}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Add this new function to handle version tab updates
    function updateVersionTabStatus(version, chunks) {
        const tab = document.querySelector(`.version-tab[data-version="${version}"]`);
        if (tab) {
            const isApproved = chunks.every(chunk => chunk.approved);
            tab.classList.toggle('all-approved', isApproved);
        }
    }

    function renderViewTabs() {
        const container = document.getElementById('view-tabs');
        container.innerHTML = `
            <div class="view-tabs">
                <button class="view-tab ${currentView === 'chunks' ? 'active' : ''}" data-view="chunks">Chunks</button>
                <button class="view-tab ${currentView === 'reasoning' ? 'active' : ''}" data-view="reasoning">Reasoning</button>
            </div>
        `;

        container.addEventListener('click', e => {
            if (e.target.classList.contains('view-tab')) {
                currentView = e.target.dataset.view;
                document.querySelectorAll('.view-tab').forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.view === currentView);
                });
                refreshView();
            }
        });
    }

    function refreshView() {
        if (currentView === 'chunks') {
            document.getElementById('chunks-container').style.display = 'block';
            document.getElementById('reasoning-container').style.display = 'none';
            vscode.postMessage({ command: 'getChunks', version: currentVersion });
        } else {
            document.getElementById('chunks-container').style.display = 'none';
            document.getElementById('reasoning-container').style.display = 'block';
            vscode.postMessage({ command: 'getReasoning', version: currentVersion });
        }
    }

    function renderReasoning(reasoning) {
        const container = document.getElementById('reasoning-container');
        container.innerHTML = `
            <div class="reasoning-card">
                <div class="reasoning-header">
                    <h3>Reasoning and Planning</h3>
                    <button class="button edit-reasoning">Edit</button>
                </div>
                <div class="reasoning-content">
                    ${reasoning.map(item => `
                        <div class="reasoning-item">${item}</div>
                    `).join('')}
                </div>
            </div>
        `;

        container.querySelector('.edit-reasoning').addEventListener('click', () => {
            showReasoningEditForm(reasoning);
        });
    }

    function showReasoningEditForm(reasoning) {
        const container = document.getElementById('reasoning-container');
        const form = document.createElement('div');
        form.innerHTML = `
            <div class="reasoning-edit-form">
                <div class="reasoning-items-edit">
                    ${reasoning.map((item, index) => `
                        <div class="reasoning-item-edit">
                            <div class="reasoning-item-header">
                                <label>Reasoning Step ${index + 1}</label>
                                <button class="button delete-reason" data-index="${index}">Delete</button>
                            </div>
                            <textarea class="reasoning-item-textarea">${item}</textarea>
                        </div>
                    `).join('')}
                </div>
                <button class="button add-reason">+ Add Reasoning Step</button>
                <div class="button-group">
                    <button class="button save-reasoning">Save Changes</button>
                    <button class="button cancel-reasoning">Cancel</button>
                </div>
            </div>
        `;

        const originalContent = container.innerHTML;
        container.innerHTML = '';
        container.appendChild(form);

        // Add new reasoning step
        form.querySelector('.add-reason').addEventListener('click', () => {
            const newItem = document.createElement('div');
            newItem.className = 'reasoning-item-edit';
            const itemsCount = form.querySelectorAll('.reasoning-item-edit').length;
            newItem.innerHTML = `
                <div class="reasoning-item-header">
                    <label>Reasoning Step ${itemsCount + 1}</label>
                    <button class="button delete-reason" data-index="${itemsCount}">Delete</button>
                </div>
                <textarea class="reasoning-item-textarea"></textarea>
            `;
            form.querySelector('.reasoning-items-edit').appendChild(newItem);
        });

        // Delete reasoning step
        form.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-reason')) {
                const itemToDelete = e.target.closest('.reasoning-item-edit');
                itemToDelete.remove();
                // Renumber the remaining items
                form.querySelectorAll('.reasoning-item-edit').forEach((item, idx) => {
                    item.querySelector('label').textContent = `Reasoning Step ${idx + 1}`;
                    item.querySelector('.delete-reason').dataset.index = idx;
                });
            }
        });

        // Save changes
        form.querySelector('.save-reasoning').addEventListener('click', () => {
            const updatedReasoning = Array.from(form.querySelectorAll('.reasoning-item-textarea'))
                .map(textarea => textarea.value.trim())
                .filter(text => text !== '');

            vscode.postMessage({
                command: 'updateReasoning',
                version: currentVersion,
                reasoning: updatedReasoning
            });

            container.innerHTML = originalContent;
        });

        form.querySelector('.cancel-reasoning').addEventListener('click', () => {
            container.innerHTML = originalContent;
        });
    }

    // Update the HTML template in _getHtmlForWebview
    function getHtmlForWebview() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <!-- existing head content -->
            </head>
            <body>
                <div id="versions-container">
                    <div id="version-tabs"></div>
                </div>
                <div id="view-tabs"></div>
                <div id="chunks-container"></div>
                <div id="reasoning-container" style="display: none;"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
})(); 