/**
 * Loading Screen Test
 * 
 * Purpose: Prevent regression of the loading screen bug where text appears on top of spinner
 * Bug: "Loading OrderNimbus..." text was showing on top of the spinner
 * Fix: Removed all text from loading screen, only show spinner
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('Loading Screen Bug Prevention', () => {
  const appTsxPath = path.join(__dirname, '../../app/frontend/src/App.tsx');
  const appCssPath = path.join(__dirname, '../../app/frontend/src/App.css');

  it('should not contain "Loading OrderNimbus" text in App.tsx', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf8');
    
    // Check that the loading text has been removed
    expect(appContent).to.not.include('Loading OrderNimbus');
    expect(appContent).to.not.include('<p>Loading');
    
    // Ensure the loading container still exists
    expect(appContent).to.include('loading-container');
    expect(appContent).to.include('loading-spinner');
    expect(appContent).to.include('spinner');
  });

  it('should have preventive comment in loading section', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf8');
    
    // Check for the preventive comment
    expect(appContent).to.include('IMPORTANT: Only show spinner, no text');
    expect(appContent).to.include('DO NOT add any <p> or text elements here');
  });

  it('should not have loading text paragraph styles in CSS', () => {
    const cssContent = fs.readFileSync(appCssPath, 'utf8');
    
    // Check that the paragraph style for loading text has been removed
    expect(cssContent).to.not.include('.loading-spinner p {');
    
    // Ensure the spinner styles still exist
    expect(cssContent).to.include('.loading-spinner');
    expect(cssContent).to.include('.spinner');
    expect(cssContent).to.include('@keyframes spin');
  });

  it('should have correct loading spinner structure', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf8');
    
    // Extract the loading section (only the JSX part, not comments)
    const loadingMatch = appContent.match(/return \(\s*<div className="loading-container">[\s\S]*?<\/div>\s*\)/);
    expect(loadingMatch).to.not.be.null;
    
    const loadingJSX = loadingMatch[0];
    
    // Check structure: container > spinner wrapper > spinner only
    expect(loadingJSX).to.include('loading-container');
    expect(loadingJSX).to.include('loading-spinner');
    expect(loadingJSX).to.include('spinner');
    
    // Ensure no paragraph or text elements in JSX
    expect(loadingJSX).to.not.match(/<p>/);
    expect(loadingJSX).to.not.match(/<p\s[^>]*>/);
    expect(loadingJSX).to.not.match(/<span[^>]*>.*Loading/i);
    expect(loadingJSX).to.not.match(/<h[1-6][^>]*>/);
    
    // Count div elements - should only be 3 (container, spinner wrapper, spinner)
    const divCount = (loadingJSX.match(/<div/g) || []).length;
    expect(divCount).to.equal(3);
  });
});