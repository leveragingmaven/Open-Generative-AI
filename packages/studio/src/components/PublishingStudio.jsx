'use client';

import { useState, useEffect } from 'react';
import { PublishingCenterMVP } from '../lib/publishing/PublishingCenterMVP.js';
import { PublishingCenterUI } from '../lib/publishing/PublishingCenterUI.js';

export default function PublishingStudio({ apiKey, droppedFiles, onFilesHandled, onGenerationComplete, onGenerationError }) {
  const [container, setContainer] = useState(null);
  const [publishingCenter, setPublishingCenter] = useState(null);
  const [publishingCenterUI, setPublishingCenterUI] = useState(null);

  useEffect(() => {
    // Initialize the publishing center with localStorage
    const storage = localStorage;
    const center = new PublishingCenterMVP({ storage });
    setPublishingCenter(center);

    // Create a container div for the UI
    const containerDiv = document.createElement('div');
    containerDiv.className = 'h-full w-full';
    setContainer(containerDiv);
    
    // Initialize the UI - note: we don't set window variable anymore
    const ui = PublishingCenterUI.initPublishingCenter(containerDiv, { storage });
    setPublishingCenterUI(ui);
    
    return () => {
      if (containerDiv.parentNode) {
        containerDiv.parentNode.removeChild(containerDiv);
      }
    };
  }, []);

  useEffect(() => {
    if (container && publishingCenterUI) {
      // Render the UI
      container.innerHTML = '';
      container.appendChild(document.createElement('div')).className = 'h-full w-full';
      publishingCenterUI.container = container.firstChild;
      publishingCenterUI.render();
    }
  }, [container, publishingCenterUI]);

  // Enhanced error logging to capture full error details
  const enhancedOnGenerationError = (error) => {
    // Log the full error details for debugging
    if (error instanceof Error) {
      console.error('Publishing Studio Error:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
    } else if (error && typeof error === 'object') {
      console.error('Publishing Studio Error (Object):', {
        error: error,
        toString: error.toString ? error.toString() : 'No toString method',
        message: error.message || 'No message property'
      });
    } else {
      console.error('Publishing Studio Error (Unknown Type):', error);
    }
    
    // Call the original error handler
    if (onGenerationError) {
      onGenerationError(error);
    }
  };

  // Pass through the enhanced error handler to the UI components
  // This is a simplified approach - in reality, the error handling
  // in the UI components should be improved separately
  
  return (
    <div className="h-full w-full">
      {container}
    </div>
  );
}