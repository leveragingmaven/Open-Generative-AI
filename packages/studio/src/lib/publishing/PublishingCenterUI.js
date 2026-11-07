import { PersistentPublishingCenter } from "./PersistentPublishingCenter.js";

function escapeDraftText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Simple UI component for the Publishing Center MVP
export class PublishingCenterUI {
  constructor(container, options = {}) {
    this.container = container;
    this.publishingCenter = new PersistentPublishingCenter(options);
    this.render();
    void this.publishingCenter.refreshDrafts().then(() => this.renderDrafts()).catch(error => alert(error.message));
  }

  render() {
    // Check if we're in a browser environment
    if (typeof window === "undefined") {
      return;
    }
    
    this.container.innerHTML = `
      <div class="publishing-center-mvp">
        <h2>Publishing Center MVP</h2>
        
        <div class="section">
          <h3>Create New Draft</h3>
          <div id="asset-selection"></div>
        </div>
        
        <div class="section">
          <h3>Drafts</h3>
          <div id="drafts-list"></div>
        </div>
        
        <div class="section">
          <h3>History</h3>
          <div id="history-list"></div>
        </div>
      </div>
    `;
    
    this.renderAssetSelection();
    this.renderDrafts();
    this.renderHistory();
  }

  renderAssetSelection() {
    if (typeof window === "undefined") {
      return;
    }
    
    const assetContainer = this.container.querySelector('#asset-selection');
    const assets = this.publishingCenter.getAvailableAssets();
    
    if (assets.length === 0) {
      assetContainer.innerHTML = '<p>No assets available</p>';
      return;
    }
    
    const assetList = assets.map(asset => `
      <div class="asset-item" data-id="${asset.id}">
        <img src="${asset.url}" alt="${asset.title}" style="max-width: 100px; max-height: 100px;">
        <div>
          <strong>${asset.title}</strong>
          <p>${asset.description || ''}</p>
          <button onclick="window.publishingCenterUI.createDraft('${asset.id}')">Create Draft</button>
        </div>
      </div>
    `).join('');
    
    assetContainer.innerHTML = `
      <div class="assets-grid">${assetList}</div>
    `;
  }

  renderDrafts() {
    if (typeof window === "undefined") {
      return;
    }
    
    const draftsContainer = this.container.querySelector('#drafts-list');
    const drafts = this.publishingCenter.getDrafts();
    
    if (drafts.length === 0) {
      draftsContainer.innerHTML = '<p>No drafts available</p>';
      return;
    }
    
    const draftList = drafts.map(draft => {
      const encodedId = encodeURIComponent(draft.id).replaceAll("'", "%27");
      return `
      <div class="draft-item" data-id="${draft.id}">
        <h4>${escapeDraftText(draft.title || 'Untitled Draft')}</h4>
        <p>Assets: ${draft.assets.length}</p>
        <p>Platforms: ${escapeDraftText(draft.platforms.join(', ') || 'None')}</p>
        <p>Status: ${draft.status}</p>
        <div class="draft-actions">
          <button onclick="window.publishingCenterUI.scheduleDraft(decodeURIComponent('${encodedId}'))">Schedule</button>
          <button onclick="window.publishingCenterUI.publishDraft(decodeURIComponent('${encodedId}'))">Publish Now</button>
          <button onclick="window.publishingCenterUI.deleteDraft(decodeURIComponent('${encodedId}'))">Delete</button>
        </div>
      </div>
      `;
    }).join('');
    
    draftsContainer.innerHTML = `
      <div class="drafts-grid">${draftList}</div>
    `;
  }

  renderHistory() {
    if (typeof window === "undefined") {
      return;
    }
    
    const historyContainer = this.container.querySelector('#history-list');
    const history = this.publishingCenter.getHistory();
    
    if (history.length === 0) {
      historyContainer.innerHTML = '<p>No publishing history</p>';
      return;
    }
    
    const historyItems = history.slice(0, 10).map(item => `
      <div class="history-item" data-id="${item.id}">
        <h4>${item.id}</h4>
        <p>Status: ${item.status}</p>
        <p>Platforms: ${item.platforms.join(', ') || 'None'}</p>
        <p>Updated: ${item.updatedAt}</p>
      </div>
    `).join('');
    
    historyContainer.innerHTML = `
      <div class="history-grid">${historyItems}</div>
    `;
  }

  async createDraft(assetId) {
    if (typeof window === "undefined") {
      return;
    }
    
    const assets = this.publishingCenter.getAvailableAssets();
    const asset = assets.find(a => a.id === assetId);
    
    if (asset) {
      try {
        const draft = await this.publishingCenter.persistDraftFromAsset(asset);
        alert(`Created draft: ${draft.id}`);
        this.render();
      } catch (error) {
        alert(error.message);
      }
    }
  }

  scheduleDraft(draftId) {
    if (typeof window === "undefined") {
      return;
    }
    
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    
    const center = this.publishingCenter;
    center.runDraftAction(() => center.scheduleDraft(draftId, future.toISOString()), center.getDrafts().find(draft => draft.id === draftId))
      .then(result => {
        alert(`Scheduled draft: ${result.id}`);
        this.render();
      })
      .catch(error => {
        alert(`Error scheduling: ${error.message}`);
      });
  }

  publishDraft(draftId) {
    if (typeof window === "undefined") {
      return;
    }
    
    const center = this.publishingCenter;
    center.runDraftAction(() => center.publishDraft(draftId), center.getDrafts().find(draft => draft.id === draftId))
      .then(result => {
        alert(`Published draft: ${result.id}`);
        this.render();
      })
      .catch(error => {
        alert(`Error publishing: ${error.message}`);
      });
  }

  async deleteDraft(draftId) {
    if (typeof window === "undefined") {
      return;
    }
    
    if (confirm('Are you sure you want to delete this draft?')) {
      const center = this.publishingCenter;
      try {
        await center.runDraftAction(() => center.deleteDraft(draftId), center.getDrafts().find(draft => draft.id === draftId));
        this.render();
      } catch (error) {
        alert(error.message);
      }
    }
  }
}

// Export the init function instead of setting global variables
export function initPublishingCenter(container, options = {}) {
  if (typeof window === "undefined") {
    return null;
  }
  
  const ui = new PublishingCenterUI(container, options);
  // Don't set global window variable - return the instance instead
  return ui;
}